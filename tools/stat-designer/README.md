# Stat Designer

A local page for making SecretShop league graphics: results, single-game scoreboards, hero and player highlights, leaderboards, head to heads, brackets, eliminated teams and team spotlights. You can export each as a PNG, in **16:9** (1920×1080, for stream / YouTube) or **4:5** (1080×1350, for socials), at 1× or 2×.

The SecretShop Discord bot (`match-cards-bot`) uses this page to make its cards, so whatever you change here shows up in the bot's cards too.

---

## Setup

1. Install **Node.js 18 or newer** (nodejs.org).
2. Double-click **`launch.bat`**. It starts a small local server on port 8734 and opens <http://localhost:8734/tools/stat-designer/>.
3. Close that window to stop the server.

Always start the designer with `launch.bat`, not by opening the file directly. The local server (`serve.mjs`) does three jobs:
- It saves hero art, item pictures and uploaded team crests locally, so they appear in exports. Images loaded straight from Steam or the site show on screen but come out blank in an export.
- It serves the league data the Compare, List and Hero tabs use.
- It runs **Update league data**.

If the page was opened another way, an orange bar warns you about this.

**Optional:** to download every hero picture up front (about 40–60 MB) instead of one at a time, run this from the repo root:
```
node tools/stat-designer/fetch-hero-art.mjs
```

---

## Usage

Pick a template from the tabs at the top and fill in the panel on the left. The preview updates as you type. When you're done:
1. Choose **16:9** or **4:5**.
2. Press **Download PNG** or **Copy image**. Copy image pastes straight into Discord or Twitter.

Your work autosaves in the browser. **Presets** saves or loads the whole setup as a JSON file.

### Templates

| Tab | What it's for | Quick fill |
|---|---|---|
| **Hero** | One hero's league numbers, or one player's game | Type a hero, or paste a **match ID**, press **Fetch** and pick the player for a player highlight |
| **List** | Hero grids, leaderboards and team lists | **Starting points**: Most picked, Most banned, Most contested, Top win rate, Unpicked, Never banned, **Eliminated teams**, **Biggest / Smallest hero pools** |
| **Match** | One game's scoreboard: kills, match time, and each player's hero, name, K/D/A, net worth, items and neutral item | Paste a **match ID** and press **Fetch** (OpenDota). **Swap sides on the card** puts the other team on the left. Every player row stays editable. |
| **Result** | A series: score, division and both drafts per game | Paste a match ID per game and press **Fetch** (OpenDota). Use **Swap teams for this game** if the sides came out backwards. |
| **VS** | An upcoming match: both crests and names with a big VS, under a COMING UP header | Pick both teams. Optional division badge, a line under VS (e.g. *Best of 3*) and a *When* line (e.g. *Live now · twitch.tv/…*) |
| **Compare** | Two players head to head over the league | Pick a team and player on each side |
| **Bracket** | Playoff bracket, upper and lower | **Load from playoff sheet**, or **Build bracket** from seeded teams. *This week* shows the bracket as it stood that week. |
| **Team** | Crest, name, division, message, stat tiles and roster | Pick the team, then **Fill tiles & roster from league data** (whole season, group stage or playoffs) |

### List modes
- **Hero grid:** portraits with names. Good for "never picked".
- **Ranked table:** a top-10 with an optional bar.
- **Team list:** bracket-style team rows with crest, name, note, division tag and score. **Eliminated teams** fills this from the playoff sheet with every team whose last playoff loss knocked them out, who beat them, where, and the score. You can also paste teams yourself, one per line: `Team, division, note, score`. **Biggest / Smallest hero pools** use the same rows for players: crest and division from their team, the team name as the note, and the number of different heroes they've played over the whole season in the box (top 10, players with 5+ games; change `HERO_POOL_MIN_GAMES` at the top of the script).

You can paste data straight from a spreadsheet (tab- or comma-separated). `{count}` in a title or subtitle is replaced with the number of rows.

### League data
- **Compare, List, Hero and Team** use every league game, group stage and playoffs. The status line shows how many of each. Both stages are in the snapshot in `mock-data/` (`imprint-series-bundle.json` for the group stage, `imprint-playoff-bundle.json` for the playoffs). Playoff games that finished since the last update are added from the live site (`league_data_cache.playoff_series` in Supabase), so they count straight away.
- Press **Update league data** to pull newly finished games into the snapshot. A group-stage Bo2 only counts once both games are in. Playoff games show up without an update, but the live site's copy has no net worth, hero damage or kill participation. Until you update, those averages leave out the newest playoff games, and the status line says how many.
- **Team → Fill tiles & roster** counts series the way Standings does. In the group stage, a 2–0 is a win, a 1–1 a draw, plus forfeits recorded on the site. In the playoffs, series results come from the playoff sheet, which includes forfeits. Forfeits have no games, so they only show in the series record.
- **Bans** come from Imprint via the site. The last copy is saved in `league-cache/`, so it still works offline.
- **Bracket and Eliminated teams** read the playoff Google Sheet. The sheet must stay shared as "anyone with the link".

### Look
Under **Look & branding** you can set the background, accent colour, leaves, season badge, footer site and sponsors. All three sponsors (IDL, BalloonDota and Imprint Esports) are on by default. Your browser remembers what you last ticked.

---

## Keeping it current
All of these lists are near the top of the script in `index.html`:

| To change | Edit |
|---|---|
| A new team | Add it to `TEAMS` (name, division, crest file in `assets/teaminfoimgs/`). Crests uploaded on the site are picked up automatically. |
| A new sponsor | Add it to `SPONSORS`. It's on by default. |
| A hero nickname the paste box doesn't recognise | Add it to `HERO_ALIASES` |
| A new hero | Add it to `heroes.js` |
| A new item | Add it to `items.js` (id, internal name, display name, neutral 1/0). The internal name is also its picture's name on Steam's CDN. |

This folder deploys with the website, so it's also reachable at `/tools/stat-designer/` on the live site. That's harmless, but move it out of the repo if you'd rather it wasn't.
