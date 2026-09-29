# Stat Designer

A local page for turning league numbers into shareable graphics — hero highlights,
hero lists (unpicked, never banned, win-rate tables) and team spotlights — exported
as PNG. It doesn't fetch any stats; type or paste them in from the dashboard.

## Run it

Double-click **`launch.bat`** (needs Node.js). It starts `serve.mjs` on port 8734
and opens `http://localhost:8734/tools/stat-designer/`. Close the window to stop.

`serve.mjs` serves the repo like `python -m http.server`, plus it downloads each
hero's picture from Steam the first time it's used and saves it in `hero-art/`
(gitignored). That's what makes hero pictures appear in downloaded/copied PNGs:
Steam lets the page *show* its images but blocks exporting them, whereas a copy
served from localhost always exports.

If the page is started some other way (plain `python -m http.server`, or opened
straight from disk), an orange bar warns that hero pictures will be blank in exports.

Optional: `node tools/stat-designer/fetch-hero-art.mjs` downloads every hero up
front (~40–60 MB) instead of one at a time. Add new heroes to `heroes.js` first;
`--force` re-downloads everything.

## Templates

- **Hero** — league record ring, picks/bans/contest, KDA shield and up to 8 stat
  rows. Any hero can be swapped for your own image, with zoom/position sliders.
- **List** — paste rows straight out of a spreadsheet (hero name first, values
  after, tab- or comma-separated). *Hero grid* for sets like "never picked";
  *Ranked table* for leaderboards, with an optional bar on the 2nd column.
  "Flip to heroes NOT listed" turns a list of picked heroes into the unpicked ones.
- **Result** — two teams, the series score in big numbers, the division, and a
  row per game (up to 5) with both drafts, kills and length. The winner gets a
  highlight. Paste a match ID and press *Fetch* to fill a game from OpenDota
  (picks/bans in draft order, winner, kills, length); if OpenDota doesn't have the
  match yet, the page offers to ask it to fetch it. Everything is editable, and
  *Swap teams* fixes a game where the sides came out backwards.
- **Compare** — two players head to head over the whole league. Pick a team and
  player on each side and their averages fill in (games, win rate, K/D/A, kill
  participation, net worth, hero damage, Imprint rating), shown as a stat-by-stat
  duel with the better value highlighted. Hero pools show every hero they've played
  with the count underneath, and the heroes both have played sit in the middle.
  Every row, name and pool is editable; add rows for anything Imprint doesn't
  record (GPM, XPM, last hits).

  The numbers come from the league snapshot in `mock-data/` — the same files
  Standings' `?mock=1` uses. **Update league data** in the designer runs
  `mock-data/fetch-mock-data.mjs` against the live site to pull any newly finished
  series (only works when started from `launch.bat`). A Bo2 is only included once
  both games are in.
- **Team** — crest from `assets/teaminfoimgs/` (or upload one), name, division
  badge, a free-text message, stat tiles and an optional roster.

Each comes in 16:9 (1920×1080) and 4:5 (1080×1350), at 1× or 2×.
Work autosaves in the browser; *Presets* saves/loads a JSON file.

## Keeping it current

- Teams → `TEAMS` at the top of the script in `index.html` (name, division, crest file).
  The team dropdowns list all of them. On load the page also reads the live site's
  uploaded crests and division moves from Supabase — the same public data Team Info
  and Standings use — so a team whose crest was uploaded at registration shows
  up without a file in `assets/teaminfoimgs/`. `serve.mjs` saves those crests into
  `crest-cache/` (gitignored) so they export. A new team only needs adding to `TEAMS`.
- New sponsor → `SPONSORS` in the same place.
- Hero nicknames the paste box doesn't recognise → `HERO_ALIASES`.

Note: this folder deploys with the site like everything else, so it's reachable at
`/tools/stat-designer/` on the live domain. Harmless, but move it out of the repo
if you'd rather it wasn't.
