# SecretShop — Handover

_Last updated 2026-09-18. For how the site works (data sources, traps, conventions) read
[CLAUDE.md](CLAUDE.md). This file covers what's been done and what's still open._

## What's live

| Page | State |
|---|---|
| Home | Sponsors carousel (Balloon Dota, Dota 2 Ireland → dota2ireland.com). Still has "Register" buttons |
| Register | Page kept for next season, **hidden from the nav** |
| Team Info | Rosters from Apps Script. Crests via `js/teamlogo.js`. Avg MMR per team |
| Standings | Tabs: **Group Stage** (games up to 13 Sep) · **Playoffs** (games from 14 Sep) · Trends (whole season). Opens on Playoffs while playoffs are on |
| Playoffs | Two-wheel double-elim bracket from Bonk's Google Sheet. Losers grey out, winner + score shown by each match number, UK clock, LIVE NOW / AWAITING RESULT tags |
| Group stage | `groupstage.html`, kept for next season (nav swaps it back in via `js/phase.js`) |
| Rules | Rules / Info / FAQ tabs |
| Balancer | Admin "BortyGPT" team balancer. Deliberately still on the old medal-rank system |

The old Tournament admin page was deleted on 18 Sep. Its Supabase tables (`tournament_teams`,
`tournament_matches`) are still there, unused.

## How the playoff split works

- Dota match ids only go up, so `PLAYOFFS_FIRST_MATCH_ID` in `functions/api/imprint-sync.js` is the
  14 Sep cut-off. Earlier games → group-stage records. Later games → stored raw in
  `league_data_cache.playoff_series`.
- Playoffs tab **series records come from the scheduling sheet** (you type scores in, and forfeits
  count). Player and hero stats come from Imprint's playoff games.
- Imprint does miss games. Midlands v Glizzy and No Sweat v Chutney each have only 1 of 2 games.
  The records are still right because they come from the sheet; only those players' stats are short.
- Wheel states use **UK time**. A match with no result counts as "live" for 3 hours after its start
  time, then shows "awaiting result" until a score or winner is on the sheet.

## Timeline

- **Aug** — Registration moved to MMR. Apps Script source mirrored into repo. Team logo uploads.
- **9 Sep** — Owen's `dev/owen` merged: standings rebuilt from real series data.
- **10 Sep** — Standings: win-rate ranking, head-to-head tiebreak, mobile + light mode. Hourly sync.
- **16 Sep** — Playoffs rebuilt to Bonk's two-wheel double-elim design.
- **18 Sep** — Playoff games split out of group Standings into their own tab. Wheel results/greying,
  UK clock. Light mode fixed on Rules. Tournament page deleted. Registration hidden from nav.
  Verified: all Supabase migrations applied (+ new `playoff-stats-migration.sql`), live Apps Script
  has MMR + Visible columns.

## Open items

| # | Item | Who | Notes |
|---|---|---|---|
| 1 | **Deploy, then reset the standings cache** | James | Must be in this order. See below |
| 2 | Daily reports are blind | James | The scheduled task can't reach the site or Google. Allow it, or turn the reports off |
| 3 | Home page "Register" buttons | James to decide | Nav link is hidden, the buttons on the home page aren't |
| 4 | Logo file sizes | optional | `assets/teaminfoimgs/` ~7 MB for 84px circles |
| 5 | 4 teams have no MMR | optional | Registered before MMR existed. Show "Avg Rank" instead |

### 1. Deploy, then reset

The live cache still has playoff games mixed into the group stage and is missing head-to-head for
older games. The reset rebuilds both, but **only after the new sync is live**. Run it before and the
old code refills it with the same mix.

1. Push to `main` and wait for Cloudflare to deploy.
2. Supabase SQL editor (project **SecretShopDota**):
   ```sql
   update public.league_data_cache
   set series_synced_ids = '[]'::jsonb, computed_teams = '{}'::jsonb,
       computed_players = '{}'::jsonb, playoff_series = '{}'::jsonb
   where id = 'snapshot';
   ```
3. GitHub → Actions → **League data sync** → **Run workflow**. Tested locally against live data:
   it rebuilds everything in 6 calls, which one run covers.

Backup from before any of this: table `league_data_cache_backup_20260918`. To restore:
```sql
update public.league_data_cache c
set series_synced_ids = b.series_synced_ids, computed_teams = b.computed_teams, computed_players = b.computed_players
from public.league_data_cache_backup_20260918 b where c.id = b.id;
```
Once happy: `drop table public.league_data_cache_backup_20260918;`

## Where things live that aren't in the repo

- **Apps Script source (the running copy)** — Google's script editor for the registration sheet.
  `google-apps-script.gs` is a mirror. **Update the existing deployment. Never create a new one.**
- **Playoff schedule + results** — Bonk's Google Sheet. Must stay "anyone with link can view".
  Columns are matched by header name. Scores and dates are typed in by hand; the site picks them up
  on the next page load.
- **Secrets** — Cloudflare Pages env vars (`SUPABASE_SERVICE_ROLE_KEY`, Imprint key).
