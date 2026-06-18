-- ══════════════════════════════════════════════════════════════
-- SecretShop Dota — Supabase Schema (matches live DB)
-- Run in Supabase SQL Editor on a fresh project to recreate the app.
--
-- Column names, types, nullability and defaults are verified against
-- the live database. CHECK/UNIQUE constraints and indexes reflect the
-- intended design but could not be introspected — adjust if your live
-- DB differs. RLS policies below are verified.
-- ══════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- ── Profiles ──────────────────────────────────────────────────
-- One row per logged-in Discord user. id = auth.users.id.
create table if not exists profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  discord_id        text,
  discord_username  text,
  discord_avatar    text,
  ign               text,
  steam_id          text,
  rank              text,
  primary_position  integer check (primary_position between 1 and 5),
  updated_at        timestamptz not null default now()
);

-- ── Admin Users ───────────────────────────────────────────────
-- Membership here grants write access to tournament tables via RLS.
create table if not exists admin_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  granted_at  timestamptz default now()
);

-- ── Solo Registrations ────────────────────────────────────────
create table if not exists solo_registrations (
  id                  uuid primary key default uuid_generate_v4(),
  created_at          timestamptz default now(),
  ign                 text not null,
  steam_name          text,
  steam_id            text not null,
  discord_username    text,
  rank                text not null check (rank in (
    'Herald','Guardian','Crusader','Archon','Legend','Ancient','Divine','Immortal'
  )),
  primary_position    integer not null check (primary_position between 1 and 5),
  secondary_position  integer check (secondary_position between 1 and 5),
  status              text not null default 'pending' check (status in ('pending','approved','rejected')),
  team_id             uuid,
  notes               text
);

-- ── Team Registrations ────────────────────────────────────────
create table if not exists team_registrations (
  id                uuid primary key default uuid_generate_v4(),
  created_at        timestamptz default now(),
  team_name         text not null,
  captain_ign       text not null,
  captain_discord   text,
  players           jsonb not null,   -- array of {ign, steam_id, discord_username, rank, primary_position}
  avg_mmr           integer not null,
  status            text not null default 'pending' check (status in ('pending','approved','rejected')),
  notes             text
);

-- ── Tournament Teams ──────────────────────────────────────────
create table if not exists tournament_teams (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,
  players     jsonb not null default '[]'::jsonb,   -- pre-registered team players
  player_ids  uuid[] default '{}'::uuid[]           -- solo registrations assigned in
);

-- ── Tournament Matches ────────────────────────────────────────
create table if not exists tournament_matches (
  id            uuid primary key default uuid_generate_v4(),
  round_type    text not null,                       -- 'group' | 'upper' | 'lower' | 'grand_final'
  round_number  integer not null,
  match_number  integer not null,
  team_a_id     uuid references tournament_teams(id) on delete set null,
  team_b_id     uuid references tournament_teams(id) on delete set null,
  winner_id     uuid references tournament_teams(id) on delete set null,
  is_bye        boolean default false,
  status        text default 'pending',              -- 'pending' | 'complete'
  created_at    timestamptz default now()
);

-- ── Row Level Security ────────────────────────────────────────

-- Registrations: anyone can submit; solo reads limited to approved; teams not publicly readable.
alter table solo_registrations enable row level security;
create policy "Public insert solo"   on solo_registrations for insert with check (true);
create policy "Public read approved" on solo_registrations for select using (status = 'approved');

alter table team_registrations enable row level security;
create policy "Public insert team"   on team_registrations for insert with check (true);

-- Tournament data: public read, admin-only write.
alter table tournament_teams   enable row level security;
alter table tournament_matches enable row level security;

create policy "Public read" on tournament_teams   for select using (true);
create policy "Public read" on tournament_matches for select using (true);

create policy "Admin write" on tournament_teams for all
  using (exists (select 1 from admin_users where admin_users.user_id = auth.uid()));
create policy "Admin write" on tournament_matches for all
  using (exists (select 1 from admin_users where admin_users.user_id = auth.uid()));

-- Profiles: each user manages their own row.
alter table profiles enable row level security;
create policy "Read own profile"   on profiles for select using (auth.uid() = id);
create policy "Upsert own profile" on profiles for insert with check (auth.uid() = id);
create policy "Update own profile" on profiles for update using (auth.uid() = id);

-- admin_users: no public policies — managed manually via service role.
alter table admin_users enable row level security;

-- ── Indexes (recommended) ─────────────────────────────────────
create index if not exists idx_solo_status      on solo_registrations(status);
create index if not exists idx_matches_round    on tournament_matches(round_type, round_number, match_number);