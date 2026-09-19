-- Step 7 — Remove the first-prototype tables and columns (PIN login, volunteers).
-- Run once, after 20260919100200.

begin;

alter table public.surplus_posts
  drop column if exists volunteer_id,
  drop column if exists coordinator_note;

drop table if exists public.volunteers;
drop table if exists public.coordinator_access;

commit;
