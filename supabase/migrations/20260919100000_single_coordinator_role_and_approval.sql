-- Step 2 — Coordinator is the only privileged role, every account needs approval,
-- and the family roster + internal notes are shared by all coordinators.
-- Run once, before 20260919100100.

begin;

-- ---------------------------------------------------------------------------
-- One role per account. Collapse "admin" into "coordinator" and, if a user
-- somehow holds several roles, keep the most privileged one.
-- ---------------------------------------------------------------------------
delete from public.user_roles r
using public.user_roles keep
where r.user_id = keep.user_id
  and r.id <> keep.id
  and (case keep.role::text when 'admin' then 0 when 'coordinator' then 0 when 'source' then 1 else 2 end,
       keep.created_at, keep.id)
    < (case r.role::text when 'admin' then 0 when 'coordinator' then 0 when 'source' then 1 else 2 end,
       r.created_at, r.id);

-- Former admins get a coordinator profile.
insert into public.coordinators (user_id, name)
select r.user_id, split_part(u.email, '@', 1)
from public.user_roles r
join auth.users u on u.id = r.user_id
where r.role::text = 'admin'
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Drop every policy that references has_role() or the old enum; they are
-- recreated below (or in the following migrations).
-- ---------------------------------------------------------------------------
drop policy if exists "read own roles" on public.user_roles;
drop policy if exists "staff read sources" on public.food_sources;
drop policy if exists "staff read workers" on public.delivery_workers;
drop policy if exists "coordinator reads own record" on public.coordinators;
drop policy if exists "owner coordinator reads families" on public.families;
drop policy if exists "owner coordinator inserts families" on public.families;
drop policy if exists "owner coordinator updates families" on public.families;
drop policy if exists "owner coordinator deletes families" on public.families;
drop policy if exists "coordinator reads relevant posts" on public.surplus_posts;
drop policy if exists "coordinator updates relevant posts" on public.surplus_posts;
drop policy if exists "owner reads notes" on public.post_notes;
drop policy if exists "owner inserts notes" on public.post_notes;
drop policy if exists "owner updates notes" on public.post_notes;
drop policy if exists "owner deletes notes" on public.post_notes;

-- ---------------------------------------------------------------------------
-- Recreate app_role without "admin" (Postgres cannot drop an enum value).
-- ---------------------------------------------------------------------------
alter type public.app_role rename to app_role_old;
create type public.app_role as enum ('coordinator', 'source', 'worker');
drop function public.has_role(uuid, public.app_role_old);
alter table public.user_roles
  alter column role type public.app_role
  using (case when role::text = 'admin' then 'coordinator' else role::text end)::public.app_role;
drop type public.app_role_old;

-- ---------------------------------------------------------------------------
-- Approval. Existing accounts are approved as they are now.
-- ---------------------------------------------------------------------------
alter table public.user_roles
  add column approved boolean not null default false,
  add column approved_at timestamptz,
  add column approved_by uuid references auth.users(id) on delete set null,
  add constraint user_roles_one_role_per_user unique (user_id);

update public.user_roles set approved = true, approved_at = now();

-- Only approved accounts hold their role's permissions anywhere in the database.
create function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role and approved
  )
$$;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

-- Signed-out visitors never touch app data (RLS already returns no rows; this is belt and braces).
revoke all on public.user_roles, public.coordinators, public.food_sources,
  public.delivery_workers, public.families, public.post_notes from anon;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
create policy "read own role or coordinator reads all" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'coordinator'));

create policy "coordinators read sources" on public.food_sources for select to authenticated
  using (public.has_role(auth.uid(), 'coordinator'));

create policy "coordinators read workers" on public.delivery_workers for select to authenticated
  using (public.has_role(auth.uid(), 'coordinator'));

create policy "read own or coordinator reads all" on public.coordinators for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'coordinator'));

-- Families: shared roster. Any approved coordinator can read and edit any family;
-- nobody else has any access. coordinator_id now just records who created it.
create policy "coordinators manage families" on public.families for all to authenticated
  using (public.has_role(auth.uid(), 'coordinator'))
  with check (public.has_role(auth.uid(), 'coordinator'));

-- Reports: coordinators see all of them. (Writes move to functions in 20260919100200.)
create policy "coordinators read posts" on public.surplus_posts for select to authenticated
  using (public.has_role(auth.uid(), 'coordinator'));
create policy "coordinators update posts" on public.surplus_posts for update to authenticated
  using (public.has_role(auth.uid(), 'coordinator'))
  with check (public.has_role(auth.uid(), 'coordinator'));

-- ---------------------------------------------------------------------------
-- Internal notes: one shared note per report, readable and editable by every
-- coordinator. Merge any existing per-author notes into a single note.
-- ---------------------------------------------------------------------------
update public.post_notes n
set note = agg.note
from (
  select post_id,
         string_agg(note, E'\n\n' order by created_at, id) as note,
         (array_agg(id order by created_at, id))[1] as keep_id
  from public.post_notes
  group by post_id
  having count(*) > 1
) agg
where n.id = agg.keep_id;

delete from public.post_notes n
using public.post_notes k
where n.post_id = k.post_id and (k.created_at, k.id) < (n.created_at, n.id);

alter table public.post_notes drop constraint if exists post_notes_post_id_coordinator_id_key;
alter table public.post_notes add constraint post_notes_one_per_post unique (post_id);
comment on column public.post_notes.coordinator_id is 'Coordinator who last edited the note';

create function public.set_note_editor()
returns trigger language plpgsql set search_path = public as $$
begin
  new.coordinator_id = coalesce(auth.uid(), new.coordinator_id);
  return new;
end; $$;
revoke all on function public.set_note_editor() from public, anon;
create trigger post_notes_set_editor before update on public.post_notes
  for each row execute function public.set_note_editor();

create policy "coordinators manage notes" on public.post_notes for all to authenticated
  using (public.has_role(auth.uid(), 'coordinator'))
  with check (public.has_role(auth.uid(), 'coordinator'));

commit;
