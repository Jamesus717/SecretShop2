# SecretShop / SecretLeague

React + Vite + TypeScript site for a UK community Dota 2 league (redesign branch `james/react-redesign`).
Deployed to **Cloudflare Pages** (build `npm run build`, output `dist/`); client routes via BrowserRouter
and `public/_redirects` (`/* /index.html 200`). Old `*.html` URLs redirect to clean paths.

## Layout

- `src/main.tsx`, `src/app/` — router (`routes.ts`), `Layout` (header, live strip, outlet, footer), `AuthProvider`.
- `src/pages/<Page>/<Page>Page.tsx` — one folder per route. Unbuilt pages render a "Coming soon" placeholder.
- `src/components/` — shared UI (`Crest`, `Section`, `Button`, `CountUp`, `Countdown`, `Marquee`, `NewsCard`...), each with a CSS Module.
- `src/lib/` — ported logic with no React (`supabase`, `auth`, `teamlogo`, `news`); `src/hooks/`, `src/data/` (e.g. `champions.ts`).
- `src/config.ts` — dates (`SIGNUPS_CLOSE`, `PLAYOFFS_START`, `LAZY_LEAGUE_START`) and phase helpers.
- `src/styles/tokens.css` + `global.css` — design tokens (dark base, `[data-theme="light"]`). `npm run contrast` checks AA.
- `public/` — `assets/`, favicons, `_redirects`. `legacy/` — the old static site, kept for reference only.
- `functions/api/**` — Cloudflare Pages Functions (server-side, hold the secrets).
- `*.sql` — migrations, run **by hand** in the Supabase SQL editor. Nothing tracks which are applied.
- Commands: `npm run dev | build | lint | test | shots | contrast`. Plan and briefs: `docs/redesign/BRIEF.md`.

## Where data comes from

| Source | Used for | Notes |
|---|---|---|
| Google Apps Script `/exec` | Team rosters, registrations | Source lives **outside this repo**. Can be slow (16s cold start seen). |
| Google Sheet CSV export | Playoff schedule + casters | `js/playoffs.js`. Read live on every load; needs "anyone with link can view". |
| Imprint API | Match/player/hero stats | Proxied via `functions/api/imprint/[[route]].js` so the key stays server-side. |
| Supabase | Auth, divisions, forfeits, logos, cached league data | Publishable key is client-side by design; writes are gated by RLS. |
| Owen's Discord bot (`match-cards-bot`, outside this repo) | Home "Latest" sidebar cards | Bot POSTs each card to `functions/api/news.js` with `NEWS_BOT_TOKEN` (admins can also post from "+ Add card" on the home page, authorised by their session); stored in `news_posts` + `news-cards` bucket (with a small `thumb_path` copy, back-filled by admins' browsers, and an optional `youtube_id`). Shown on Home, `/news`, and as CARD buttons on results, all via `js/newsfeed.js`. Cards are drawn by `tools/stat-designer`, so changing that page changes the bot's output. |
| Owen's Discord bot, again | `/clips` admin clip queue | Members' clips: bot POSTs to `functions/api/clips` with `CLIPS_BOT_TOKEN`; any admin approves on `/clips` (or via the bot's Discord buttons); Owen's PC GETs approved ones, renders them in the Highlight Cutter, then marks them posted. Stored in `clip_submissions` + private `clip-files` bucket (Discord attachments only; deleted on reject/post). Design: `docs/clip-queue-design.md`. |

Standings does **not** read Imprint on a normal page load — it reads `league_data_cache` in
Supabase, which `functions/api/imprint-sync.js` populates. See that file's header comment for why
Imprint's own win/loss aggregates aren't trusted (per-game not per-series, gaps in the per-position
breakdown). Trends hero stats work the same way: `computed_heroes` (back-filled over the
already-synced group stage) plus playoff games, with Imprint's `/heroes` used only for bans and
as the fallback until `computed_heroes.complete` is true.

Group stage and playoffs are split by Dota match id (`PLAYOFFS_FIRST_MATCH_ID`, 14 Sep 2026).
Playoff games are stored raw in `league_data_cache.playoff_series` and summed client-side each load;
playoff **series records** come from the scheduling sheet (via `fetchPlayoffResults()` in
`js/playoffs.js`), because Imprint misses games and knows nothing of forfeits.

## Traps that have actually bitten

- **A missing file on Cloudflare returns `200` with an HTML error page, cached ~4h** — not a 404.
  A "200" is not proof a deploy worked; grep the response for expected content.
- **Browsers keep JS/CSS for 4 hours** (`max-age=14400` from Cloudflare). A deploy that changes
  what one module exports can meet a visitor's cached old copy of another, and the import fails.
  When a change adds or renames an export, bump the `?v=` on the importing `<script>`/`import` URLs
  (they must match everywhere one module is imported, or it loads twice). HTML itself isn't cached.
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

- `npm install`, then `npm run dev` (Vite on http://localhost:5173). `npm run build | lint | test` as usual.
- **Functions don't run under Vite**, so every `/api/*` call fails locally: the Sync button shows a warning,
  Imprint proxy and news POST/clip bot routes are unreachable. That is expected, not a bug. Supabase and the
  Google Sheet are read directly from the browser and do work.
- `?mock=1` on `/standings` reads `mock-data/` instead of Supabase / Imprint (regenerate with
  `node mock-data/fetch-mock-data.mjs`); on `/clips` it reads `mock-data/clip-submissions.json` (approvals stay in memory).
  `/?mocknews=1` fills the Home Latest sidebar from `mock-data/news-posts.json`.
- `?phase=playoffs|group` previews either side of the group-stage cutover (Playoffs, Standings default tab, live strip).
- `/register?forceopen=1` opens the sign-up form after the deadline. **Dev builds only**; it is ignored in production.
- `/news?card=<id>` opens that card's lightbox (Home Latest cards link there).
- `npm run shots [-- /route ...]` screenshots routes at 1280 and 375, dark and light, into `docs/redesign/screens/`
  (`<route>-<width>-<theme>.png`) and prints console errors and horizontal overflow per shot. With no routes it
  covers every route. Needs the dev server running and Edge (`EDGE_PATH` overrides the default Windows path;
  `--base <url>` points elsewhere). Read-only, never submits anything.
- `npm run contrast` checks AA for the design tokens, Standings and Playoffs tab colours in both themes.
