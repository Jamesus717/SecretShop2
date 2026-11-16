# SecretShop / SecretLeague website redesign — master brief

Owner: James (Borty). Manager: HQ Claude session. Builders read this first.

## Goal
Replace the static HTML/CSS/JS site with a **React + Vite + TypeScript** site that looks
premium and "present": a real esports-league site, not a hobby page. Headline content:
1. **"Lazy League — Coming Soon"** hero (the next tournament; date TBA, no fake date).
2. **SecretLeague I Champions** showcase: winners + runners-up of all three divisions.
3. Everything the old site does still works (standings, playoffs, team info, news, rules,
   profile, register, admin balancer, admin clips, Discord login).

Branch: `james/react-redesign` (off `main`). **Never merge to main. Never deploy.**

## Stack (fixed, don't debate)
- Vite 5 + React 18 + TypeScript (allow `.js` for ported logic where typing would be a
  slog, but new components are `.tsx`). Vite layout at repo root.
- `react-router-dom` v6, **BrowserRouter**. Routes MUST keep the old URLs because Discord,
  the bot and bookmarks link to them: `/`, `/team-info`, `/playoffs`, `/groupstage`,
  `/standings`, `/news`, `/rules`, `/profile`, `/register`, `/balancer`, `/clips`.
  Also accept the old `*.html` forms (`/playoffs.html` → `/playoffs`) via a redirect route.
- `framer-motion` for animation. `@supabase/supabase-js` v2 via npm (not the CDN).
- Styling: **vanilla CSS with design tokens** (`src/styles/tokens.css`, `global.css`) +
  CSS Modules per component. No Tailwind, no UI kit. Fonts: **Barlow Condensed** (display,
  600/700, uppercase) + **Inter** (body/tables, tabular numerals) from Google Fonts.
- Old site is moved to `legacy/` (git mv) for reference. `functions/api/**` stays exactly
  where it is (Cloudflare Pages Functions). `public/` holds `assets/`, favicons, `_redirects`
  (`/* /index.html 200`).
- Build output `dist/`. `npm run build` must pass with zero TypeScript errors.
  `npm run lint` (eslint) must pass. `npm test` (vitest) for ported pure logic.

## Design direction (from research of ESL, BLAST, PGL, DreamLeague, LoL Esports)
- **Dark "trophy room"**: deep navy/charcoal base (`#0b0f1a`-ish), gold reserved for honours,
  hairline 1px translucent borders, sharp corners (radius ≤ 6px), 3–4% noise/grain overlay,
  soft radial gold glow behind key moments. No rounded SaaS cards.
- **Division colours are meaning, keep them**: Upper = gold `#e8b84a`, Middle = teal
  `#2dd4bf`, Lower = crimson `#ef4444`. Used as tags/edges/backgrounds with dark ink, never
  as small coloured text. Losses use a muted rose, not division red.
- Light theme must still exist (toggle in nav, persisted in localStorage `theme`), and must
  pass AA contrast. Measure, don't eyeball.
- Type: Barlow Condensed uppercase for headings/wordmarks/scores; Inter for everything else.
  `font-variant-numeric: tabular-nums` on any number that updates.
- **Motion rules**: entrances 400–700 ms fade + 12 px rise, interactions 150–250 ms, ease-out,
  transform/opacity only. Animate: hero entrance, countdown seconds tick, stat count-ups on
  scroll-in, hover lift/glow, bracket winner-path draw-in, slow sponsor marquee. Don't animate
  tables, body text, or anything behind text. Everything non-essential inside
  `@media (prefers-reduced-motion: no-preference)` / framer `useReducedMotion()`.
- Mobile first: 16 px gutters, no horizontal scroll at 375 px.
- Every string from sheets/DB is hostile: React escapes by default; **never use
  `dangerouslySetInnerHTML`** with remote data.

## Home page (the showcase) — section order
1. **Live strip** under the nav: one line, e.g. "Lazy League · Coming soon · Join the Discord"
   (later: next match). Shown on every page.
