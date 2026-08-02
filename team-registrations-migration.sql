-- Run this in Supabase SQL Editor
-- Ties each team registration to the logged-in Discord account that submitted it,
-- so the same person can't register more than one team without deleting the old one first.

alter table public.team_registrations
  add column if not exists captain_user_id uuid references auth.users(id) on delete set null;

-- One team per Discord account. Existing rows (captain_user_id is null) are unaffected —
-- a unique constraint only blocks duplicate *non-null* values.
drop index if exists uniq_team_registrations_captain_user_id;
create unique index uniq_team_registrations_captain_user_id
  on public.team_registrations (captain_user_id)
  where captain_user_id is not null;

-- Captains need to be able to see and remove their own team registration
-- from the Register page (team_registrations has no public read policy otherwise).
drop policy if exists "Read own team registration" on public.team_registrations;
create policy "Read own team registration"
on public.team_registrations
for select
to authenticated
using (auth.uid() = captain_user_id);

drop policy if exists "Delete own team registration" on public.team_registrations;
create policy "Delete own team registration"
on public.team_registrations
for delete
to authenticated
using (auth.uid() = captain_user_id);
