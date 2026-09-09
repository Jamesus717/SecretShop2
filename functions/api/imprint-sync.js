/**
 * League data sync — Cloudflare Pages Function.
 *
 * Keeps public.league_data_cache and public.player_names (see
 * league-data-cache-migration.sql) up to date so the Standings/Trends page
 * never has to call Imprint on a normal page load — it just reads those
 * rows from Supabase instead.
 *
 * standings.js calls this (GET, no args) once per page load, in the
 * background, right after it renders from whatever's already cached. The
 * admin "Force refresh" button on the page calls it with ?force=1.
 *
 * ---------------------------------------------------------------------
 * Why this doesn't just trust Imprint's /teams and /players win-loss numbers
 * ---------------------------------------------------------------------
 * Imprint's /league/{id}/teams and /league/{id}/players endpoints report
 * their own cumulative win/loss aggregates, but two real problems showed up
 * once we checked them against this league's actual data:
 *
 *   1. They're counted per GAME, not per SERIES. This league plays Bo2s, so
 *      a team's raw "wins"/"losses" is really 0-2 games per series, not the
 *      win/tie/loss record the Standings page needs to show.
 *
 *   2. They're not reliable per-team, per-position breakdowns. Confirmed on
 *      this league's real data: a team's registered position-1 starter can
 *      have ZERO games in /players (their games simply never got attributed
 *      to any account there), while another team's per-position total can
 *      be MORE than double the team's own match count (a transferred/
 *      stand-in player's personal wins/losses aren't scoped to just the
 *      games they played for that specific team). Meanwhile Imprint's own
 *      Discord bot posts a full, correct, per-player breakdown (hero,
 *      K/D/A, rating) for every match — so the real per-match data is
 *      there, the /players aggregate just doesn't roll it up right.
 *
 * So instead of caching Imprint's own team/player aggregates and showing
 * them as-is, this file rebuilds win/tie/loss and per-team-per-position
 * records itself from Imprint's match-level truth:
 *
 *   - GET /league/{id}/matches — used two ways. Cheaply, its flattened match
 *     ids are the "did anything change since last sync" check (unchanged
 *     from before). More importantly, its own `series` array is also the
 *     enumeration of every real series this league has played: each entry
 *     reports match_count and both teams for a Valve series_id — the "what
 *     series exist, who played them, how many games" list this file needs
 *     to know what to walk.
 *
 *     We originally reached for GET /league/{id}/fixtures for this instead
 *     (Imprint's own scheduling feature — imprint_series_id, per-series win
 *     counts, a completed/live status, all for free in one call). It turns
 *     out this league doesn't use Imprint's fixture-scheduling at all —
 *     /fixtures 404s for it outright, which per Imprint's own docs means
 *     exactly that ("if no fixtures... are accessible" for a league_id).
 *     Everything here comes from replay parsing instead (the same pipeline
 *     that feeds the Discord bot), which /matches and /series/{id} both
 *     cover fine without needing fixtures at all.
 *
 *     BUT: on this league's real data, Valve's own series_id turns out to
 *     split one real Bo2 meeting into two separate match_count=1 "series"
 *     entries far more often than not (confirmed: 84 of 94 raw entries at
 *     one point were lone single-game fragments, 40 team-pairs each split
 *     across two of them — this is exactly the /matches fragmentation
 *     problem /fixtures was originally meant to sidestep, just not
 *     something we can avoid any more now that /fixtures doesn't work for
 *     this league). So instead of trusting match_count on a single series
 *     entry, groupMeetingsFromMatches() below groups every entry by its two
 *     team_ids and sums match_count across all of them — a "meeting" is
 *     decided once its fragments add up to 2 games total, whether Imprint
 *     reported that as one series_id or two. There's still no status flag
 *     to tell "still waiting on game 2" apart from "permanently stuck at
 *     1" — a meeting whose fragments never reach 2 combined games just
 *     never gets counted, same tradeoff as before, just applied per-meeting
 *     instead of per-series-id.
 *
 *   - GET /series/{id} — the same per-match, per-player breakdown that
 *     feeds Imprint's Discord bot (position, win/loss, account name), plus
 *     each team's series-level wins/losses right there in the same
 *     response. A meeting that was split into two series_ids needs one
 *     call per fragment (mergeMeetingIntoComputedTeams below sums them
 *     before deciding win/tie/loss, so a fragmented Bo2 is never scored off
 *     just its first game); an unsplit one needs only one. This is the
 *     expensive part (one Imprint call per not-yet-seen series_id), so it
 *     drains a capped backlog across successive page loads rather than
 *     doing it all in one sync (see MAX_SERIES_DETAIL_FETCHES), walking
 *     whole meetings at a time so a meeting's fragments are never split
 *     across two different page loads. Player name history ("aka") comes
 *     from this same walk too.
 *
 * computed_teams and computed_players in league_data_cache hold the
 * results; js/standings.js reads those instead of teams.wins/losses or
 * players.wins/losses/match_count. The raw teams/players/heroes payloads
 * are still cached too — they're still the source for logos, registered
 * roster names (so a starter with zero recorded games isn't just invisible),
 * and Imprint's own per-player/per-team Imprint-rating, which there's no
 * reason to recompute ourselves.
 *
 * Unlike an earlier fixtures-based version of this file, computed_teams is
 * now built up incrementally by the same series/{id} walk as
 * computed_players, rather than recomputed from scratch every call —
 * there's no more cheap single-call source for the whole league's records,
 * so both now finish populating together as the backlog drains (a few page
 * loads on a big backlog, instant once caught up).
 *
 * Writes use the Supabase *service role* key, which bypasses Row Level
 * Security — neither table has a write policy for anon/authenticated roles
 * at all, on purpose (see the migration). That's what makes it safe for
 * this endpoint to run unauthenticated on every visitor's page load: the
 * worst a stray request can do is trigger extra Imprint reads, never a
 * write of bad data.
 *
 * Setup: add SUPABASE_SERVICE_ROLE_KEY as an *encrypted* variable on the
 * Pages project (Settings > Variables and Secrets), same as IMPRINT_API_KEY.
 * Get it from the Supabase dashboard: Project Settings > API > service_role
 * (the "secret" key, not the publishable key already in js/supabase.js).
 */

