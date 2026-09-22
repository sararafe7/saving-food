-- Step 7 — Account deactivation. Switching an account off keeps its row and all
-- of its history (past reports, past deliveries); it only removes the account's
-- permissions and its ability to use the app.
-- Run once, after 20260919100300.

begin;

-- ---------------------------------------------------------------------------
-- Coordinators get the same "active" flag food sources and workers already have.
-- ---------------------------------------------------------------------------
alter table public.coordinators add column active boolean not null default true;

-- Who switched the account off, and when. user_roles holds exactly one row per
-- account, so this is the account-level record. deactivated_by = user_id means
-- the person did it themselves — that is what the coordinator dashboard lists.
alter table public.user_roles
  add column deactivated_at timestamptz,
  add column deactivated_by uuid references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- A deactivated account loses every permission at once: has_role() is the
-- single gate that every policy and every security-definer function already
-- passes through. The only things still reachable are the account's own
-- profile row (so it can be told why it is locked out) and my_account().
-- ---------------------------------------------------------------------------
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = _user_id
      and r.role = _role
      and r.approved
      and case r.role
        when 'coordinator' then
          coalesce((select c.active from public.coordinators c where c.user_id = r.user_id), true)
        when 'source' then
          coalesce((select s.active from public.food_sources s where s.user_id = r.user_id), true)
        else
          coalesce((select w.active from public.delivery_workers w where w.user_id = r.user_id), true)
      end
  )
$$;

-- The signed-in account's own status. The app reads this on every page load to
-- decide between the role's home screen, the pending screen and the
-- "account deactivated" screen.
create function public.my_account()
returns table (role public.app_role, approved boolean, active boolean, name text)
language sql stable security definer set search_path = public as $$
  select
    r.role,
    r.approved,
    coalesce(c.active, s.active, w.active, true),
    coalesce(c.name, s.name, w.name)
  from public.user_roles r
  left join public.coordinators c on c.user_id = r.user_id and r.role = 'coordinator'
  left join public.food_sources s on s.user_id = r.user_id and r.role = 'source'
  left join public.delivery_workers w on w.user_id = r.user_id and r.role = 'worker'
  where r.user_id = auth.uid()
$$;
revoke all on function public.my_account() from public, anon;
grant execute on function public.my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Deactivation
-- ---------------------------------------------------------------------------

-- Tasks that have left the food source but have not been delivered yet.
-- Switching either side off while one is in flight would strand it.
create function public.open_task_count(_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.surplus_posts p
  where p.status in ('assigned', 'picked_up')
    and (
      p.source_id in (select s.id from public.food_sources s where s.user_id = _user_id)
      or p.worker_id in (select w.id from public.delivery_workers w where w.user_id = _user_id)
    )
$$;
revoke all on function public.open_task_count(uuid) from public, anon;
grant execute on function public.open_task_count(uuid) to authenticated;

-- Shared by deactivate_account() and reactivate_account(); not callable directly.
create function public.set_account_active(_user_id uuid, _active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  _self boolean;
  _role public.app_role;
  _open integer;
begin
  if auth.uid() is null then
    raise exception 'يجب تسجيل الدخول';
  end if;
  if _user_id is null then
    raise exception 'الحساب غير موجود';
  end if;
  _self := _user_id = auth.uid();

  select r.role into _role from public.user_roles r where r.user_id = _user_id for update;
  if not found then
    raise exception 'الحساب غير موجود';
  end if;

  if not _self and not public.has_role(auth.uid(), 'coordinator') then
    raise exception 'هذه الصلاحية للمنسّقين فقط';
  end if;

  if _active then
    -- Switching an account back on is a coordinator decision, never the
    -- locked-out account's own (it has no permissions left anyway).
    if _self then
      raise exception 'تواصل مع أحد المنسّقين لإعادة تفعيل حسابك';
    end if;
  else
    -- Out of scope for now: a coordinator may only switch off their own account.
    if not _self and _role = 'coordinator' then
      raise exception 'لا يمكن تعطيل حساب منسّق آخر';
    end if;

    -- Someone has to stay behind to approve and reactivate accounts.
    if _role = 'coordinator' and not exists (
      select 1 from public.user_roles r2
      where r2.role = 'coordinator'
        and r2.approved
        and r2.user_id <> _user_id
        and coalesce((select c.active from public.coordinators c where c.user_id = r2.user_id), true)
    ) then
      raise exception 'لا يمكن تعطيل آخر حساب منسّق نشط — رقِّ منسّقًا آخر أولًا';
    end if;

    _open := public.open_task_count(_user_id);
    if _open > 0 then
      raise exception 'لا يمكن تعطيل الحساب: لديه % مهمة جارية (مُسندة أو تم استلامها). أعد إسنادها لغيره أو انتظر حتى تصل حالتها إلى «تم التوصيل».', _open;
    end if;
  end if;

  if _role = 'coordinator' then
    update public.coordinators set active = _active where user_id = _user_id;
  elsif _role = 'source' then
    update public.food_sources set active = _active where user_id = _user_id;
  else
    update public.delivery_workers set active = _active where user_id = _user_id;
  end if;

  update public.user_roles set
    deactivated_at = case when _active then null else now() end,
    deactivated_by = case when _active then null else auth.uid() end
  where user_id = _user_id;
end; $$;
revoke all on function public.set_account_active(uuid, boolean) from public, anon, authenticated;

-- Own account (any role), or a food source / delivery worker if the caller is a coordinator.
create function public.deactivate_account(_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.set_account_active(_user_id, false);
end; $$;
revoke all on function public.deactivate_account(uuid) from public, anon;
grant execute on function public.deactivate_account(uuid) to authenticated;

-- Coordinators only, and never on one's own account.
create function public.reactivate_account(_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.set_account_active(_user_id, true);
end; $$;
revoke all on function public.reactivate_account(uuid) from public, anon;
grant execute on function public.reactivate_account(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Coordinator views
-- ---------------------------------------------------------------------------

-- Accounts that switched themselves off, newest first — the dashboard notice.
create function public.recent_self_deactivations()
returns table (
  user_id uuid,
  email text,
  name text,
  role public.app_role,
  deactivated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    r.user_id,
    u.email::text,
    coalesce(c.name, s.name, w.name),
    r.role,
    r.deactivated_at
  from public.user_roles r
  join auth.users u on u.id = r.user_id
  left join public.coordinators c on c.user_id = r.user_id and r.role = 'coordinator'
  left join public.food_sources s on s.user_id = r.user_id and r.role = 'source'
  left join public.delivery_workers w on w.user_id = r.user_id and r.role = 'worker'
  where public.has_role(auth.uid(), 'coordinator')
    and r.deactivated_at is not null
    and r.deactivated_by = r.user_id
    and r.deactivated_at > now() - interval '30 days'
  order by r.deactivated_at desc
$$;
revoke all on function public.recent_self_deactivations() from public, anon;
grant execute on function public.recent_self_deactivations() to authenticated;

-- Recreated to report the coordinator "active" flag and when an account was
-- switched off. (Adding return columns needs a drop, not a replace.)
drop function public.list_accounts();
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
  active boolean,
  deactivated_at timestamptz,
  deactivated_by_self boolean,
  open_tasks integer
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
    coalesce(c.active, s.active, w.active, true),
    r.deactivated_at,
    r.deactivated_by = r.user_id,
    public.open_task_count(r.user_id)
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

commit;
