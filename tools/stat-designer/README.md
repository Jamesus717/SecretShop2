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
  The starting points (Most picked / banned / contested, Top win rate, Unpicked,
  Never banned) fill in current league numbers: picks and wins from the
  `mock-data/` snapshot, bans from Imprint's hero summary via the live site
  (saved in `league-cache/` so the last copy works offline). Imprint only counts
  bans in games it has fully parsed, so they can lag a little behind.
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
- **Bracket** — a playoff bracket like Liquipedia's: upper bracket on top, lower
  bracket underneath, grand final on the right, with round headings and lines
  showing where each winner goes. It uses the same numbered-match model as the
  playoff scheduling sheet: each side of a match is a team, `Winner of 3`,
  `Loser of 3` (or `W3` / `L3`) or `BYE`, and results flow along those links —
  type a series score and the winner (and the loser, into the lower bracket)
  moves on by itself. Forfeits are a per-match *Result* option (drawn W / FF).

  Two ways to fill it in: **Load from playoff sheet** reads the division's
  pairings, passes and results straight from the sheet `js/playoffs.js` uses
  (it also refreshes on its own each time the tab opens, until you edit a
  match). **Build bracket** makes a new one from a list of teams in seed order;
  when the numbers are odd the top seeds get a pass to round 2 (10 teams →
  seeds 1–6 pass), in single or double elimination. A team typed straight into
  a later-round match is drawn there with a PASS tag.

  *This week* shows the bracket as it stood that week — later results hidden,
  that week's matches highlighted — for weekly update posts. Columns come from
  each match's week; type a *Round* on a match to move it. In 4:5 a crowded
  bracket puts the grand final under the lower final.
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
