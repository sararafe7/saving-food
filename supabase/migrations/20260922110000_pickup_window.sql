-- Pickup window: an optional "available until" time on each surplus report, so every
-- card can show a window ("3:30–4:30") instead of a single ready time.
-- Run once, after 20260922100000.
--
-- Nothing else about access changes. The functions below are recreated only to add
-- two food-side columns to what they already return:
--   * available_until — end of the pickup window (defaults to ready_time + 1 hour)
--   * source_type     — restaurant / bakery / grocery / other (workers already see the name)
-- No family or destination data is added anywhere.

begin;

alter table public.surplus_posts add column available_until timestamptz;

comment on column public.surplus_posts.available_until is 'End of the pickup window; defaults to ready_time + 1 hour';

update public.surplus_posts set available_until = ready_time + interval '1 hour'
where available_until is null;

alter table public.surplus_posts
  alter column available_until set not null,
  add constraint surplus_posts_window_check check (available_until > ready_time);

-- ---------------------------------------------------------------------------
-- Food source
-- ---------------------------------------------------------------------------
drop function public.create_surplus_post(text, text, timestamptz, text);

create function public.create_surplus_post(
  _food_description text,
  _quantity text,
  _ready_time timestamptz,
  _pickup_location text,
  _available_until timestamptz default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _source public.food_sources;
  _location text;
  _until timestamptz := coalesce(_available_until, _ready_time + interval '1 hour');
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
  if _until <= _ready_time then
    raise exception 'وقت انتهاء الاستلام يجب أن يكون بعد وقت الجهوزية';
  end if;

  _location := coalesce(nullif(btrim(_pickup_location), ''), _source.address);

  insert into public.surplus_posts (
    source_id, restaurant_name, food_description, quantity, ready_time, available_until,
    pickup_location, area, pickup_lat, pickup_lng
  ) values (
    _source.id, _source.name, left(btrim(_food_description), 1000), left(btrim(_quantity), 200),
    _ready_time, _until,
    left(_location, 300), _source.area,
    -- Profile coordinates only apply when pickup is at the profile address.
    case when _location = _source.address then _source.lat end,
    case when _location = _source.address then _source.lng end
  )
  returning id into _id;
  return _id;
end; $$;

drop function public.my_source_posts();

create function public.my_source_posts()
returns table (
  id uuid,
  food_description text,
  quantity text,
  ready_time timestamptz,
  available_until timestamptz,
  pickup_location text,
  status text,
  created_at timestamptz,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.food_description, p.quantity, p.ready_time, p.available_until, p.pickup_location,
         p.status, p.created_at, p.assigned_at, p.picked_up_at, p.delivered_at
  from public.surplus_posts p
  join public.food_sources s on s.id = p.source_id
  where s.user_id = auth.uid()
  order by p.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- Delivery worker (same rows and privacy rules as 20260919100200)
-- ---------------------------------------------------------------------------
drop function public.worker_open_pool();

create function public.worker_open_pool()
returns table (
  id uuid,
  food_description text,
  quantity text,
  ready_time timestamptz,
  available_until timestamptz,
  restaurant_name text,
  source_type public.source_type,
  pickup_location text,
  pickup_lat double precision,
  pickup_lng double precision,
  area text,
  delivery_area text,
  approx_distance_km numeric,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.food_description, p.quantity, p.ready_time, p.available_until,
         p.restaurant_name, s.type, p.pickup_location,
         p.pickup_lat, p.pickup_lng, p.area, p.delivery_area,
         -- Pickup → family, rounded to the nearest 0.5 km so the address can't be inferred.
         -- (GREATEST ignores NULL, so the missing-coordinates case is handled explicitly.)
         case when p.pickup_lat is null or p.delivery_lat is null then null
           else greatest(0.5, round((public.distance_km(p.pickup_lat, p.pickup_lng, p.delivery_lat, p.delivery_lng) * 2)::numeric) / 2)
         end,
         p.created_at
  from public.surplus_posts p
  join public.delivery_workers w on w.user_id = auth.uid()
  left join public.food_sources s on s.id = p.source_id
  where public.has_role(auth.uid(), 'worker')
    and w.active
    and p.status = 'posted'
    and p.claim_mode = 'open'
    and not p.is_confidential
    and p.worker_id is null
    and public.same_area(p.area, w.area)
  order by p.ready_time
$$;

drop function public.worker_tasks();

create function public.worker_tasks()
returns table (
  id uuid,
  food_description text,
  quantity text,
  ready_time timestamptz,
  available_until timestamptz,
  restaurant_name text,
  source_type public.source_type,
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
  select p.id, p.food_description, p.quantity, p.ready_time, p.available_until,
         p.restaurant_name, s.type, p.pickup_location,
         p.pickup_lat, p.pickup_lng, p.status, p.delivery_destination, p.delivery_area,
         p.delivery_lat, p.delivery_lng, p.is_confidential, p.claim_mode,
         p.created_at, p.assigned_at, p.picked_up_at, p.delivered_at
  from public.surplus_posts p
  join public.delivery_workers w on w.id = p.worker_id
  left join public.food_sources s on s.id = p.source_id
  where w.user_id = auth.uid()
    and public.has_role(auth.uid(), 'worker')
  order by p.status = 'delivered', p.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- Function privileges (dropping a function drops its grants)
-- ---------------------------------------------------------------------------
revoke all on function public.create_surplus_post(text, text, timestamptz, text, timestamptz) from public, anon;
revoke all on function public.my_source_posts() from public, anon;
revoke all on function public.worker_open_pool() from public, anon;
revoke all on function public.worker_tasks() from public, anon;

grant execute on function public.create_surplus_post(text, text, timestamptz, text, timestamptz) to authenticated;
grant execute on function public.my_source_posts() to authenticated;
grant execute on function public.worker_open_pool() to authenticated;
grant execute on function public.worker_tasks() to authenticated;

commit;
