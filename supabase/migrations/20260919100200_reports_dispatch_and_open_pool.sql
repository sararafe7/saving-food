-- Steps 5–6 — Report privacy, area, open self-claim pool, and server-side status changes.
-- Run once, after 20260919100100.
--
-- Access model for surplus_posts after this migration:
--   * Coordinators: read all rows directly (RLS); change them only via coordinator_dispatch().
--   * Food sources: no direct table access. create_surplus_post() / my_source_posts()
--     expose only food + status columns — never family or destination data.
--   * Delivery workers: no direct table access. worker_open_pool() shows only the
--     neighborhood and an approximate distance; worker_tasks() shows the destination
--     (exact address, or the meeting point for confidential reports) only for their
--     own tasks. Workers never read the families table.

begin;

-- ---------------------------------------------------------------------------
-- Columns and constraints
-- ---------------------------------------------------------------------------
alter table public.surplus_posts
  add column area text,
  add column pickup_lat double precision,
  add column pickup_lng double precision,
  add column delivery_area text,
  add column delivery_lat double precision,
  add column delivery_lng double precision,
  add column claim_mode text;

comment on column public.surplus_posts.area is 'Pilot area, copied from the food source';
comment on column public.surplus_posts.delivery_area is 'Family neighborhood (non-confidential only), shown in the open pool';
comment on column public.surplus_posts.delivery_destination is 'Exact family address, or the meeting point for confidential reports';
comment on column public.surplus_posts.claim_mode is 'open = any worker in the area may claim; direct = coordinator assigned a worker';

update public.surplus_posts set claim_mode = 'direct' where worker_id is not null;
update public.surplus_posts p set area = s.area from public.food_sources s where s.id = p.source_id;

alter table public.surplus_posts
  add constraint surplus_posts_status_check
    check (status in ('posted', 'assigned', 'picked_up', 'delivered')),
  add constraint surplus_posts_claim_mode_check
    check (claim_mode in ('open', 'direct')),
  add constraint surplus_posts_confidential_never_open
    check (not (is_confidential and claim_mode = 'open'));

-- ---------------------------------------------------------------------------
-- Privileges: coordinators read via RLS; every write goes through functions.
-- ---------------------------------------------------------------------------
drop policy if exists "source reads own posts" on public.surplus_posts;
drop policy if exists "source creates own posts" on public.surplus_posts;
drop policy if exists "worker reads assigned posts" on public.surplus_posts;
drop policy if exists "worker updates assigned posts" on public.surplus_posts;
drop policy if exists "coordinators update posts" on public.surplus_posts;

revoke all on public.surplus_posts from anon, authenticated;
grant select on public.surplus_posts to authenticated; -- rows limited to coordinators by RLS

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.distance_km(lat1 double precision, lng1 double precision,
                                   lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = public as $$
  select case when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else 2 * 6371 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    )) end
$$;

-- Null area on either side means "whole pilot area".
create function public.same_area(a text, b text)
returns boolean language sql immutable set search_path = public as $$
  select a is null or b is null or lower(btrim(a)) = lower(btrim(b))
$$;