2. **Hero: LAZY LEAGUE — COMING SOON.** Full-bleed dark key art (use `assets/background.jpg`
   or `dota leafy.jpg` with a heavy bottom gradient fade + gold glow), huge wordmark, gold
   "Coming soon" tag, line "Date to be announced" (no countdown until `LAZY_LEAGUE_START` in
   `src/config.ts` is set; when set, show a 4-block countdown with tabular digits).
   CTAs: primary gold "Join the Discord" (https://discord.gg/FvPF55KkYY), secondary
   "See SecretLeague I champions" (anchor to section 3). Teaser row of 12 blurred/silhouetted
   team slots with "?" and the line "Teams revealed at sign-ups".
3. **SecretLeague I — Champions.** Stacked hierarchy: Upper = full-width panel with gold glow;
   Middle and Lower side by side below (stack on mobile). Each panel: division tag, big crest
   (120–160 px, initials-in-hex fallback), team name in display face, trophy icon, roster as
   5 chips (IGN + position 1–5), "Runner-up" strip at the bottom: small crest, name, final
   score. Hover/tap expands to the path to the title (list of series won). Data in
   `src/data/champions.ts` (below). Count-up on "3 divisions · 23 teams · 34 series".
4. **What is SecretShop**: short copy + 4 feature badges (Weekly Inhouses, Casting, Coaching,
   SecretLeague) + socials (Twitch, YouTube, Instagram, TikTok, X; icons in
   `assets/socialimages/`).
5. **Latest** cards from the news API (`/api/news`, see legacy `js/newsfeed.js`): grid of
   cards with image, title, date, division tag. Hidden when empty.
6. **Prize pool** (keep the three tiers from legacy index.html) and **Supported by** sponsors
   (Imprint Esports, Balloon Dota, Dota 2 Ireland) as a slow marquee / three cards.
7. Footer: wordmark, socials, mailto secretleaguedota@gmail.com.

## Champions data (verified from the schedule sheet + site news cards, 2026-11-16)
```ts
// src/data/champions.ts  (roster entries are [ign, position])
export const SECRETLEAGUE_I = {
  season: 'SecretLeague I', year: 2026, teams: 23, series: 34,
  divisions: [
    { key: 'upper', label: 'Upper Division',
      champion: { name: 'N-stitution', logoKey: 'nstitution',
        roster: [['espresso depresso',1],['dekaiT',2],['Frasse',3],['alphabravoindia',4],['FlukeY',5]] },
      runnerUp: { name: 'Midlands Massive', logoKey: 'midlandsmassive',
        roster: [['Dara',1],['Polltegrais',2],['Starzi',3],['Lumière',4],['Mev',5]] },
      third: 'Golden Retrievers',
      final: { score: '2–1', date: '2026-10-22', format: 'Bo5' },
      path: ['Upper 6 · 2–0 SLOB Team', 'Upper 7 · 2–1 Golden Retrievers', 'Grand Final · 2–1 Midlands Massive'] },
    { key: 'mid', label: 'Middle Division',
      champion: { name: 'The Truers', logoKey: 'thetruers',
        roster: [['greg',2],['Muntacus',3],['Mark',4],['ruby',4],['benj!',5]] },
      runnerUp: { name: 'Money Talks', logoKey: 'moneytalks',
        roster: [['Lev',1],['Harry',2],['Andrew',3],['Dan',4],['Tom',5]] },
      third: 'The Bortymites',
      final: { score: '2–1', date: '2026-10-21', format: 'Bo5' },
      path: ['Middle 3 · 2–1 The Dark Side of the Map', 'Middle 14 · 2–0 Free Bans Gang', 'Middle 15 · 2–0 The Bortymites', 'Grand Final · 2–1 Money Talks'] },
    { key: 'lower', label: 'Lower Division',
      champion: { name: 'FarmVille', logoKey: 'farmville',
        roster: [['EbolaBear',1],['Akim',2],['Chromozones',3],['Luke',4],['Karenlyl',5]] },
      runnerUp: { name: 'Catwice', logoKey: 'catwice',
        roster: [['Quasar',1],['Lushless',2],['NeverFroget',3],['certified turtle',4],['Cold Comfort',5]] },
      third: 'Chutney Smugglers',
      final: { score: '2–0', date: '2026-10-24', format: 'Bo5' },
      path: ['Lower 3 · 2–1 No Sweat', 'Lower 5 · 2–0 Catwice', 'Grand Final · 2–0 Catwice'] },
  ],
};
```
Crests: uploaded logos come from Supabase `team_logos` (public bucket `team-logos`, see
legacy `js/teamlogo.js` `fetchTeamLogoMap` + `resolveTeamImage`); files in
`assets/teaminfoimgs/` (`FarmVille.png`, `Catwice.png`, `The_Truers.webp`, `MoneyTalks.png`).
The legacy resolver logic must be ported as-is (name → key → upload → file → initials).

## Data sources (unchanged; port the legacy logic, don't reinvent)
- Supabase: project url + publishable key in legacy `js/supabase.js` (client-side by design).
  Auth = Discord OAuth via Supabase (legacy `js/auth.js`). Admins = `admin_users` table.
- Playoff schedule: Google Sheet CSV (legacy `js/playoffs.js` top: SHEET_ID, HEADER_ALIASES,
  TEAM_ALIASES, FALLBACK_ROWS, linkResults). Rosters: Apps Script `/exec` URL (slow; show
  skeletons, cache in memory + sessionStorage).
- Standings: `league_data_cache` row via Supabase (legacy `js/standings.js`, 1.7k lines of
  logic: aliases, division seed, computed records, h2h tiebreak, trends). Port the pure logic
  into `src/lib/standings/*` with vitest tests on the mock data in `mock-data/`.
- News cards: `/api/news` (legacy `js/newsfeed.js`). Clips: `/api/clips` (legacy
  `clips.html` + its js). Imprint proxy: `/api/imprint/*`.
- Phase switch (`js/phase.js`), sign-up deadline (`js/config.js`) → `src/config.ts`.

## Repo conventions
- `src/app/` router + layout, `src/pages/<Page>/` one folder per route, `src/components/`
  shared, `src/lib/` ported logic (no React), `src/data/` static data, `src/styles/` tokens.
- Commit small, clear messages. Push your branch. Don't touch other builders' page folders.
- Secrets never in code. Read `.dev.vars.example` for the env var names the functions need.

## Done when (every builder runs these)
- `npm run build` → exit 0, no TS errors. `npm run lint` → exit 0. `npm test` → all pass.
- `npm run dev` and load each of your routes at 1280 px and 375 px: no console errors, no
  horizontal scroll, light and dark both readable (spot-check contrast with an actual
  measurement script, not by eye).
