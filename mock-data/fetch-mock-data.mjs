#!/usr/bin/env node
// Populates mock-data/*.json from the live site's own public Imprint proxy
// (no API key needed — functions/api/imprint holds it server-side), so
// standings.html?mock=1 can preview real win/tie/loss and roster numbers
// fully offline. Run from anywhere; it always writes into this file's own
// directory (mock-data/).
//
// Incremental: each run only pulls up to BATCH_SIZE not-yet-cached meetings
// (default 10) and appends them to the existing imprint-series-bundle.json
// instead of re-fetching the whole season every time — same backlog idea as
// imprint-sync.js's own series_synced_ids, just driven by re-running this
// script instead of page loads. Keep re-running it (same command) until it
// reports everything's caught up; teams/players/matches are still
// refreshed in full every run since those are cheap single requests.
//
// Usage:
//   node mock-data/fetch-mock-data.mjs [siteUrl] [batchSize]
//
// siteUrl defaults to https://secretshopdota.co.uk — pass a preview deploy
// URL instead if that's what you want to test against, e.g.:
//   node mock-data/fetch-mock-data.mjs https://my-branch.secretshop-2.pages.dev
// or your own local `wrangler pages dev` server if you're testing code that
// hasn't been deployed yet:
//   node mock-data/fetch-mock-data.mjs http://localhost:8788
//
// batchSize defaults to 10 meetings per run. Pass a number to change it, or
// "all" (or 0) to fetch everything remaining in one go, like this script
// used to:
//   node mock-data/fetch-mock-data.mjs http://localhost:8788 25
//   node mock-data/fetch-mock-data.mjs http://localhost:8788 all
//
// Writes:
//   imprint-teams.json           <- GET /api/imprint/teams (full refresh)
//   imprint-players.json         <- GET /api/imprint/players (full refresh)
//   imprint-matches.json         <- GET /api/imprint/matches (full refresh)
//   imprint-playoff-bundle.json  <- GET /api/imprint/series/{id} for every
//                                    playoff series (stat designer only)
//   imprint-series-bundle.json   <- GET /api/imprint/series/{id}, one batch
//                                    of meetings at a time, MERGED into
//                                    whatever's already in this file rather
//                                    than overwritten (see "meetings" below)
//
// Does NOT touch imprint-heroes.json — that one ships as a small hand-built
// fixture on purpose (see README.md). Re-fetch it yourself if you want live
// hero stats too:
//   curl <siteUrl>/api/imprint/heroes -o mock-data/imprint-heroes.json
//
// Note: this used to fetch /api/imprint/fixtures instead of /matches, but
// that endpoint 404s for this league — Imprint's own docs say that means
// the league doesn't have fixtures (their scheduling feature) set up at
// all, only replay-parsed match data. /matches' own `series` array covers
// the same ground, EXCEPT Valve's series_id frequently splits one real Bo2
// meeting into two separate match_count=1 "series" entries (confirmed on
// this league's real data) — so "meetings" below groups /matches' entries
// by team-pair and sums match_count across them the same way
// groupMeetingsFromMatches() does in functions/api/imprint-sync.js (see the
// big comment at the top of that file), and js/standings.js's
// mockGroupMeetingsFromBundle()/mockMergeMeetingIntoComputedTeams() do the
// equivalent client-side once the bundle below is loaded.
//
// The series bundle is the slow part — one request per not-yet-cached
// series_id in a meeting this batch covers. They're proxied and edge-cached
// for 6h server-side (see SERIES_EDGE_CACHE_SECONDS in functions/api/
// imprint/[[route]].js), so re-requesting one you already have is cheap,
// but this script skips already-cached fragments anyway.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const siteUrl = (process.argv[2] || 'https://secretshopdota.co.uk').replace(/\/+$/, '');
const batchArg = (process.argv[3] || '').toLowerCase();
const BATCH_SIZE = batchArg === 'all' || batchArg === '0' ? Infinity : (Number(batchArg) || 10);
const outDir = dirname(fileURLToPath(import.meta.url));

