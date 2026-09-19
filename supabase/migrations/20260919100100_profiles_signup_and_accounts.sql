-- Step 3 — Profile fields, sign-up handled in the database (first account becomes
-- the founding coordinator), and coordinator account management.
-- Run once, after 20260919100000.

begin;

-- ---------------------------------------------------------------------------
-- Profile fields
-- ---------------------------------------------------------------------------
alter table public.food_sources
  add column phone text,
  add column area text,
  add column lat double precision,
  add column lng double precision,
  add constraint food_sources_coords_check check (
    (lat is null) = (lng is null) and (lat is null or (lat between -90 and 90 and lng between -180 and 180))
  );

alter table public.delivery_workers add column area text;

-- neighborhood is the general area a worker may see before claiming a task.
alter table public.families
  add column neighborhood text,
  add column lat double precision,
  add column lng double precision,
  add constraint families_coords_check check (
    (lat is null) = (lng is null) and (lat is null or (lat between -90 and 90 and lng between -180 and 180))
  );

-- Profiles are created only by sign-up / account functions; users may edit
-- their own descriptive fields but never their "active" flag.
drop policy if exists "source inserts own profile" on public.food_sources;
drop policy if exists "worker inserts own profile" on public.delivery_workers;
revoke insert, update on public.food_sources from authenticated;
grant update (name, type, address, phone, area, lat, lng) on public.food_sources to authenticated;
revoke insert, update on public.delivery_workers from authenticated;
grant update (name, phone, area) on public.delivery_workers to authenticated;
revoke update on public.coordinators from authenticated;
grant update (name, org) on public.coordinators to authenticated;

