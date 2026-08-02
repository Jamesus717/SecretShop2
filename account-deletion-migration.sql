-- Run this in Supabase SQL Editor
-- Fixes "Delete My Account" on the Profile page: profiles and solo_registrations
-- had no DELETE policy at all, so those delete calls were silently affecting zero
-- rows (the user saw "Account deleted" but their data stayed in the database).

drop policy if exists "Delete own profile" on public.profiles;
create policy "Delete own profile"
on public.profiles
for delete
to authenticated
using (auth.uid() = id);

-- solo_registrations has no user_id column (it's filled out anonymously), so we match
-- on discord_username via the requester's own profile row.
drop policy if exists "Delete own solo registration" on public.solo_registrations;
create policy "Delete own solo registration"
on public.solo_registrations
for delete
to authenticated
using (
  discord_username is not null
  and discord_username = (select discord_username from public.profiles where id = auth.uid())
);

-- (team_registrations already has a "Delete own team registration" policy
-- from team-registrations-migration.sql, keyed off captain_user_id.)
