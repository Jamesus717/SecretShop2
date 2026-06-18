-- ══════════════════════════════════════════════════════════════
-- SecretShop Dota — Supabase Schema
-- Run this in your Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Solo Registrations ────────────────────────────────────────
create table if not exists solo_registrations (
  id                  uuid primary key default uuid_generate_v4(),
  created_at          timestamptz default now(),
  ign                 text not null,
  steam_name          text,
  steam_id            text not null unique,
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
  team_name         text not null unique,
  captain_ign       text not null,
  captain_discord   text,
  players           jsonb not null, -- array of {ign, steam_id, discord_username, rank, primary_position}
  avg_mmr           integer not null,
  status            text not null default 'pending' check (status in ('pending','approved','rejected')),
  notes             text
);

-- ── Tournament Teams ──────────────────────────────────────────
create table if not exists tournament_teams (
  id        uuid primary key default uuid_generate_v4(),
  name      text not null unique,
  players   jsonb not null,
  "group"   text not null check ("group" in ('A','B')),
  wins      integer not null default 0,
  losses    integer not null default 0,
  points    integer not null default 0
);

-- ── Tournament Matches ────────────────────────────────────────
create table if not exists tournament_matches (
  id              uuid primary key default uuid_generate_v4(),
  round           text not null check (round in ('group_a','group_b','semi','grand_final')),
  team_a_id       uuid not null references tournament_teams(id),
  team_b_id       uuid not null references tournament_teams(id),
  team_a_name     text not null,
  team_b_name     text not null,
  team_a_score    integer,
  team_b_score    integer,
  scheduled_at    timestamptz,
  played_at       timestamptz,
  winner_id       uuid references tournament_teams(id),
  dotabuff_link   text
);

-- ── Row Level Security ────────────────────────────────────────
-- Solo registrations: anyone can insert, only service role can read all
alter table solo_registrations enable row level security;
create policy "Public insert solo"  on solo_registrations for insert with check (true);
create policy "Public read approved" on solo_registrations for select using (status = 'approved');

-- Team registrations: anyone can insert, only service role can read all
alter table team_registrations enable row level security;
create policy "Public insert team"   on team_registrations for insert with check (true);

-- Tournament data: public read
alter table tournament_teams enable row level security;
create policy "Public read teams"   on tournament_teams for select using (true);

alter table tournament_matches enable row level security;
create policy "Public read matches" on tournament_matches for select using (true);

-- ── Useful indexes ────────────────────────────────────────────
create index if not exists idx_solo_steam_id on solo_registrations(steam_id);
create index if not exists idx_solo_status   on solo_registrations(status);
create index if not exists idx_matches_round on tournament_matches(round);
