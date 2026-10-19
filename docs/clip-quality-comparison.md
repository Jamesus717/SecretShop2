# Highlight cutter: clip quality on a real series

Test series: **SecretLeague S1 — FarmVille vs CATWICE, 30 Sep 2026** (YouTube `4LgurnKiJKQ`, 2h54m).
Game 1 `9023460123` (79 min, 5 pauses), game 2 `9023604453` (40 min). Both OpenDota-parsed; the
scan found both games and synced them (VOD 1230–6090 s and 7662–10062 s).

Run with `_tests/quality-run.mjs <cutter folder> <label> render` in the data folder
(`C:\Users\james\Videos\SecretShop`). Shorts land in `output\quality-<label>\shorts\`, with a
start / middle / end frame strip for each in `output\quality-<label>\frames\`. Captions off and no
page-drawn overlay, so only the clip choice and trim differ between runs.

## Before (`james/cutter-output`, `1ae49c2`)

### The 4 auto-picked Shorts (rendered in 113 s, NVENC)

| # | Short | Score | Length | Game clock | VOD | Why it scored | Start / end right? |
|---|---|---|---|---|---|---|---|
| 1 | G1 Teamfight to CATWICE 4–2 · Comeback | 120 | 59.1 s | 48:46 → ~49:45 | 4232.8–4292.0 | 6 kills (60) + extra kills (24) + comeback (10), ×1.2 late game | **Starts 19 s before the first kill**: heroes walking in the frame strip. Ends 6 s after the last kill. Sits at the 59 s cap. |
| 2 | G1 Kez triple kill · Comeback | 136 | 55.3 s | 63:38 → ~64:33 | 5124.8–5180.0 | 6 kills + triple kill (15) + comeback, ×1.2 | Lead-in 12 s, which is OK. The fight runs 37 s, so the clip is long but busy. Ends 6 s after. |
| 3 | G2 Teamfight to FarmVille 4–3 | 106 | 43.6 s | 15:23 → ~16:06 | 8581.0–8624.5 | 7 kills (70) + extra kills (30), early so no ×1.2 | **19 s lead-in** for an 18 s fight: almost half the Short is build-up. |
| 4 | G2 Teamfight to CATWICE 4–1 · Roshan · Comeback | 96 | 59.1 s | 27:01 → ~28:01 | 9279.0–9339.5 | 5 kills + Roshan (12) + comeback | Planned 60.5 s, so the render **cut 1.5 s off the start** to fit 59 s. Opens on the Roshan fight, which is fine. |

### What's wrong (checked against the real moment list)

1. **The best moment of each game is never a Short.** The game-winning fight (G1 score 247, 9 kills;
   G2 score 166) is left out on purpose (`!m.ending` in `loadGame`). It's the obvious Short.
2. **The lead-in is too long for a Short.** When OpenDota has a teamfight, the clip starts at
   `teamfight.start − 4`, which is usually **19 s before the first kill**. That's fine for the YouTube
   cut, but on TikTok/Shorts the first 3 s decide whether people stay. 3 of 4 Shorts open on walking.
3. **Shorts hit the 59 s cap**, and the cap trims the start, so how much build-up is left depends on
   how long the fight was. The length isn't chosen at all.
4. **Only 2 Shorts per game**, picked purely by score. G1 has 18 teamfights; the 3rd–6th best
   (102, 89, 74, 72) are just as Short-worthy.
5. **The YouTube cut is padded with filler.** The budget assumes a Bo3 goes to 3 games (570 s per game),
   so a 2–0 leaves **650 s of the 30:00 as padding card**. Game 2 still fills its budget with
   a lone first blood (16), a barracks with no kills (19, twice), a Roshan with no fight (14) and a
   2-kill pick-off. Game 1 meanwhile leaves out eight fights scoring 52–58.
6. **Moments next to each other repeat footage.** G2 38:31 Roshan (to 38:53), 38:57 Clinkz pick-offs and
   39:24 GG are three separate YouTube clips, a few seconds apart, around one fight.
7. **Caster-hype moments are weak** here (scores 7–16, 13–21 s). Nothing to auto-tick.

**Why Borty sees short or weak clips:** the auto-Shorts aren't short, but they're padded at the front
and miss the best fight. The YouTube cut does have short clips: 18–27 s lone kills and objectives
that score low.

## After (`james/clip-quality`)

### What changed (`lib/moments.mjs`, `lib/pipeline.mjs`, `serve.mjs`)

- **Lead-in capped at 8–12 s before the first kill** (`LEAD_IN` 8, `MAX_LEAD` 12). Still uses OpenDota's
  teamfight start when it's inside that, so the clip opens on the fight starting, not the walk there.
- **Only real fights are auto-picked**: a new `fight` flag means 3+ kills or an Aegis steal. Lone
  kills, 2-kill skirmishes, and a Roshan/barracks with nobody dying stay in the list for ticking by hand.
- **Default Shorts = the 3 best fights per game, the game-winning one included** (`pickShorts`).
- **No two picked clips share footage** (overlap > 3 s), in both the YouTube pick and the Shorts.
- **YouTube budget split by the games the series has** (at least 2 for a Bo3), via `gameBudget()`, instead
  of always ÷3.
- **Clips stop at most 5 s after the in-game clock goes** (was 15 s), so the GG Short doesn't run into the
  post-game caster screen.

### The 6 auto-picked Shorts (rendered in ~135 s)

Files: `C:\Users\james\Videos\SecretShop\output\quality-after\shorts\` (frame strips in `..\frames\`).

| # | Short | Score | Length (before → after) | Starts | Notes |
|---|---|---|---|---|---|
| 1 | G1 Teamfight to CATWICE 4–2 · Comeback | 120 | 59.1 → **52.3 s** | 12 s before the first kill (was 19 s) | Whole fight, no longer at the cap. |
| 2 | G1 Kez triple kill · Comeback | 136 | 55.3 → **51.3 s** | 8 s before (was 12 s) | |
| 3 | **G1 Teamfight to FarmVille 6–3 · GG** (new) | 247 | — → **59.1 s** | Mid-fight | The fight + ancient is 83 s, so the 59 s cap keeps the last 59 s: the second half of the fight and the throne. Ends 5 s after the ancient. |
| 4 | G2 Teamfight to FarmVille 4–3 | 106 | 43.6 → **36.6 s** | 12 s before (was 19 s) | 7 kills in 36 s: the tightest of the six. |
| 5 | G2 Teamfight to CATWICE 4–1 · Roshan · Comeback | 96 | 59.1 → **53.6 s** | 12 s before | No longer trimmed by the cap. |
| 6 | **G2 Teamfight to FarmVille 4–2 · GG** (new) | 166 | — → **41.1 s** | 8 s before | Fight, ancient, 5 s of reaction. |

### YouTube cut

| | Before | After |
|---|---|---|
| Clips (G1 / G2) | 11 / 15 | 19 / 8 |
| Highlight seconds | 1150 | 1201 |
| Padding card in the 30:00 | ~650 s | ~600 s |
| Lone kills / objectives with no fight | 6 (all in G2) | **0** |
| Clips sharing footage | 3 around the G2 ending | **0** |
| G1 fights scoring 52–58 left out | 8 | 0 |

G2 only has 8 real fights, so it uses 339 s of its 870 s. The rest is still padding rather than filler.

### Tests

The `_tests` scripts in the data folder, re-run on this branch: render (2 captioned Shorts, start on a
thumbnail, -13.8 LUFS), series video (35.0 s as expected), submitted-clip route, postcopy: **all pass**.
`node --check` on the changed files. The brand test is for `james/cutter-brand` and doesn't apply here.

### Still not right (next)

- **Long ending fights get cut at the start.** The 59 s cap trims from the front. A smarter cut would
  start at a kill, or drop the fight's quiet middle (G1's ending has a lull at Roshan).
- **Leftover budget isn't shared between games.** G2's unused ~530 s could go to more G1 fights instead
  of padding. That means picking per series, not per game.
- **Adding a game after loading** (e.g. a third game) doesn't re-split the budget for games already
  loaded; press **Auto-pick again** on them.
- Only checked on one series. Worth a second one (a 2–1 and a stomp) before relying on it.
