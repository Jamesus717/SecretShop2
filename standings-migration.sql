-- Run this in Supabase SQL Editor.
-- Backs the Standings page (standings.html / js/standings.js).
--
-- The page's win/loss/roster/rating data comes live from the Imprint API
-- (functions/api/imprint) — nothing about a real played match is stored here.
-- These two tables hold only the things Imprint doesn't know about:
--   1. which division a team sits in (an admin call, not an Imprint fact)
--   2. forfeited matches (a team that didn't show up — Imprint has no record
--      of a match that was never played)
-- Both follow the same public-read / admin-write shape as tournament_teams
-- and tournament_matches in supabase-schema.sql.

-- ── Team Divisions ────────────────────────────────────────────
-- Admin overrides for which division (upper/mid/lower) a team is grouped
-- under on Standings. The page seeds every team from a hardcoded DIVISION_SEED
-- in js/standings.js first (matching the group stage groupings already on the
-- site); a row only shows up here once an admin has moved a team off that
-- seed, so this table stays small and only holds deltas.
create table if not exists public.team_divisions (
  team_key    text primary key,        -- normalised team name — see logoKey() in js/teamlogo.js
  team_name   text not null,           -- display name, for the table editor
  division    text not null check (division in ('upper','mid','lower','unassigned')),
  updated_at  timestamptz not null default now()
);

alter table public.team_divisions enable row level security;

drop policy if exists "Public read team divisions" on public.team_divisions;
create policy "Public read team divisions"
on public.team_divisions for select
using (true);

drop policy if exists "Admin write team divisions" on public.team_divisions;
create policy "Admin write team divisions"
on public.team_divisions for all
using (exists (select 1 from admin_users where admin_users.user_id = auth.uid()))
with check (exists (select 1 from admin_users where admin_users.user_id = auth.uid()));

-- ── Forfeit Matches ───────────────────────────────────────────
-- One row per forfeited match: winner gets +1 win, loser gets +1 loss. The
-- Standings page adds these on top of whatever Imprint reports for each team
-- when it computes the win/loss shown on a team's card.
create table if not exists public.forfeit_matches (
  id          uuid primary key default uuid_generate_v4(),
  winner_key  text not null,           -- normalised team name
  winner_name text not null,           -- display name at the time it was recorded
  loser_key   text not null,
  loser_name  text not null,
  note        text,                    -- optional admin note, e.g. "Round 3, no-show"
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.forfeit_matches enable row level security;

drop policy if exists "Public read forfeits" on public.forfeit_matches;
create policy "Public read forfeits"
on public.forfeit_matches for select
using (true);

drop policy if exists "Admin write forfeits" on public.forfeit_matches;
create policy "Admin write forfeits"
on public.forfeit_matches for all
using (exists (select 1 from admin_users where admin_users.user_id = auth.uid()))
with check (exists (select 1 from admin_users where admin_users.user_id = auth.uid()));

create index if not exists idx_forfeit_matches_created_at on public.forfeit_matches (created_at desc);