// Group stage only, split from the playoffs by match id exactly as
// PLAYOFFS_FIRST_MATCH_ID in functions/api/imprint-sync.js (keep the two in
// step). Without it, two teams that met in both phases add up to more than 2
// games and their group meeting is never fetched, and a 2-0 playoff Bo3 looks
// like a finished Bo2. Playoff games live in Supabase (league_data_cache.
// playoff_series), which is where the stat designer reads them from.
const PLAYOFFS_FIRST_MATCH_ID = 8995000000;
const isGroupStageSeries = (s) => (s.matches || []).length > 0 && s.matches.every((id) => id < PLAYOFFS_FIRST_MATCH_ID);
// series_id 0 is Imprint lumping unrelated games together — there's no /series/0.
const isPlayoffSeries = (s) => Boolean(s.series_id) && (s.matches || []).length > 0 && s.matches.every((id) => id >= PLAYOFFS_FIRST_MATCH_ID);
const PLAYOFF_BUNDLE = 'imprint-playoff-bundle.json';

// ---------- games Imprint couldn't name ----------
// When a team doesn't set its Dota team in the lobby, Imprint's post says
// "#DOTA_GoodGuys" and /matches files the game under series_id 0 ("Unknown
// Team", team_id 0), one catch-all for every such game. Its team labels are
// junk (they change between requests) and there's no /series/0, so those games
// never reach the bundles and their meeting looks a game short. Each one is
// rebuilt from OpenDota in the same shape as /series/{id}, with both teams
// worked out from who played (imprint-players.json says which team each
// account plays for), and saved as its own one-game fragment, series_id
// "unnamed-<match id>". No Imprint ratings for these: OpenDota doesn't have them.
const isUnnamedSeries = (s) => !Number(s.series_id) || (s.teams || []).some((t) => !Number(t.team_id));
const UNNAMED_MIN_PLAYERS = 3; // of a side's 5 that must play for the same team

