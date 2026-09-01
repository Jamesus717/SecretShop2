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
 * IMPORTANT: this file calls the Imprint API directly (v2.api.imprint.gg),
 * NOT through functions/api/imprint/[[route]].js — so unlike the responses
 * that route hands the browser, these are Imprint's raw payloads with no
 * extra `{ data: ... }` wrapper. /league/{id}/teams returns `{teams:[...]}`
 * directly, not `{data:{teams:[...]}}`. Same shape either way once it lands
 * in league_data_cache, though — the columns store exactly what Imprint
 * returned, same shape js/standings.js already expects from fetchImprint().
 *
 * What a call does:
 *   1. Ask Imprint for the current match id list only (/league/{id}/matches
 *      — no team/player/hero payloads, so this is a cheap call). This file
 *      calls Imprint directly rather than through [[route]].js, so it has
 *      its own short Cache API cache for just this call (see
 *      imprintMatchesCached) — this is the one Imprint request that runs on
 *      literally every page load, so it's the one worth sharing across
 *      visitors rather than paying for once per visitor.
 *   2. Compare that id list against league_data_cache.match_ids. If nothing
 *      changed and force isn't set: skip straight to step 4. A finished
 *      match is never re-requested once it's in that list — this is the
 *      only step that ever runs on a plain refresh with no new games.
 *   3. If new match ids showed up (or force=1): pull /teams, /players and
 *      /heroes and overwrite the cache row. These three are Imprint's own
 *      season-cumulative aggregates — Imprint doesn't expose a "just this
 *      match" delta for them, so this is the smallest refresh Imprint's API
 *      allows for league-wide standings, and it only happens when a new
 *      game (or an admin) actually calls for it.
 *   4. Player name history ("aka"): GET /league/{id}/matches only gives
 *      match ids, but GET /match/{id} returns that one game's own player
 *      list (account_id + the account_name Imprint saw AT THAT MATCH).
 *      Unlike step 3, this genuinely is a per-match delta — so for any
 *      match id not yet in name_synced_match_ids, this fetches just that
 *      match (capped at MAX_MATCH_DETAIL_FETCHES per call so one sync can't
 *      blow through Cloudflare's subrequest limit; a large backlog drains a
 *      batch at a time across successive page loads). Any account_name in
 *      that match that doesn't match what /players currently reports for
 *      the same account_id gets recorded as an "aka" in player_names.
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
const SUPABASE_URL = 'https://nqcbfsnscqoaznypovyx.supabase.co';
const CACHE_ROW_ID = 'snapshot';
// Cloudflare Pages Functions cap subrequests per invocation (50 on the free
// plan). One sync already spends a handful on /matches, /teams, /players,
// /heroes and a couple of Supabase calls, so this leaves plenty of room
// while still draining a big backlog (e.g. the very first sync after this
// shipped) over a few page loads rather than one.
const MAX_MATCH_DETAIL_FETCHES = 20;

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

// This function calls Imprint directly rather than through
// functions/api/imprint/[[route]].js, so it doesn't get that route's own
// 120s edge cache for free — and unlike the heavier teams/players/heroes
// pulls (which only happen when something actually changed), the match-id
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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
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

// Imprint's raw /league/{id}/matches response is `{ series: [{ match_count,
// teams, matches: [id, ...] }, ...] }` — flatten every match id across every
// series into one sorted array.
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

// Walks up to MAX_MATCH_DETAIL_FETCHES not-yet-processed match ids via
// GET /match/{id}, and returns { processedIds, nameUpdates } where
// nameUpdates is a Map<account_id, Set<name seen in that match>>.
async function collectMatchNames(env, matchIds) {
  const processedIds = [];
  const namesByAccount = new Map();
  for (const id of matchIds) {
    processedIds.push(id); // mark attempted either way — a permanently-failing
                            // match id should never block the batch forever.
    let match;
    try {
      match = await imprintGet(env, `match/${id}`);
    } catch (e) {
      console.error(`imprint-sync: could not fetch match ${id}:`, e);
      continue;
    }
    for (const t of (match && match.teams) || []) {
      for (const p of (t.players || [])) {
        if (p.account_id == null || !p.account_name) continue;
        const set = namesByAccount.get(p.account_id) || new Set();
        set.add(p.account_name);
        namesByAccount.set(p.account_id, set);
      }
    }
  }
  return { processedIds, namesByAccount };
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

export async function onRequestGet(context) {
  const { env, request } = context;
  const force = new URL(request.url).searchParams.get('force') === '1';

  if (!env.IMPRINT_API_KEY) {
    return json({ error: 'IMPRINT_API_KEY is not configured on this Pages project.' }, 500);
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on this Pages project.' }, 500);
  }

  try {
    const matchesPayload = await imprintMatchesCached(env, { bypass: force });
    const currentIds = extractMatchIds(matchesPayload);

    const existingRows = await supaGet(
      env,
      `league_data_cache?id=eq.${CACHE_ROW_ID}&select=match_ids,name_synced_match_ids,updated_at`
    );
    const existing = existingRows[0] || null;
    const knownIds = (existing && existing.match_ids) || [];
    const nameSyncedIds = new Set((existing && existing.name_synced_match_ids) || []);

    const needsRefresh = force || !existing || !sameIds(knownIds, currentIds);

    let teamsPayload = null, playersPayload = null, heroesPayload = null;
    if (needsRefresh) {
      [teamsPayload, playersPayload, heroesPayload] = await Promise.all([
        imprintLeagueGet(env, 'teams'),
        imprintLeagueGet(env, 'players'),
        imprintLeagueGet(env, 'heroes')
      ]);
    }

    // Per-match name history — decoupled from needsRefresh, since a big
    // backlog can still have unprocessed ids even when match_ids itself
    // hasn't changed since the last call.
    const pendingForNames = currentIds.filter((id) => !nameSyncedIds.has(id)).slice(0, MAX_MATCH_DETAIL_FETCHES);
    let processedNameIds = [];
    if (pendingForNames.length) {
      if (!playersPayload) playersPayload = await imprintLeagueGet(env, 'players');
      const { processedIds, namesByAccount } = await collectMatchNames(env, pendingForNames);
      processedNameIds = processedIds;
      try {
        await syncPlayerNames(env, namesByAccount, playersPayload);
      } catch (e) {
        // Non-fatal — aka data is a nice-to-have, don't let a Supabase hiccup
        // here fail the whole sync (or re-block matches marked as processed).
        console.error('imprint-sync: player_names upsert failed:', e);
      }
    }

    if (needsRefresh || processedNameIds.length) {
      const nextNameSynced = [...new Set([...nameSyncedIds, ...processedNameIds])];
      const row = {
        id: CACHE_ROW_ID,
        match_ids: currentIds,
        match_count: currentIds.length,
        name_synced_match_ids: nextNameSynced,
        updated_at: new Date().toISOString()
      };
      if (needsRefresh) {
        row.teams = teamsPayload;
        row.players = playersPayload;
        row.heroes = heroesPayload;
      }
      await supaUpsert(env, 'league_data_cache', [row], 'id');
    }

    return json({
      updated: needsRefresh,
      matchCount: currentIds.length,
      newMatches: Math.max(0, currentIds.length - knownIds.length),
      namesProcessed: processedNameIds.length,
      namesRemaining: Math.max(0, currentIds.length - (nameSyncedIds.size + processedNameIds.length))
    });
  } catch (err) {
    return json({ error: String((err && err.message) || err) }, 502);
  }
}