-- ---------------------------------------------------------------------------
-- Registration helpers (internal — not callable by clients)
-- ---------------------------------------------------------------------------
create function public.create_profile(_user_id uuid, _role public.app_role, _meta jsonb, _fallback_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  _name text := left(coalesce(nullif(btrim(_meta->>'name'), ''), _fallback_name), 120);
  _phone text := left(nullif(btrim(_meta->>'phone'), ''), 40);
  _area text := left(nullif(btrim(_meta->>'area'), ''), 120);
  _lat double precision;
  _lng double precision;
begin
  if (_meta->>'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' and (_meta->>'lng') ~ '^-?[0-9]+(\.[0-9]+)?$' then
    _lat := (_meta->>'lat')::double precision;
    _lng := (_meta->>'lng')::double precision;
    if abs(_lat) > 90 or abs(_lng) > 180 then
      _lat := null;
      _lng := null;
    end if;
  end if;

  if _role = 'coordinator' then
    insert into public.coordinators (user_id, name, org)
    values (_user_id, _name, left(nullif(btrim(_meta->>'org'), ''), 160))
    on conflict (user_id) do nothing;
  elsif _role = 'source' then
    insert into public.food_sources (user_id, name, type, address, phone, area, lat, lng)
    values (
      _user_id,
      _name,
      case when _meta->>'type' in ('restaurant', 'bakery', 'grocery', 'other')
        then (_meta->>'type')::public.source_type else 'other' end,
      left(coalesce(nullif(btrim(_meta->>'address'), ''), '—'), 300),
      _phone, _area, _lat, _lng
    )
    on conflict (user_id) do nothing;
  else
    insert into public.delivery_workers (user_id, name, phone, area)
    values (_user_id, _name, _phone, _area)
    on conflict (user_id) do nothing;
  end if;
end; $$;
revoke all on function public.create_profile(uuid, public.app_role, jsonb, text) from public, anon, authenticated;

-- Assigns the role (pending unless founding or pre-approved) and creates the profile.
-- The very first account — i.e. while no approved coordinator exists — becomes an
-- approved coordinator regardless of what it asked for.
create function public.register_user(_user_id uuid, _email text, _meta jsonb, _pre_approved boolean)
returns public.app_role language plpgsql security definer set search_path = public as $$
declare
  _requested text := _meta->>'role';
  _role public.app_role;
  _approved boolean := _pre_approved;
begin
  perform pg_advisory_xact_lock(hashtext('public.register_user'));

  if exists (select 1 from public.user_roles where user_id = _user_id) then
    raise exception 'الحساب مسجّل بالفعل';
  end if;

  if not exists (select 1 from public.user_roles where role = 'coordinator' and approved) then
    _role := 'coordinator';
    _approved := true;
  elsif _requested in ('coordinator', 'source', 'worker') then
    _role := _requested::public.app_role;
  else
    return null;
  end if;

  insert into public.user_roles (user_id, role, approved, approved_at)
  values (_user_id, _role, _approved, case when _approved then now() end);

  perform public.create_profile(_user_id, _role, _meta, split_part(coalesce(_email, ''), '@', 1));
  return _role;
end; $$;
revoke all on function public.register_user(uuid, text, jsonb, boolean) from public, anon, authenticated;

-- Sign-up: the form's profile fields travel as user metadata. Only the server
-- (service role) can set app_metadata.pre_approved, used by coordinator-created accounts.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.register_user(
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data, '{}'::jsonb),
    coalesce((new.raw_app_meta_data->>'pre_approved')::boolean, false)
  );
  return new;
end; $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Fallback for accounts that exist in auth but have no role (e.g. signed up
-- before this migration): the user completes the form and waits for approval.
create function public.complete_registration(_profile jsonb)
returns public.app_role language plpgsql security definer set search_path = public as $$
declare
  _role public.app_role;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;
  _role := public.register_user(
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    coalesce(_profile, '{}'::jsonb),
    false
  );
  if _role is null then
    raise exception 'اختر نوع الحساب';
  end if;
  return _role;
end; $$;
revoke all on function public.complete_registration(jsonb) from public, anon;
grant execute on function public.complete_registration(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Coordinator account management
-- ---------------------------------------------------------------------------
create function public.list_accounts()
returns table (
  user_id uuid,
  email text,
  role public.app_role,
  approved boolean,
  created_at timestamptz,
  name text,
  phone text,
  area text,
  org text,
  source_type public.source_type,
  address text,
  profile_id uuid,
  active boolean
)
language sql stable security definer set search_path = public as $$
  select
    r.user_id,
    u.email::text,
    r.role,
    r.approved,
    r.created_at,
    coalesce(c.name, s.name, w.name),
    coalesce(s.phone, w.phone),
    coalesce(s.area, w.area),
    c.org,
    s.type,
    s.address,
    coalesce(c.id, s.id, w.id),
    coalesce(s.active, w.active, true)
  from public.user_roles r
  join auth.users u on u.id = r.user_id
  left join public.coordinators c on c.user_id = r.user_id and r.role = 'coordinator'
  left join public.food_sources s on s.user_id = r.user_id and r.role = 'source'
  left join public.delivery_workers w on w.user_id = r.user_id and r.role = 'worker'
  where public.has_role(auth.uid(), 'coordinator')
  order by r.approved, r.created_at desc
$$;
revoke all on function public.list_accounts() from public, anon;
grant execute on function public.list_accounts() to authenticated;

create function public.approve_account(_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'coordinator') then
    raise exception 'هذه الصلاحية للمنسّقين فقط';
  end if;
  update public.user_roles
  set approved = true, approved_at = now(), approved_by = auth.uid()
  where user_id = _user_id and not approved;
  if not found then
    raise exception 'الحساب غير موجود أو مفعّل بالفعل';
  end if;
end; $$;
revoke all on function public.approve_account(uuid) from public, anon;
grant execute on function public.approve_account(uuid) to authenticated;

-- Promotion replaces the account's role (one role per account). The old
-- source/worker profile is kept for history but deactivated.
create function public.promote_to_coordinator(_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  _current public.user_roles;
  _name text;
begin
  if not public.has_role(auth.uid(), 'coordinator') then
    raise exception 'هذه الصلاحية للمنسّقين فقط';
  end if;

  select * into _current from public.user_roles where user_id = _user_id for update;
  if not found or not _current.approved then
    raise exception 'يجب تفعيل الحساب قبل ترقيته';
  end if;
  if _current.role = 'coordinator' then
    raise exception 'الحساب منسّق بالفعل';
  end if;

  if _current.role = 'worker' and exists (
    select 1 from public.surplus_posts p
    join public.delivery_workers w on w.id = p.worker_id
    where w.user_id = _user_id and p.status in ('assigned', 'picked_up')
  ) then
    raise exception 'لدى عامل التوصيل مهام جارية — أعد إسنادها أولًا';
  end if;

  _name := coalesce(
    (select name from public.food_sources where user_id = _user_id),
    (select name from public.delivery_workers where user_id = _user_id),
    (select split_part(email, '@', 1) from auth.users where id = _user_id)
  );

  update public.user_roles
  set role = 'coordinator', approved_at = now(), approved_by = auth.uid()
  where user_id = _user_id;

  insert into public.coordinators (user_id, name) values (_user_id, _name)
  on conflict (user_id) do nothing;

  update public.food_sources set active = false where user_id = _user_id;
  update public.delivery_workers set active = false where user_id = _user_id;
end; $$;
revoke all on function public.promote_to_coordinator(uuid) from public, anon;
grant execute on function public.promote_to_coordinator(uuid) to authenticated;

commit;
