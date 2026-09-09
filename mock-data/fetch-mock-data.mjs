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

async function getImprint(endpoint) {
  const res = await fetch(`${siteUrl}/api/imprint/${endpoint}`);
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
  // Group by team-pair and sum match_count across fragments — a meeting is
  // fully played once that sums to 2, for this Bo2-only league. Mirrors
  // groupMeetingsFromMatches() in functions/api/imprint-sync.js.
  const meetings = new Map(); // pairKey -> { fragmentIds, totalMatches }
  for (const s of allSeries) {
    const teamIds = (s.teams || []).map((t) => t.team_id).filter((id) => id != null);
    if (teamIds.length !== 2 || s.series_id == null) continue;
    const pairKey = [...teamIds].sort((a, b) => a - b).join('-');
    const m = meetings.get(pairKey) || { fragmentIds: [], totalMatches: 0 };
    m.fragmentIds.push(s.series_id);
    m.totalMatches += Number(s.match_count) || 0;
    meetings.set(pairKey, m);
  }
  const decidedMeetings = [...meetings.values()].filter((m) => m.totalMatches === 2);

  const existingSeries = await readExistingBundleSeries();
  const alreadyFetched = new Set(existingSeries.map((s) => String(s.series_id)));
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
  const combined = new Map(existingSeries.map((s) => [String(s.series_id), s]));
  for (const s of newSeries) combined.set(String(s.series_id), s);
  await writeJson('imprint-series-bundle.json', {
    endpoint: 'series-bundle',
    leagueId: teamsBody.leagueId,
    data: { series: [...combined.values()] }
  });

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