async function openDota(path) {
  const res = await fetch(`https://api.opendota.com/api/${path}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`OpenDota ${path}: ${res.status}`);
  return res.json();
}

// Default lobby names. Some players are even registered to a real Dota team called "#DOTA_BadGuys".
const isPlaceholderTeam = (t) => !t || !Number(t.team_id) || /^#?dota_(goodguys|badguys)$|^unknown team$/i.test(String(t.team_name || '').trim());

// saved: every series already in the bundles. Each account's team is the one it
// has played the most saved games for, else its team on Imprint's player list.
async function repairUnnamedGames(allSeries, players, saved) {
  const have = new Set(saved.flatMap((s) => (s.matches || []).map((m) => String(m.match_id))));
  const ids = [...new Set(allSeries.filter(isUnnamedSeries).flatMap((s) => s.matches || []))]
    .filter((id) => !have.has(String(id)));
  if (!ids.length) return [];
  console.log(`Unnamed games: ${ids.length} game(s) Imprint has without a team name, rebuilding from OpenDota...`);
  const played = new Map(); // account -> { name, teams: Map(team_id -> { team, n }), pos: Map(position -> n) }
  const bump = (map, key, val) => map.set(key, { ...val, n: (map.get(key)?.n || 0) + 1 });
  for (const s of saved) for (const m of s.matches || []) for (const t of m.teams || []) {
    if (isPlaceholderTeam(t)) continue;
    for (const p of t.players || []) {
      const mine = played.get(Number(p.account_id)) || { teams: new Map(), pos: new Map() };
      mine.name = p.account_name || mine.name;
      bump(mine.teams, t.team_id, { team: t });
      if (p.position) bump(mine.pos, p.position, { pos: p.position });
      played.set(Number(p.account_id), mine);
    }
  }
  const listed = new Map(players.map((p) => [Number(p.account_id), p]));
  const most = (map) => [...(map?.values() || [])].sort((a, b) => b.n - a.n)[0] || null;
  const byAccount = new Map(); // account -> { account_name, team, position, n (games at that position) }
  for (const id of new Set([...played.keys(), ...listed.keys()])) {
    const g = played.get(id);
    const t = most(g?.teams)?.team;
    const team = t ? { team_id: t.team_id, team_name: t.team_name, team_logo_src: t.team_logo_src } : listed.get(id)?.team;
    const pos = most(g?.pos);
    if (!isPlaceholderTeam(team)) {
      byAccount.set(id, {
        account_name: listed.get(id)?.account_name ?? g?.name,
        team,
        position: pos?.pos ?? listed.get(id)?.position ?? null,
        n: pos?.n ?? 0,
      });
    }
  }
  // OpenDota can't say who played which role, so each player gets their usual
  // position: the most played one first, a clash goes to whoever has played it
  // more, and anyone left over takes the positions nobody has.
  const positions = (ps) => {
    const out = new Map();
    const free = new Set([1, 2, 3, 4, 5]);
    const ranked = ps.map((p) => ({ p, k: byAccount.get(Number(p.account_id)) })).sort((a, b) => (b.k?.n || 0) - (a.k?.n || 0));
    for (const { p, k } of ranked) if (k?.position && free.delete(k.position)) out.set(p, k.position);
    for (const { p } of ranked) if (!out.has(p)) { const [pos] = free; out.set(p, pos ?? null); free.delete(pos); }
    return out;
  };
  let heroes;
  try { heroes = new Map(Object.values(await openDota('constants/heroes')).map((h) => [h.id, h])); } catch (e) {
    console.warn(`  skipped them all, no hero list from OpenDota: ${e.message}`);
    return [];
  }
  const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const out = [];
  for (const id of ids) {
    let m;
    try { m = await openDota(`matches/${id}`); } catch (e) { console.warn(`  ${id}: ${e.message}`); continue; }
    if (!(m.players || []).length) { console.warn(`  ${id}: OpenDota has no players for it yet`); continue; }
    const sides = [true, false].map((radiant) => {
      const ps = m.players.filter((p) => Boolean(p.isRadiant ?? p.player_slot < 128) === radiant);
      const votes = new Map();
      for (const p of ps) {
        const t = byAccount.get(Number(p.account_id))?.team;
        if (t) votes.set(t.team_id, { team: t, n: (votes.get(t.team_id)?.n || 0) + 1 });
      }
      const best = [...votes.values()].sort((a, b) => b.n - a.n)[0];
      return { radiant, ps, team: best && best.n >= UNNAMED_MIN_PLAYERS ? best.team : null, n: best?.n || 0 };
    });
    if (!sides[0].team || !sides[1].team || sides[0].team.team_id === sides[1].team.team_id) {
      console.warn(`  ${id}: couldn't tell the teams apart from the players (${sides.map((s) => `${s.team?.team_name ?? '?'} ${s.n}/5`).join(' vs ')}), skipped`);
      continue;
    }
    const match = {
      match_id: Number(id),
      duration: clock(m.duration),
      timestamp: new Date(m.start_time * 1000).toISOString(),
      teams: sides.map((s) => {
        const kills = s.radiant ? m.radiant_score : m.dire_score;
        const pos = positions(s.ps);
        return {
          team_id: s.team.team_id,
          team_name: s.team.team_name,
          team_logo_src: s.team.team_logo_src,
          win: s.radiant === Boolean(m.radiant_win),
          is_radiant: s.radiant,
          kills,
          players: s.ps.map((p) => {
            const known = byAccount.get(Number(p.account_id));
            const h = heroes.get(p.hero_id);
            return {
              account_id: p.account_id ?? null,
              account_name: known?.account_name ?? p.personaname ?? 'Unknown',
              position: pos.get(p),
              hero: h ? { name: h.localized_name, raw_name: h.name, id: h.id } : null,
              kills: p.kills, deaths: p.deaths, assists: p.assists,
              net_worth: p.net_worth ?? null, level: p.level ?? null, hero_damage: p.hero_damage ?? null,
              imprint_rating: null,
              kill_participation: kills ? `${(((p.kills + p.assists) / kills) * 100).toFixed(2)}%` : null,
            };
          }).sort((a, b) => (a.position ?? 9) - (b.position ?? 9)),
        };
      }),
    };
    console.log(`  ${id}: ${match.teams.map((t) => t.team_name).join(' vs ')}`);
    out.push({
      series_id: `unnamed-${id}`,
      start_timestamp: match.timestamp,
      match_count: 1,
      repaired_from: 'opendota',
      teams: match.teams.map((t) => ({ team_id: t.team_id, team_name: t.team_name, team_logo_src: t.team_logo_src })),
      matches: [match],
    });
  }
  console.log(`Unnamed games: rebuilt ${out.length} of ${ids.length}.`);
  return out;
}

// Playoff games in full (net worth, hero damage, kill participation …), for
// the stat designer. The site's own copy in Supabase is trimmed to what the
// Playoffs tab shows, so whole-season averages need these. A separate file so
// Standings' ?mock=1 group-stage records never see them. Every playoff series
// is small, so this always catches up in one go; a series is refetched when
// Imprint reports more games in it than the copy here has (a Bo3 mid-play).
async function readPlayoffBundleSeries() {
  try { return (JSON.parse(await readFile(join(outDir, PLAYOFF_BUNDLE), 'utf8')).data || {}).series || []; } catch { return []; /* first run */ }
}

