-- Run this in Supabase SQL Editor

create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  discord_id text,
  discord_username text,
  discord_avatar text,
  ign text,
  steam_id text,
  rank text,
  primary_position integer check (primary_position between 1 and 5),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop policy if exists "Profiles insert own" on public.profiles;
create policy "Profiles insert own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Profiles update own" on public.profiles;
create policy "Profiles update own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Profiles read own" on public.profiles;
create policy "Profiles read own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Profiles public read approved" on public.profiles;
create policy "Profiles public read approved"
on public.profiles
for select
to anon
using (
  exists (
    select 1
    from public.solo_registrations sr
    where sr.status = 'approved'
      and sr.discord_username is not null
      and sr.discord_username = profiles.discord_username
  )
  or exists (
    select 1
    from public.team_registrations tr
    where tr.status = 'approved'
      and profiles.discord_username is not null
      and tr.players @> jsonb_build_array(jsonb_build_object('discord_username', profiles.discord_username))
  )
);

create index if not exists idx_profiles_discord_username on public.profiles(discord_username);
