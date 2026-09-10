-- Run this in Supabase SQL Editor.
-- Backs the Trends tab (standings.html / js/standings.js) and speeds up the
-- Group Stage tab on the same page.
--
-- This is a CACHE, not a source of truth — the real data always comes from
-- the Imprint API. The point of this table is that nobody's browser calls
-- Imprint directly any more: every page load reads this single row instead,
-- and a Cloudflare Function (functions/api/imprint-sync.js) is the only
-- thing that ever writes to it.
--
-- That function only refetches from Imprint when the list of match ids in
-- the league has actually changed (i.e. a new game was played) — a page
-- refresh alone never re-requests anything, and a game that's already
-- finished is never re-pulled once it's in match_ids. See the comment at
-- the top of imprint-sync.js for the full flow.
create table if not exists public.league_data_cache (
  id                     text primary key,      -- always 'snapshot' — one row holds the whole cache
  teams                  jsonb,                  -- raw Imprint /teams "data" payload
  players                jsonb,                  -- raw Imprint /players "data" payload
  heroes                 jsonb,                  -- raw Imprint /heroes "data" payload (powers Trends)
  match_ids              jsonb not null default '[]'::jsonb,  -- every Imprint match id seen so far, for change detection
  match_count            int not null default 0,
  -- Subset of match_ids whose per-match player names (see player_names below)
  -- have already been pulled from GET /match/{id}. Tracked separately from
  -- match_ids because a big backlog is drained a batch at a time (see
  -- MAX_MATCH_DETAIL_FETCHES in imprint-sync.js) — this is how the function
  -- picks up where it left off across syncs instead of reprocessing matches
  -- it's already seen.
  name_synced_match_ids  jsonb not null default '[]'::jsonb,
  updated_at             timestamptz not null default now()
);

alter table public.league_data_cache enable row level security;

-- ── 2. Ground-truth win/tie/loss + roster records ───────────────
-- Added once it became clear Imprint's own /teams and /players win/loss
-- aggregates can't be trusted directly: they're counted per game (not per
-- Bo2 series), and their per-team/per-position breakdown has real gaps —
-- some registered starters have zero games in /players at all, and some
-- teams' per-position totals exceed the team's own match count (a
-- transferred/stand-in player's personal stats aren't scoped to just that
-- team). See the big comment at the top of imprint-sync.js.
--
-- fixtures was going to hold Imprint's raw /league/{id}/fixtures payload
-- (each fixture being one real scheduled series, grouped by
-- imprint_series_id rather than Valve's series_id). Turns out this league
-- doesn't use Imprint's fixture-scheduling feature at all — /fixtures 404s
-- for it — so this column is never written any more; left in place rather
-- than dropped, in case a future league on this same setup does have it.
--
-- computed_teams, computed_players and computed_heroes are rebuilt by
-- imprint-sync.js from /league/{id}/matches (its own series grouping, used
-- in place of /fixtures) + per-series match detail (GET /series/{id})
-- rather than copied from Imprint's own aggregates — see that file for the
-- shape of each.
alter table public.league_data_cache add column if not exists fixtures jsonb;
alter table public.league_data_cache add column if not exists computed_teams jsonb not null default '{}'::jsonb;
alter table public.league_data_cache add column if not exists computed_players jsonb not null default '{}'::jsonb;
-- Pick/win/loss + K/D/A per hero, keyed by hero name, walked from the same
-- GET /series/{id} responses as computed_players — see
-- mergeSeriesIntoComputedHeroes() in imprint-sync.js. Powers the Trends tab
-- instead of the raw `heroes` aggregate below, so Trends covers the same
-- games as the rest of Standings rather than only the subset Imprint has
-- fully replay-parsed.
alter table public.league_data_cache add column if not exists computed_heroes jsonb not null default '{}'::jsonb;
-- Which fully-played series (by Valve's series_id, from /league/{id}/matches
-- — see imprint-sync.js) have already had their per-series detail (GET
-- /series/{id}) folded into computed_teams/computed_players — same
-- backlog-draining idea as name_synced_match_ids below, just keyed by
-- series instead of match, and covering both the team record and the
-- player win/loss/position rebuild instead of only names.
alter table public.league_data_cache add column if not exists series_synced_ids jsonb not null default '[]'::jsonb;
-- name_synced_match_ids is superseded by series_synced_ids (one series call
-- now covers both the name-history walk and the player stats rebuild) but
-- is left in place rather than dropped, in case anything still reads it.

drop policy if exists "Public read league data cache" on public.league_data_cache;
create policy "Public read league data cache"
on public.league_data_cache for select
using (true);

-- Deliberately no insert/update/delete policy for anon or authenticated roles —
-- not even admins. The only writer is functions/api/imprint-sync.js, which
-- uses the Supabase *service role* key (a Cloudflare secret, never shipped to
-- the browser) and so bypasses RLS entirely. Nothing client-side can corrupt
-- this cache, which matters since it refreshes itself with no admin present.

-- ── Player Names ──────────────────────────────────────────────
-- Imprint's /players endpoint only ever reports a player's CURRENT display
-- name — it doesn't track renames. GET /match/{id} does have each match's
-- own point-in-time account_name per account_id though, so imprint-sync.js
-- walks newly-seen matches, and whenever a match shows a name that doesn't
-- match what /players currently reports for that account_id, it's recorded
-- here as an "aka". This can only ever see renames from whenever a match
-- was first synced onward — there's no way to recover a rename that
-- happened before this table existed.
create table if not exists public.player_names (
  account_id    bigint primary key,
  current_name  text not null,                       -- mirrors Imprint /players.account_name
  aka           jsonb not null default '[]'::jsonb,   -- past account_name values seen in match data, current_name excluded
  updated_at    timestamptz not null default now()
);

alter table public.player_names enable row level security;

drop policy if exists "Public read player names" on public.player_names;
create policy "Public read player names"
on public.player_names for select
using (true);

-- Same as league_data_cache: no write policy at all — only
-- imprint-sync.js's service-role key can write here.
