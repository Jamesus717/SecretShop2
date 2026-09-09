# SecretShop / SecretLeague

Static site for a UK community Dota 2 league. No build step, no framework, no bundler — plain ES
modules loaded directly by each page. Deployed to **Cloudflare Pages** from GitHub `main`; pages
route without `.html` (`/team-info`, `/playoffs`).

## Layout

- `*.html` — one file per page. Each loads `js/nav.js` plus its own module.
- `js/nav.js` — renders the shared header on every page and calls `initAuth()`.
- `js/<page>.js` — one module per page, same name as the HTML.
- `css/base.css` + `css/nav.css` are global; `css/pages/<page>.css` is per page.
- `functions/api/**` — Cloudflare Pages Functions (server-side, hold the secrets).
- `*.sql` — migrations, run **by hand** in the Supabase SQL editor. Nothing tracks which are applied.

## Where data comes from

| Source | Used for | Notes |
|---|---|---|
| Google Apps Script `/exec` | Team rosters, registrations | Source lives **outside this repo**. Can be slow (16s cold start seen). |
| Google Sheet CSV export | Playoff schedule + casters | `js/playoffs.js`. Read live on every load; needs "anyone with link can view". |
| Imprint API | Match/player/hero stats | Proxied via `functions/api/imprint/[[route]].js` so the key stays server-side. |
| Supabase | Auth, divisions, forfeits, logos, cached league data | Publishable key is client-side by design; writes are gated by RLS. |

Standings does **not** read Imprint on a normal page load — it reads `league_data_cache` in
Supabase, which `functions/api/imprint-sync.js` populates. See that file's header comment for why
Imprint's own win/loss aggregates aren't trusted (per-game not per-series, gaps in the per-position
breakdown).

## Traps that have actually bitten

- **A missing file on Cloudflare returns `200` with an HTML error page, cached ~4h** — not a 404.
  A "200" is not proof a deploy worked; grep the response for expected content.
- **Windows hides case bugs.** `Foo.png` and `foo.png` are the same file locally and different on
  the host. Never conclude an asset works from a local test.
- **Never recreate an Apps Script deployment.** Old `/exec` URLs stay live with frozen code and
  silently write malformed rows. Update the existing deployment.
- **Unapplied migrations usually fail silently.** If standings shows every team as "not synced
  yet", or duplicate sign-ups get through, check the migration ran before debugging the client.
- **Theme transitions freeze while the browser pane is hidden**, so `getComputedStyle` returns
  half-transitioned colours. Inject `* { transition: none !important }` before measuring.

## Conventions

- Everything rendered via `innerHTML` is escaped through a local `esc()`. All of it comes from
  spreadsheets people type into — treat every string as hostile.
- Fixtures and schedules are **data at the top of the module**, not markup, so a change is a
  one-line edit.
- Light theme sets `--text`/`--silver`/`--muted` to **white**, which suits the dark panel and is
  unreadable on light mode's tan one. Per-page fix: re-point those tokens on the page's card
  (see `css/pages/standings.css`) rather than overriding every rule. Verify contrast by measuring,
  not by eye — the tan panel is light enough that mid-tone hues fail AA.
- Division colours (upper gold / mid teal / lower red) mean the same thing on every page. Used as
  backgrounds with dark ink, never as small coloured text.
- Team names differ between Imprint, the registration sheet and the schedule sheet. Resolve through
  the alias maps (`TEAM_NAME_ALIASES` in `js/standings.js`, `TEAM_ALIASES` in `js/playoffs.js`)
  rather than adding another spelling.
- Crests resolve through `resolveTeamImage()` in `js/teamlogo.js`: uploaded logo first, then a file
  in `assets/teaminfoimgs/`. Add a `TEAM_IMAGE_OVERRIDES` entry when a filename isn't derivable
  from the team name.

## Local development

`python -m http.server 8734` serves the site, but `/api/*` won't exist — Pages Functions don't run.
Standings supports `?mock=1` to read `mock-data/` instead; regenerate those with
`node mock-data/fetch-mock-data.mjs`. Playoffs supports `?phase=playoffs|group` to preview either
side of the group-stage cutover.