const API_BASE = 'https://v2.api.imprint.gg';
const DEFAULT_LEAGUE_ID = '19942';
// Both overridable via env (see .dev.vars.example) so a local/preview deploy
// can point at a different Supabase project without editing this file — the
// defaults are this project's real values, so an unset env still works
// exactly as before. Neither is treated as secret (SUPABASE_URL is public by
// nature, and the anon key is the same "publishable" key js/supabase.js
// already ships to every visitor's browser — it grants nothing beyond what
// any visitor already has), but they're still kept out of git like
// IMPRINT_API_KEY so this file has one consistent story for "where do my
// local values come from" rather than two.
const DEFAULT_SUPABASE_URL = 'https://nqcbfsnscqoaznypovyx.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_a_5S14K41Okv1vsNTNZn3A_QxQ601vA';
const CACHE_ROW_ID = 'snapshot';
// Cloudflare Pages Functions cap subrequests per invocation (50 on the free
// plan). One sync already spends a handful on /matches, /teams, /players,
// /heroes and a couple of Supabase calls, so this leaves plenty of
// room while still draining a big backlog (e.g. the very first sync after
// this shipped) over a few page loads rather than one. /series/{id} is a
// much lighter payload than /match/{id} (no time-series/item-timeline
// blocks), and a Bo2 series covers 2 games in one call, so this cap covers
// more match-equivalents than the old per-match walk did at the same number.
const MAX_SERIES_DETAIL_FETCHES = 20;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