// repaired: playoff games rebuilt by repairUnnamedGames(), added as they are
async function updatePlayoffBundle(allSeries, repaired = []) {
  const existing = await readPlayoffBundleSeries();
  const have = new Map(existing.map((s) => [String(s.series_id), s]));
  for (const s of repaired) have.set(String(s.series_id), s);
  const pending = allSeries.filter(isPlayoffSeries).filter((s) => {
    const got = have.get(String(s.series_id));
    return !got || (got.matches || []).length < (Number(s.match_count) || 0);
  });
  if (!pending.length && !repaired.length) { console.log(`Playoffs: all ${have.size} series already saved.`); return; }
  if (pending.length) console.log(`Playoffs: fetching ${pending.length} series...`);
  let ok = 0;
  for (const s of pending) {
    try {
      const body = await getImprint(`series/${encodeURIComponent(s.series_id)}`);
      have.set(String(s.series_id), body.data);
      ok++;
    } catch (e) {
      console.warn(`  skipped playoff series ${s.series_id}: ${e.message}`);
    }
  }
  await writeJson(PLAYOFF_BUNDLE, { endpoint: 'playoff-series-bundle', data: { series: [...have.values()] } });
  console.log(`Playoffs: saved ${ok + repaired.length} series (${have.size} in total).`);
}

async function getImprint(endpoint) {
  // series/{id} sits in the relay's edge cache for 6h even if it was first asked
  // for mid-series (the match-cards bot looks series up after every game), so a
  // copy missing later games could come back here. A query string skips it.
  const fresh = endpoint.startsWith('series/') ? `?fresh=${Date.now()}` : '';
  const res = await fetch(`${siteUrl}/api/imprint/${endpoint}${fresh}`);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) {
    throw new Error(`GET /api/imprint/${endpoint} failed: ${(body && body.error) || res.status}`);
  }
  return body;
}

