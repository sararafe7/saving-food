-- Roles
create type public.app_role as enum ('admin','coordinator','source','worker');
create type public.source_type as enum ('restaurant','bakery','grocery','other');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

-- updated_at helper
create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- Food sources
create table public.food_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  type public.source_type not null default 'restaurant',
  address text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.food_sources to authenticated;
grant all on public.food_sources to service_role;
alter table public.food_sources enable row level security;
create policy "source manages own profile" on public.food_sources for select to authenticated using (user_id = auth.uid());
create policy "source inserts own profile" on public.food_sources for insert to authenticated with check (user_id = auth.uid());
create policy "source updates own profile" on public.food_sources for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "staff read sources" on public.food_sources for select to authenticated
  using (public.has_role(auth.uid(),'coordinator') or public.has_role(auth.uid(),'admin'));
create trigger food_sources_updated_at before update on public.food_sources
  for each row execute function public.update_updated_at_column();

-- Delivery workers
create table public.delivery_workers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.delivery_workers to authenticated;
grant all on public.delivery_workers to service_role;
alter table public.delivery_workers enable row level security;
create policy "worker reads own profile" on public.delivery_workers for select to authenticated using (user_id = auth.uid());
create policy "worker inserts own profile" on public.delivery_workers for insert to authenticated with check (user_id = auth.uid());
create policy "worker updates own profile" on public.delivery_workers for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "staff read workers" on public.delivery_workers for select to authenticated
  using (public.has_role(auth.uid(),'coordinator') or public.has_role(auth.uid(),'admin'));
create trigger delivery_workers_updated_at before update on public.delivery_workers
  for each row execute function public.update_updated_at_column();

-- Coordinators
create table public.coordinators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  org text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.coordinators to authenticated;
grant all on public.coordinators to service_role;
alter table public.coordinators enable row level security;
create policy "coordinator reads own record" on public.coordinators for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "coordinator updates own record" on public.coordinators for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger coordinators_updated_at before update on public.coordinators
  for each row execute function public.update_updated_at_column();

-- Beneficiary families (private per coordinator)
create table public.families (
  id uuid primary key default gen_random_uuid(),
  coordinator_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  address text not null,
  contact_phone text,
  notes text,
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.families to authenticated;
grant all on public.families to service_role;
alter table public.families enable row level security;
create policy "owner coordinator reads families" on public.families for select to authenticated using (coordinator_id = auth.uid());
create policy "owner coordinator inserts families" on public.families for insert to authenticated with check (coordinator_id = auth.uid() and public.has_role(auth.uid(),'coordinator'));
create policy "owner coordinator updates families" on public.families for update to authenticated using (coordinator_id = auth.uid()) with check (coordinator_id = auth.uid());
create policy "owner coordinator deletes families" on public.families for delete to authenticated using (coordinator_id = auth.uid());
create trigger families_updated_at before update on public.families
  for each row execute function public.update_updated_at_column();

-- Surplus posts: new links and confidentiality
alter table public.surplus_posts
  add column source_id uuid references public.food_sources(id) on delete set null,
  add column family_id uuid references public.families(id) on delete set null,
  add column worker_id uuid references public.delivery_workers(id) on delete set null,
  add column coordinator_id uuid references auth.users(id) on delete set null,
  add column delivery_destination text,
  add column is_confidential boolean not null default false;

drop policy if exists posts_read_all on public.surplus_posts;
drop policy if exists posts_insert_all on public.surplus_posts;
drop policy if exists posts_update_all on public.surplus_posts;

revoke all on public.surplus_posts from anon;
revoke all on public.surplus_posts from authenticated;
grant select (id, restaurant_name, food_description, quantity, ready_time, pickup_location, status,
  source_id, family_id, worker_id, coordinator_id, delivery_destination, is_confidential,
  created_at, assigned_at, picked_up_at, delivered_at) on public.surplus_posts to authenticated;
grant insert (source_id, restaurant_name, food_description, quantity, ready_time, pickup_location) on public.surplus_posts to authenticated;
grant update (status, family_id, worker_id, coordinator_id, delivery_destination, is_confidential,
  assigned_at, picked_up_at, delivered_at) on public.surplus_posts to authenticated;
grant all on public.surplus_posts to service_role;

create policy "source reads own posts" on public.surplus_posts for select to authenticated
  using (exists (select 1 from public.food_sources f where f.id = surplus_posts.source_id and f.user_id = auth.uid()));
create policy "source creates own posts" on public.surplus_posts for insert to authenticated
  with check (exists (select 1 from public.food_sources f where f.id = surplus_posts.source_id and f.user_id = auth.uid()));
create policy "coordinator reads relevant posts" on public.surplus_posts for select to authenticated
  using (public.has_role(auth.uid(),'coordinator') and (status = 'posted' or coordinator_id = auth.uid()));
create policy "coordinator updates relevant posts" on public.surplus_posts for update to authenticated
  using (public.has_role(auth.uid(),'coordinator') and (status = 'posted' or coordinator_id = auth.uid()))
  with check (public.has_role(auth.uid(),'coordinator'));
create policy "worker reads assigned posts" on public.surplus_posts for select to authenticated
  using (exists (select 1 from public.delivery_workers w where w.id = surplus_posts.worker_id and w.user_id = auth.uid()));
create policy "worker updates assigned posts" on public.surplus_posts for update to authenticated
  using (exists (select 1 from public.delivery_workers w where w.id = surplus_posts.worker_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.delivery_workers w where w.id = surplus_posts.worker_id and w.user_id = auth.uid()));

-- Private coordinator notes per post
create table public.post_notes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.surplus_posts(id) on delete cascade,
  coordinator_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, coordinator_id)
);
grant select, insert, update, delete on public.post_notes to authenticated;
grant all on public.post_notes to service_role;
alter table public.post_notes enable row level security;
create policy "owner reads notes" on public.post_notes for select to authenticated using (coordinator_id = auth.uid());
create policy "owner inserts notes" on public.post_notes for insert to authenticated with check (coordinator_id = auth.uid() and public.has_role(auth.uid(),'coordinator'));
create policy "owner updates notes" on public.post_notes for update to authenticated using (coordinator_id = auth.uid()) with check (coordinator_id = auth.uid());
create policy "owner deletes notes" on public.post_notes for delete to authenticated using (coordinator_id = auth.uid());
create trigger post_notes_updated_at before update on public.post_notes
  for each row execute function public.update_updated_at_column();

-- Legacy pilot tables no longer used by the app
revoke all on public.coordinator_access from anon;
revoke all on public.coordinator_access from authenticated;
revoke all on public.volunteers from anon;
revoke all on public.volunteers from authenticated;