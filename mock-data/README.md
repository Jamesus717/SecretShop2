Local/preview test fixtures for standings.html (`?mock=1`).

## Quick start

    node mock-data/fetch-mock-data.mjs

This populates every file below (except `imprint-heroes.json`, see why below)
from the live site's own public Imprint proxy — no API key needed, since the
Cloudflare Function holds the real key server-side. Then open
`standings.html?mock=1` (locally, e.g. `npx wrangler pages dev .` or any
static server) to preview it fully offline, including real win/tie/loss
records and per-player roster stats.

**Incremental**: `imprint-series-bundle.json` is the slow part (one request
per not-yet-cached series), so each run only fetches up to 10 new meetings
and merges them into whatever's already in that file — it never re-fetches
what it already has. Run the exact same command again to pull the next 10;
it prints how many meetings are left each time, and says "All caught up!"
once there's nothing more to fetch. Pass a number as a second argument to
change the batch size, or `all` to fetch everything remaining in one go:

    node mock-data/fetch-mock-data.mjs http://localhost:8788        # next 10
    node mock-data/fetch-mock-data.mjs http://localhost:8788 25     # next 25
    node mock-data/fetch-mock-data.mjs http://localhost:8788 all    # everything left

`imprint-teams.json`/`imprint-players.json`/`imprint-matches.json` are cheap
single requests, so those are always refreshed in full on every run —
delete `imprint-series-bundle.json` yourself if you ever want to start that
one over from scratch instead of resuming.

Pass a different site as the first argument to test against a preview
deploy, or your own local `wrangler pages dev` server if you're testing
code that hasn't been deployed yet, instead of production:

    node mock-data/fetch-mock-data.mjs https://my-branch.secretshop-2.pages.dev

These are point-in-time snapshots, not live data — re-run the script to
refresh them. Fine to delete this whole folder before merging to main.

## Files

- `imprint-teams.json`, `imprint-players.json` — Imprint's own `/teams` and
  `/players` payloads. Still used for logos, registered roster names, and
  Imprint's own per-player/per-team rating — everything except win/loss,
  which comes from the two files below instead (see the big comment at the
  top of `functions/api/imprint-sync.js` for why).
- `imprint-matches.json` — Imprint's `/matches` payload: its own `series`
  array groups match ids by Valve's series_id and reports match_count plus
  both teams for each real series this league has played. `fetch-mock-data.mjs`
  uses this to know which series to fetch in full below (we originally used
  `/fixtures` for this — Imprint's scheduling feature — but that endpoint
  404s for this league; it doesn't use Imprint's fixture-scheduling at all,
  only replay-parsed match data). One catch: Valve's own series_id frequently
  splits one real Bo2 meeting into two separate match_count=1 entries here
  (confirmed on this league's real data), so both this script and
  `imprint-sync.js` group entries by team-pair and sum match_count across
  them before deciding a meeting is fully played — see the big comment at
  the top of `functions/api/imprint-sync.js`.
- `imprint-series-bundle.json` — every series_id belonging to a *fully-played*
  meeting (its fragments' match_count summing to 2 — this league's format
  is a fixed Bo2, see `imprint-sync.js` for why that's the "decided" signal)
  full per-match, per-player detail (`/series/{id}`), bundled into one file
  by `fetch-mock-data.mjs` so mock mode doesn't need to make one request per
  series itself. `?mock=1` walks this to rebuild both team win/tie/loss AND
  per-team-per-position roster stats client-side
  (`mockGroupMeetingsFromBundle()` / `mockMergeMeetingIntoComputedTeams()` /
  `mockMergeSeriesIntoComputedPlayers()` — straight copies of
  `groupMeetingsFromMatches()` / `mergeMeetingIntoComputedTeams()` /
  `mergeSeriesIntoComputedPlayers()` in `imprint-sync.js`). This is the one
  real production imprint-sync.js gets to skip most of the time — it only
  pulls newly-finished meetings a batch at a time across several page loads
  (`series_synced_ids`); mock mode has no server-side backlog to drain
  across visits, so it just fetches all of it up front.
- `imprint-heroes.json` ships as a small hand-built fixture (24 heroes spread
  across win-rate bands) rather than a live pull, so the Trends tab has
  something to show with `?mock=1` before you've run the Supabase migrations
  or set up `SUPABASE_SERVICE_ROLE_KEY`. `fetch-mock-data.mjs` leaves it
  alone; swap it for a real snapshot yourself if you want live hero stats:

      curl https://secretshopdota.co.uk/api/imprint/heroes -o mock-data/imprint-heroes.json

  (PowerShell: `Invoke-WebRequest <url> -OutFile <path>` instead of curl.)

## What `?mock=1` still can't do

It's read-only and fully offline: `?mock=1` never touches Supabase or
`functions/api/imprint-sync.js`, so the admin "Force refresh" button,
divisions, and forfeits won't do anything meaningful against these static
files, and nothing you do under `?mock=1` writes back to `mock-data/` —
re-run the script to pick up new games. If you actually need those (e.g.
testing a Supabase migration, or the forfeit admin flow), point
`js/supabase.js` at a real project instead.

If `mockGroupMeetingsFromBundle()` / `mockMergeMeetingIntoComputedTeams()` /
`mockMergeSeriesIntoComputedPlayers()` in `js/standings.js` ever drift from
their originals in `imprint-sync.js`,
mock-mode numbers can stop matching production — there's no automated check
for this, so if you change the real logic, update the mock copy in the same
change.