async function writeJson(name, obj) {
  const path = join(outDir, name);
  await writeFile(path, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log(`  wrote ${name}`);
}

// Empty array if the bundle doesn't exist yet (first run) or is unreadable.
async function readExistingBundleSeries() {
  try {
    const raw = await readFile(join(outDir, 'imprint-series-bundle.json'), 'utf8');
    const body = JSON.parse(raw);
    return (body.data && body.data.series) || [];
  } catch {
    return [];
  }
}

async function writeBundle(teamsBody, existingSeries, newSeries) {
  const combined = new Map(existingSeries.map((s) => [String(s.series_id), s]));
  for (const s of newSeries) combined.set(String(s.series_id), s);
  await writeJson('imprint-series-bundle.json', {
    endpoint: 'series-bundle',
    leagueId: teamsBody.leagueId,
    data: { series: [...combined.values()] }
  });
}

async function main() {
  console.log(`Fetching mock data from ${siteUrl} ...`);

  const [teamsBody, playersBody, matchesBody] = await Promise.all([
    getImprint('teams'),
    getImprint('players'),
    getImprint('matches')
  ]);
  await writeJson('imprint-teams.json', teamsBody);
  await writeJson('imprint-players.json', playersBody);
  await writeJson('imprint-matches.json', matchesBody);

  const allSeries = (matchesBody.data && matchesBody.data.series) || [];
  const existingSeries = await readExistingBundleSeries();
  const saved = [...existingSeries, ...(await readPlayoffBundleSeries())];
  const repaired = await repairUnnamedGames(allSeries, (playersBody.data && playersBody.data.players) || [], saved);
  const isPlayoffGame = (s) => s.matches[0].match_id >= PLAYOFFS_FIRST_MATCH_ID;
  const repairedGroup = repaired.filter((s) => !isPlayoffGame(s));
  await updatePlayoffBundle(allSeries, repaired.filter(isPlayoffGame));
  // Group by team-pair and sum match_count across fragments — a meeting is
  // fully played once that sums to 2, for this Bo2-only league. Mirrors
  // groupMeetingsFromMatches() in functions/api/imprint-sync.js.
  const meetings = new Map(); // pairKey -> { fragmentIds, totalMatches }
  // Rebuilt unnamed games (saved before, or just now) count towards their meeting
  // like any fragment; Imprint's series 0 itself never does (its teams are junk).
  const rebuilt = [...existingSeries.filter((s) => String(s.series_id).startsWith('unnamed-')), ...repairedGroup];
  const asListed = (x) => ({ ...x, matches: x.matches.map((m) => m.match_id) }); // /matches shape: ids, not games
  for (const s of [...allSeries.filter((x) => !isUnnamedSeries(x)), ...rebuilt.map(asListed)]) {
    if (!isGroupStageSeries(s)) continue;
    const teamIds = (s.teams || []).map((t) => t.team_id).filter((id) => id != null);
    if (teamIds.length !== 2 || s.series_id == null) continue;
    const pairKey = [...teamIds].sort((a, b) => a - b).join('-');
    const m = meetings.get(pairKey) || { fragmentIds: [], totalMatches: 0 };
    m.fragmentIds.push(s.series_id);
    m.totalMatches += Number(s.match_count) || 0;
    meetings.set(pairKey, m);
  }
  const decidedMeetings = [...meetings.values()].filter((m) => m.totalMatches === 2);

  // A fragment only counts as cached if the saved copy has every game /matches
  // says it has — an earlier run may have saved it before Imprint had them all
  // (or got a stale cached copy), and it would otherwise never be fetched again.
  const expected = new Map(allSeries.map((s) => [String(s.series_id), Number(s.match_count) || 0]));
  const alreadyFetched = new Set(existingSeries
    .filter((s) => (s.matches || []).length >= (expected.get(String(s.series_id)) ?? 0))
    .map((s) => String(s.series_id)));
  const short = existingSeries.length - alreadyFetched.size;
  for (const s of repairedGroup) alreadyFetched.add(String(s.series_id));
  if (short) console.log(`${short} saved series are missing games — fetching them again.`);
  // A meeting is "pending" if any of its fragments aren't cached yet —
  // walked whole (never just one side of a split meeting) so a meeting's
  // two fragments are never left half-cached, same as imprint-sync.js.
  const pendingMeetings = decidedMeetings.filter(
    (m) => !m.fragmentIds.every((id) => alreadyFetched.has(String(id)))
  );

  console.log(
    `${decidedMeetings.length} fully-played meetings total, ${existingSeries.length} series already cached, `
    + `${pendingMeetings.length} meeting(s) still to fetch.`
  );

  if (!pendingMeetings.length) {
    if (repairedGroup.length) await writeBundle(teamsBody, existingSeries, repairedGroup);
    console.log('\nAll caught up — imprint-series-bundle.json already covers every fully-played meeting.');
    console.log('Preview with: standings.html?mock=1');
    return;
  }

  const newSeries = [];
  let meetingsDone = 0;
  const batchMeetings = pendingMeetings.slice(0, BATCH_SIZE === Infinity ? pendingMeetings.length : BATCH_SIZE);
  console.log(`Fetching ${batchMeetings.length} meeting(s) this run...`);

  // Sequential on purpose — this is a one-off local tool, not something that
  // needs to race the edge cache or the upstream Imprint API.
  for (const m of batchMeetings) {
    const toFetch = m.fragmentIds.filter((id) => !alreadyFetched.has(String(id)));
    for (const key of toFetch) {
      try {
        const body = await getImprint(`series/${encodeURIComponent(key)}`);
        newSeries.push(body.data);
      } catch (e) {
        console.warn(`  skipped series ${key}: ${e.message}`);
      }
    }
    meetingsDone++;
    if (meetingsDone % 10 === 0 || meetingsDone === batchMeetings.length) {
      console.log(`  ${meetingsDone}/${batchMeetings.length} meetings`);
    }
  }

  // Merge rather than overwrite — keyed by series_id so a re-fetched
  // fragment (e.g. from an interrupted prior run) replaces the old copy
  // instead of duplicating it.
  await writeBundle(teamsBody, existingSeries, [...repairedGroup, ...newSeries]);

  const remaining = pendingMeetings.length - meetingsDone;
  console.log(`\nFetched ${meetingsDone} meeting(s) this run (${newSeries.length} series request(s)).`);
  if (remaining > 0) {
    console.log(`${remaining} meeting(s) still remaining — run this exact command again to fetch the next batch.`);
  } else {
    console.log('All caught up!');
  }
  console.log('Preview with: standings.html?mock=1');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
