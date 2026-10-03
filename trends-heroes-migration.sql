-- Run this in Supabase SQL Editor
--
-- Trends tab hero stats from our own per-game data instead of Imprint's
-- /heroes aggregate, which only counts games whose replay Imprint fully
-- parsed. imprint-sync.js fills computed_heroes from the same /series/{id}
-- calls as computed_players, and back-fills the already-synced group stage
-- a batch at a time, tracked by heroes_synced_ids. Shape:
--   computed_heroes = { "complete": bool, "heroes": { "<hero name>": {...} } }
-- Standings keeps showing Imprint's numbers until "complete" is true.
--
-- Not run yet = no harm: imprint-sync.js and standings.js both carry on
-- without these columns. Safe to re-run.

alter table public.league_data_cache
  add column if not exists computed_heroes jsonb not null default '{}'::jsonb;

alter table public.league_data_cache
  add column if not exists heroes_synced_ids jsonb not null default '[]'::jsonb;