-- ---------------------------------------------------------------------------
-- Food source
-- ---------------------------------------------------------------------------
create function public.create_surplus_post(
  _food_description text,
  _quantity text,
  _ready_time timestamptz,
  _pickup_location text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _source public.food_sources;
  _location text;
  _id uuid;
begin
  if not public.has_role(auth.uid(), 'source') then
    raise exception 'حسابك بانتظار موافقة أحد المنسّقين';
  end if;
  select * into _source from public.food_sources where user_id = auth.uid();
  if not found or not _source.active then
    raise exception 'ملف مصدر الطعام غير مفعّل';
  end if;
  if nullif(btrim(_food_description), '') is null or nullif(btrim(_quantity), '') is null then
    raise exception 'أكمل وصف الطعام والكمية';
  end if;
  if _ready_time is null then
    raise exception 'حدّد وقت الجهوزية';
  end if;

  _location := coalesce(nullif(btrim(_pickup_location), ''), _source.address);

  insert into public.surplus_posts (
    source_id, restaurant_name, food_description, quantity, ready_time,
    pickup_location, area, pickup_lat, pickup_lng
  ) values (
    _source.id, _source.name, left(btrim(_food_description), 1000), left(btrim(_quantity), 200), _ready_time,
    left(_location, 300), _source.area,
    -- Profile coordinates only apply when pickup is at the profile address.
    case when _location = _source.address then _source.lat end,
    case when _location = _source.address then _source.lng end
  )
  returning id into _id;
  return _id;
end; $$;

create function public.my_source_posts()
returns table (
  id uuid,
  food_description text,
  quantity text,
  ready_time timestamptz,
  pickup_location text,
  status text,
  created_at timestamptz,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.food_description, p.quantity, p.ready_time, p.pickup_location, p.status,
         p.created_at, p.assigned_at, p.picked_up_at, p.delivered_at
  from public.surplus_posts p
  join public.food_sources s on s.id = p.source_id
  where s.user_id = auth.uid()
  order by p.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- Coordinator: link a report to a family and either open it for self-claim
-- or assign it directly. Confidential families can only be assigned directly,
-- and the worker receives the meeting point text instead of the address.
-- ---------------------------------------------------------------------------
create function public.coordinator_dispatch(
  _post_id uuid,
  _family_id uuid,
  _mode text,
  _worker_id uuid default null,
  _meeting_point text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  _post public.surplus_posts;
  _family public.families;
  _meeting text := nullif(btrim(_meeting_point), '');
begin
  if not public.has_role(auth.uid(), 'coordinator') then
    raise exception 'هذه الصلاحية للمنسّقين فقط';
  end if;

  select * into _post from public.surplus_posts where id = _post_id for update;
  if not found then
    raise exception 'البلاغ غير موجود';
  end if;
  if _post.status not in ('posted', 'assigned') then
    raise exception 'لا يمكن تعديل المهمة بعد استلام الطعام';
  end if;

  select * into _family from public.families where id = _family_id;
  if not found then
    raise exception 'اختر الأسرة المستفيدة';
  end if;

  if _mode not in ('open', 'direct') then
    raise exception 'اختر طريقة التوزيع';
  end if;
  if _family.is_sensitive and _mode = 'open' then
    raise exception 'الحالات السرّية تُسند مباشرة لعامل توصيل محدد';
  end if;
  if _family.is_sensitive and _meeting is null then
    raise exception 'أدخل نقطة اللقاء للحالة السرّية';
  end if;
  if _mode = 'direct' and not exists (
    select 1 from public.delivery_workers w
    where w.id = _worker_id and w.active and public.has_role(w.user_id, 'worker')
  ) then
    raise exception 'اختر عامل توصيل مفعّلًا';
  end if;

  update public.surplus_posts set
    family_id = _family.id,
    coordinator_id = auth.uid(),
    is_confidential = _family.is_sensitive,
    delivery_destination = case when _family.is_sensitive then left(_meeting, 300) else _family.address end,
    delivery_area = case when _family.is_sensitive then null else _family.neighborhood end,
    delivery_lat = case when _family.is_sensitive then null else _family.lat end,
    delivery_lng = case when _family.is_sensitive then null else _family.lng end,
    claim_mode = _mode,
    worker_id = case when _mode = 'direct' then _worker_id end,
    status = case when _mode = 'direct' then 'assigned' else 'posted' end,
    assigned_at = case when _mode = 'direct' then now() end
  where id = _post_id;
end; $$;

-- ---------------------------------------------------------------------------
-- Delivery worker
-- ---------------------------------------------------------------------------
create function public.worker_open_pool()
returns table (
  id uuid,
  food_description text,
  quantity text,
  ready_time timestamptz,
  restaurant_name text,
  pickup_location text,
  pickup_lat double precision,
  pickup_lng double precision,
  area text,
  delivery_area text,
  approx_distance_km numeric,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.food_description, p.quantity, p.ready_time, p.restaurant_name, p.pickup_location,
         p.pickup_lat, p.pickup_lng, p.area, p.delivery_area,
         -- Pickup → family, rounded to the nearest 0.5 km so the address can't be inferred.
         -- (GREATEST ignores NULL, so the missing-coordinates case is handled explicitly.)
         case when p.pickup_lat is null or p.delivery_lat is null then null
           else greatest(0.5, round((public.distance_km(p.pickup_lat, p.pickup_lng, p.delivery_lat, p.delivery_lng) * 2)::numeric) / 2)
         end,
         p.created_at
  from public.surplus_posts p
  join public.delivery_workers w on w.user_id = auth.uid()
  where public.has_role(auth.uid(), 'worker')
    and w.active
    and p.status = 'posted'
    and p.claim_mode = 'open'
    and not p.is_confidential
    and p.worker_id is null
    and public.same_area(p.area, w.area)
  order by p.ready_time
$$;

create function public.worker_claim(_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  _worker public.delivery_workers;
begin
  if not public.has_role(auth.uid(), 'worker') then
    raise exception 'حسابك بانتظار موافقة أحد المنسّقين';
  end if;
  select * into _worker from public.delivery_workers where user_id = auth.uid() and active;
  if not found then
    raise exception 'ملف عامل التوصيل غير مفعّل';
  end if;

  -- Single conditional UPDATE: if two workers claim at once, only one row matches.
  update public.surplus_posts set
    worker_id = _worker.id,
    status = 'assigned',
    assigned_at = now()
  where id = _post_id
    and status = 'posted'
    and claim_mode = 'open'
    and not is_confidential
    and worker_id is null
    and public.same_area(area, _worker.area);
  if not found then
    raise exception 'لم تعد هذه المهمة متاحة — ربما حجزها عامل آخر';
  end if;
end; $$;

create function public.worker_tasks()
returns table (
  id uuid,
  food_description text,
  quantity text,
  ready_time timestamptz,
  restaurant_name text,
  pickup_location text,
  pickup_lat double precision,
  pickup_lng double precision,
  status text,
  delivery_destination text,
  delivery_area text,
  delivery_lat double precision,
  delivery_lng double precision,
  is_confidential boolean,
  claim_mode text,
  created_at timestamptz,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.food_description, p.quantity, p.ready_time, p.restaurant_name, p.pickup_location,
         p.pickup_lat, p.pickup_lng, p.status, p.delivery_destination, p.delivery_area,
         p.delivery_lat, p.delivery_lng, p.is_confidential, p.claim_mode,
         p.created_at, p.assigned_at, p.picked_up_at, p.delivered_at
  from public.surplus_posts p
  join public.delivery_workers w on w.id = p.worker_id
  where w.user_id = auth.uid()
    and public.has_role(auth.uid(), 'worker')
  order by p.status = 'delivered', p.created_at desc
$$;

-- _next must be the immediate next status, so a double tap can't skip a step.
-- Timestamps come from the database clock, not the phone.
create function public.worker_advance(_post_id uuid, _next text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'worker') then
    raise exception 'حسابك بانتظار موافقة أحد المنسّقين';
  end if;
  if _next not in ('picked_up', 'delivered') then
    raise exception 'حالة غير صالحة';
  end if;

  update public.surplus_posts p set
    status = _next,
    picked_up_at = case when _next = 'picked_up' then now() else p.picked_up_at end,
    delivered_at = case when _next = 'delivered' then now() else p.delivered_at end
  from public.delivery_workers w
  where p.id = _post_id
    and w.id = p.worker_id
    and w.user_id = auth.uid()
    and p.status = case _next when 'picked_up' then 'assigned' else 'picked_up' end;
  if not found then
    raise exception 'تعذّر تحديث الحالة — حدّث الصفحة';
  end if;
end; $$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on function public.distance_km(double precision, double precision, double precision, double precision) from public, anon;
revoke all on function public.same_area(text, text) from public, anon;
grant execute on function public.distance_km(double precision, double precision, double precision, double precision) to authenticated, service_role;
grant execute on function public.same_area(text, text) to authenticated, service_role;

revoke all on function public.create_surplus_post(text, text, timestamptz, text) from public, anon;
revoke all on function public.my_source_posts() from public, anon;
revoke all on function public.coordinator_dispatch(uuid, uuid, text, uuid, text) from public, anon;
revoke all on function public.worker_open_pool() from public, anon;
revoke all on function public.worker_claim(uuid) from public, anon;
revoke all on function public.worker_tasks() from public, anon;
revoke all on function public.worker_advance(uuid, text) from public, anon;

grant execute on function public.create_surplus_post(text, text, timestamptz, text) to authenticated;
grant execute on function public.my_source_posts() to authenticated;
grant execute on function public.coordinator_dispatch(uuid, uuid, text, uuid, text) to authenticated;
grant execute on function public.worker_open_pool() to authenticated;
grant execute on function public.worker_claim(uuid) to authenticated;
grant execute on function public.worker_tasks() to authenticated;
grant execute on function public.worker_advance(uuid, text) to authenticated;

commit;
