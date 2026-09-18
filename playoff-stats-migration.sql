-- Run this in Supabase SQL Editor
-- (Applied 2026-09-18.)
--
-- Playoff games (14 Sep 2026 onwards) are kept apart from the group stage so
-- they don't leak into group-stage Standings. imprint-sync.js stores each
-- playoff series' per-game detail here, keyed by Valve series_id, and the
-- Playoffs tab on Standings computes records/player/hero stats from it.
-- Safe to re-run.

alter table public.league_data_cache
  add column if not exists playoff_series jsonb not null default '{}'::jsonb;