async function imprintGet(env, path) {
  const res = await fetch(`${API_BASE}/${path}`, {
    headers: { 'x-api-key': env.IMPRINT_API_KEY, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`Imprint "${path}" returned HTTP ${res.status}`);
  return res.json();
}

const imprintLeagueGet = (env, endpoint) => imprintGet(env, `league/${encodeURIComponent(env.IMPRINT_LEAGUE_ID || DEFAULT_LEAGUE_ID)}/${endpoint}`);
const imprintSeriesGet = (env, seriesId) => imprintGet(env, `series/${encodeURIComponent(seriesId)}`);

// This function calls Imprint directly rather than through
// functions/api/imprint/[[route]].js, so it doesn't get that route's own
// edge cache for free — and unlike the heavier teams/players/heroes pulls
// (which only happen when something actually changed), the match-id
// check below runs on every single page load. Sharing ONE Imprint hit
// across every visitor within a short window (via Cloudflare's Cache API,
// same mechanism [[route]].js already uses) is what keeps that check cheap
// under real traffic instead of scaling 1:1 with visitors.
const MATCHES_CHECK_CACHE_SECONDS = 90;
async function imprintMatchesCached(env, { bypass } = {}) {
  const cache = caches.default;
  const cacheKey = new Request('https://imprint-sync.internal/cache/matches');
  if (!bypass) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit.json();
  }
  const payload = await imprintLeagueGet(env, 'matches');
  const cacheResponse = new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${MATCHES_CHECK_CACHE_SECONDS}`
    }
  });
  await cache.put(cacheKey, cacheResponse);
  return payload;
}

async function supaGet(env, path) {
  const res = await fetch(`${env.SUPABASE_URL || DEFAULT_SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Supabase read failed (HTTP ${res.status})`);
  return res.json();
}

async function supaUpsert(env, table, rows, onConflict) {
  if (!rows.length) return;
  const res = await fetch(`${env.SUPABASE_URL || DEFAULT_SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase write to ${table} failed (HTTP ${res.status}): ${text}`);
  }
}

// Imprint's raw /league/{id}/matches response is `{ series: [{ series_id,
// match_count, teams, matches: [id, ...] }, ...] }` — flatten every match id
// across every series into one sorted array. Used for the cheap "did
// anything change" check; the actual standings rebuild also reuses the same
// `series` array (see groupMeetingsFromMatches below) plus /series/{id}.
function extractMatchIds(matchesPayload) {
  const series = (matchesPayload && matchesPayload.series) || [];
  const ids = [];
  for (const s of series) {
    for (const id of (s.matches || [])) ids.push(id);
  }
  ids.sort((a, b) => a - b);
  return ids;
}

function sameIds(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Reconstruct this league's real Bo2 meetings from /league/{id}/matches'
// own `series` array, grouped by the two team_ids involved (see the big
// comment up top for why grouping by team-pair rather than trusting a
// single series_id's own match_count) — a meeting is "decided" once its
// fragments sum to 2 games total.
function groupMeetingsFromMatches(matchesPayload) {
  const series = (matchesPayload && matchesPayload.series) || [];
  const meetings = new Map(); // pairKey ("loId-hiId") -> { teamIds, fragmentIds, totalMatches }
  for (const s of series) {
    const teamIds = (s.teams || []).map((t) => t.team_id).filter((id) => id != null);
    if (teamIds.length !== 2 || s.series_id == null) continue; // malformed/bye — nothing sane to group
    const sortedIds = [...teamIds].sort((a, b) => a - b);
    const pairKey = sortedIds.join('-');
    const m = meetings.get(pairKey) || { teamIds: sortedIds, fragmentIds: [], totalMatches: 0 };
    m.fragmentIds.push(s.series_id);
    m.totalMatches += Number(s.match_count) || 0;
    meetings.set(pairKey, m);
  }
  return meetings;
}

// ---------- computed_teams: win/tie/loss per team, accumulated per meeting ----------
// One meeting = one or two /series/{id} responses (see groupMeetingsFromMatches
// above for why it's sometimes two) — sums each team's wins/losses across
// every fragment before deciding win/tie/loss, so a fragmented Bo2 is never
// scored off just its first game. Additive across calls (like
// computed_players), guarded by series_synced_ids so nothing is ever
// double-counted. Logs (doesn't throw) if fragments for one meeting somehow
// add up to more than 2 games — a real anomaly worth noticing, but not
// worth failing the whole sync over.
function mergeMeetingIntoComputedTeams(computedTeams, seriesDatas) {
  let teamAId = null, teamBId = null, teamAName = null, teamBName = null;
  let aWins = 0, bWins = 0, games = 0;
  for (const seriesData of seriesDatas) {
    const sides = (seriesData && seriesData.teams) || [];
    if (sides.length !== 2) continue; // malformed/bye — nothing sane to score
    const [a, b] = sides;
    if (teamAId == null) {
      teamAId = a.team_id; teamAName = a.team_name;
      teamBId = b.team_id; teamBName = b.team_name;
    }
    // Line this fragment's two sides up against the running A/B by team_id,
    // in case Imprint doesn't report them in the same order every fragment.
    const [thisA, thisB] = a.team_id === teamAId ? [a, b] : [b, a];
    aWins += Number(thisA.wins) || 0;
    bWins += Number(thisB.wins) || 0;
    games += (seriesData.matches && seriesData.matches.length) || 0;
  }
  if (teamAId == null) return;
  if (games !== 2) {
    console.error(`imprint-sync: meeting ${teamAId}-${teamBId} totalled ${games} games across its fragments, expected 2 — scoring it anyway`);
  }
  const ensure = (id, name) => (computedTeams[id] || (computedTeams[id] = { teamName: name, wins: 0, ties: 0, losses: 0, games: 0 }));
  const A = ensure(teamAId, teamAName), B = ensure(teamBId, teamBName);
  A.games += games; B.games += games;
  if (aWins > bWins) { A.wins++; B.losses++; }
  else if (bWins > aWins) { B.wins++; A.losses++; }
  else { A.ties++; B.ties++; } // only real outcome for a Bo2 split
}

// ---------- computed_players: per team, per position, per account ----------
// Ground-truth win/loss/game-count per (team, position, account), built by
// walking each series' own match list — the same per-match, per-player data
// Imprint's Discord bot posts. Nested by team then position so standings.js
// can drop it straight into a roster slot.
//
// Keyed by team_id + position (not just account_id) on purpose: a player who
// transferred teams mid-season, or who covered more than one position for
// the same team, gets separate, correctly-scoped records instead of one
// account-wide total bleeding across teams/positions like Imprint's own
// /players aggregate does.
function mergeSeriesIntoComputedPlayers(computedPlayers, seriesData) {
  const namesByAccount = new Map(); // account_id -> Set(names seen) — for aka history
  const matches = (seriesData && seriesData.matches) || [];
  for (const m of matches) {
    for (const t of (m.teams || [])) {
      const teamId = t.team_id;
      if (teamId == null) continue;
      const won = !!t.win;
      for (const p of (t.players || [])) {
        if (p.account_id == null) continue;
        const pos = [1, 2, 3, 4, 5].includes(Number(p.position)) ? Number(p.position) : 0;
        const teamBucket = computedPlayers[teamId] || (computedPlayers[teamId] = {});
        const posBucket = teamBucket[pos] || (teamBucket[pos] = {});
        const rec = posBucket[p.account_id] || (posBucket[p.account_id] = {
          name: p.account_name || 'Unknown', wins: 0, losses: 0, matchCount: 0
        });
        rec.name = p.account_name || rec.name; // keep the most-recently-seen name
        rec.matchCount++;
        if (won) rec.wins++; else rec.losses++;

        // Each match's player row already carries Imprint's own per-match
        // rating (imprint_rating/rating_label) — the same number their
        // Discord bot reports. /players only has a CURRENT-roster player's
        // league-wide average, so a stand-in or a player who's left every
        // team's registered roster shows up here with recorded games but no
        // rating from /players at all (confirmed on real data). Averaging
        // this in ourselves closes that gap. `|| 0` guards records already
        // in the cache from before this field existed, so it self-heals on
        // the next sync instead of needing a full rebuild.
        if (Number.isFinite(p.imprint_rating)) {
          rec.ratingSum = (rec.ratingSum || 0) + p.imprint_rating;
          rec.ratingCount = (rec.ratingCount || 0) + 1;
          if (p.rating_label) rec.ratingLabel = p.rating_label; // most-recently-seen label
        }

        if (p.account_name) {
          const set = namesByAccount.get(p.account_id) || new Set();
          set.add(p.account_name);
          namesByAccount.set(p.account_id, set);
        }
      }
    }
  }
  return namesByAccount;
}

// Merges freshly-seen match names against Imprint's current /players names
// and whatever aka lists are already stored, and upserts player_names.
async function syncPlayerNames(env, namesByAccount, playersPayload) {
  if (!namesByAccount.size) return;

  const currentNameByAccount = new Map();
  for (const p of (playersPayload && playersPayload.players) || []) {
    if (p.account_id != null) currentNameByAccount.set(p.account_id, p.account_name);
  }

  const accountIds = [...namesByAccount.keys()];
  const existingRows = await supaGet(
    env,
    `player_names?account_id=in.(${accountIds.join(',')})&select=account_id,current_name,aka`
  );
  const existingByAccount = new Map(existingRows.map((r) => [r.account_id, r]));

  const rows = [];
  for (const accountId of accountIds) {
    const currentName = currentNameByAccount.get(accountId)
      || (existingByAccount.get(accountId) || {}).current_name
      || [...namesByAccount.get(accountId)][0];

    const akaSet = new Set(((existingByAccount.get(accountId) || {}).aka) || []);
    for (const seenName of namesByAccount.get(accountId)) {
      if (seenName !== currentName) akaSet.add(seenName);
    }
    akaSet.delete(currentName);

    rows.push({
      account_id: accountId,
      current_name: currentName,
      aka: [...akaSet],
      updated_at: new Date().toISOString()
    });
  }
  await supaUpsert(env, 'player_names', rows, 'account_id');
}

// Is the caller a signed-in admin? Verified server-side against admin_users —
// the client-side window.__isAdmin check in standings.js only hides the button,
// it can't stop anyone calling this URL directly.
//
// Two hops: exchange the caller's Supabase access token for a user id (the
// token is signed by Supabase, so this can't be forged), then look that id up
// in admin_users with the service role.
async function isAdminRequest(env, request) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return false;

  try {
    const userRes = await fetch(`${env.SUPABASE_URL || DEFAULT_SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
    });
    if (!userRes.ok) return false;
    const user = await userRes.json();
    if (!user || !user.id) return false;

    const rows = await supaGet(env, `admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`);
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    console.error('imprint-sync: admin check failed:', e);
    return false;   // fail closed — a broken check must never grant force
  }
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const forceRequested = new URL(request.url).searchParams.get('force') === '1';

  if (!env.IMPRINT_API_KEY) {
    return json({ error: 'IMPRINT_API_KEY is not configured on this Pages project.' }, 500);
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on this Pages project.' }, 500);
  }

  // force=1 skips every cache and pulls all Imprint endpoints, so it's
  // admin-only: otherwise anyone could loop this URL and burn through Imprint's
  // rate limit and our subrequest budget. The unforced path stays open — it's
  // cache-guarded and only refetches when a new match id actually appears.
  let force = false;
  if (forceRequested) {
    force = await isAdminRequest(env, request);
    if (!force) return json({ error: 'Force refresh is restricted to admins.' }, 403);
  }

  try {
    const matchesPayload = await imprintMatchesCached(env, { bypass: force });
    const currentIds = extractMatchIds(matchesPayload);

    const existingRows = await supaGet(
      env,
      `league_data_cache?id=eq.${CACHE_ROW_ID}&select=match_ids,series_synced_ids,computed_teams,computed_players,updated_at`
    );
    const existing = existingRows[0] || null;
    const knownIds = (existing && existing.match_ids) || [];
    const seriesSyncedIds = new Set((existing && existing.series_synced_ids) || []);
    const computedTeams = (existing && existing.computed_teams) || {};
    const computedPlayers = (existing && existing.computed_players) || {};

    const needsRefresh = force || !existing || !sameIds(knownIds, currentIds);

    let teamsPayload = null, playersPayload = null, heroesPayload = null;
    if (needsRefresh) {
      [teamsPayload, playersPayload, heroesPayload] = await Promise.all([
        imprintLeagueGet(env, 'teams'),
        imprintLeagueGet(env, 'players'),
        imprintLeagueGet(env, 'heroes')
      ]);
    }

    // Per-meeting detail (team record + player positions/win-loss + name
    // history) — decoupled from needsRefresh, since a big backlog can still
    // have unprocessed meetings even when match_ids itself hasn't changed
    // (e.g. this is the first sync after shipping this feature). Only walk
    // meetings whose fragments sum to a fully-played Bo2 (totalMatches===2
    // — see groupMeetingsFromMatches above).
    const meetings = groupMeetingsFromMatches(matchesPayload);
    const decidedMeetings = [...meetings.values()].filter((m) => m.totalMatches === 2);
    const pendingMeetings = decidedMeetings.filter(
      (m) => !m.fragmentIds.every((id) => seriesSyncedIds.has(String(id)))
    );

    let processedSeriesKeys = [];
    const allNamesByAccount = new Map();
    if (pendingMeetings.length) {
      // Walk whole meetings at a time against the fetch budget, never just
      // one of a fragmented meeting's two calls — otherwise its team record
      // would get merged from an incomplete set of fragments. A meeting
      // whose own fragment count exceeds the whole budget (only possible if
      // MAX_SERIES_DETAIL_FETCHES is set absurdly low) is let through anyway
      // so it can never get stuck forever.
      for (const m of pendingMeetings) {
        if (processedSeriesKeys.length > 0 && processedSeriesKeys.length + m.fragmentIds.length > MAX_SERIES_DETAIL_FETCHES) {
          break;
        }

        const seriesDatas = [];
        for (const fragmentId of m.fragmentIds) {
          const key = String(fragmentId);
          processedSeriesKeys.push(key); // mark attempted either way — a
                                          // permanently-failing series should
                                          // never block the batch forever.
          try {
            const seriesData = await imprintSeriesGet(env, key);
            seriesDatas.push(seriesData);
            const names = mergeSeriesIntoComputedPlayers(computedPlayers, seriesData);
            for (const [accountId, set] of names) {
              const existingSet = allNamesByAccount.get(accountId) || new Set();
              for (const n of set) existingSet.add(n);
              allNamesByAccount.set(accountId, existingSet);
            }
          } catch (e) {
            console.error(`imprint-sync: could not fetch series ${key}:`, e);
          }
        }
        if (seriesDatas.length === m.fragmentIds.length) {
          mergeMeetingIntoComputedTeams(computedTeams, seriesDatas);
        }
        // else: one of this meeting's fragments failed to fetch — its
        // player data (from whichever fragments did succeed) is still kept,
        // but the team record is skipped this round since every fragment is
        // now marked attempted and won't be retried; see the "mark
        // attempted either way" note above.

        if (processedSeriesKeys.length >= MAX_SERIES_DETAIL_FETCHES) break;
      }

      try {
        if (!playersPayload) playersPayload = await imprintLeagueGet(env, 'players');
        await syncPlayerNames(env, allNamesByAccount, playersPayload);
      } catch (e) {
        // Non-fatal — aka data is a nice-to-have, don't let a Supabase hiccup
        // here fail the whole sync (or re-block series marked as processed).
        console.error('imprint-sync: player_names upsert failed:', e);
      }
    }

    if (needsRefresh || processedSeriesKeys.length) {
      const nextSeriesSynced = [...new Set([...seriesSyncedIds, ...processedSeriesKeys])];
      const row = {
        id: CACHE_ROW_ID,
        match_ids: currentIds,
        match_count: currentIds.length,
        series_synced_ids: nextSeriesSynced,
        computed_teams: computedTeams,
        computed_players: computedPlayers,
        updated_at: new Date().toISOString()
      };
      if (needsRefresh) {
        row.teams = teamsPayload;
        row.players = playersPayload;
        row.heroes = heroesPayload;
      }
      await supaUpsert(env, 'league_data_cache', [row], 'id');
    }

    const totalDecidedFragments = decidedMeetings.reduce((sum, m) => sum + m.fragmentIds.length, 0);
    return json({
      updated: needsRefresh,
      matchCount: currentIds.length,
      newMatches: Math.max(0, currentIds.length - knownIds.length),
      seriesProcessed: processedSeriesKeys.length,
      seriesRemaining: Math.max(0, totalDecidedFragments - (seriesSyncedIds.size + processedSeriesKeys.length))
    });
  } catch (err) {
    return json({ error: String((err && err.message) || err) }, 502);
  }
}
