/**
 * Imprint Esports API proxy — Cloudflare Pages Function.
 *
 * The site is static, so the Imprint API key can't live in client JS (anyone
 * could read it). This runs server-side, holds the key, and exposes only the
 * handful of read-only league endpoints the site actually needs.
 *
 * Routes (all GET):
 *   /api/imprint/teams          -> /league/{id}/teams
 *   /api/imprint/players        -> /league/{id}/players
 *   /api/imprint/heroes         -> /league/{id}/heroes
 *   /api/imprint/matches        -> /league/{id}/matches
 *   /api/imprint/fixtures       -> /league/{id}/fixtures
 *   /api/imprint/series/{id}    -> /series/{id}
 *
 * fixtures and series/{id} were added alongside imprint-sync.js's rebuild of
 * team/player win-loss records from real match data (see the big comment at
 * the top of that file for why /teams and /players' own win/loss numbers
 * aren't trustworthy enough to build Standings on directly). fixtures groups
 * games into the correct real-world series (Imprint's own /league/{id}/matches
 * sometimes splits one Bo2 meeting into two separate single-game "series" —
 * fixtures' imprint_series_id doesn't); series/{id} returns that series' full
 * per-match, per-player breakdown (hero, position, win/loss) — the same data
 * that powers Imprint's Discord match-result posts.
 *
 * Setup: add IMPRINT_API_KEY as an *encrypted* variable on the Pages project,
 * then redeploy — variables only take effect on the next build.
 * Optionally set IMPRINT_LEAGUE_ID to override the default below.
 */

const API_BASE = 'https://v2.api.imprint.gg';
const DEFAULT_LEAGUE_ID = '19942';

// Allowlist, so this can't be used as an open proxy to arbitrary Imprint paths.
// Plain string values are league-scoped (league/{id}/{value}); 'series' is
// special-cased below since it hangs off API_BASE directly, keyed by an id
// rather than the league.
const ROUTES = {
  teams: 'teams',
  players: 'players',
  heroes: 'heroes',
  matches: 'matches',
  fixtures: 'fixtures',
  series: 'series'
};

// Cached at the edge so a busy page doesn't hammer Imprint. Short enough that
// standings still feel live. Series results never change once Imprint has
// processed the match, so they get a much longer cache — see SERIES_CACHE
// below.
const EDGE_CACHE_SECONDS = 120;
const BROWSER_CACHE_SECONDS = 60;
// A completed series is immutable — cache it hard. An in-progress series
// (still status: "uncompleted"/live when fetched) would get stuck stale for
// this long too, but imprint-sync.js only walks series that fixtures has
// already reported as fully resolved, so that never happens in practice.
const SERIES_EDGE_CACHE_SECONDS = 21600; // 6h
const SERIES_BROWSER_CACHE_SECONDS = 3600; // 1h

function json(body, status = 200, cacheSeconds = null) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (cacheSeconds) {
    headers['Cache-Control'] = `public, max-age=${cacheSeconds.browser}, s-maxage=${cacheSeconds.edge}`;
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export async function onRequestGet(context) {
  const { params, env, request } = context;

  // [[route]] gives an array of path segments after /api/imprint/
  const segments = Array.isArray(params.route) ? params.route : [params.route].filter(Boolean);
  const name = (segments[0] || '').toLowerCase();
  const endpoint = ROUTES[name];

  if (!endpoint) {
    return json({
      error: 'Unknown endpoint',
      allowed: Object.keys(ROUTES)
    }, 404);
  }

  if (!env.IMPRINT_API_KEY) {
    // Explicit rather than a confusing upstream 401 — this is the most likely
    // failure the first time it's deployed.
    return json({
      error: 'IMPRINT_API_KEY is not configured on this Pages project.',
      hint: 'Settings > Variables and Secrets > add IMPRINT_API_KEY (encrypted), then redeploy.'
    }, 500);
  }

  const leagueId = env.IMPRINT_LEAGUE_ID || DEFAULT_LEAGUE_ID;

  let upstream, cacheLabel, cacheSeconds;
  if (name === 'series') {
    // /api/imprint/series/{id} -> /series/{id} — not league-scoped, and
    // takes either Imprint's own imprint_series_id (a uuid) or Valve's
    // numeric series_id. Reject the bare route so this can't be used to probe
    // the upstream with no id.
    const seriesId = segments[1];
    if (!seriesId) {
      return json({ error: 'series requires an id: /api/imprint/series/{id}' }, 400);
    }
    upstream = `${API_BASE}/series/${encodeURIComponent(seriesId)}`;
    cacheLabel = `series/${seriesId}`;
    cacheSeconds = { browser: SERIES_BROWSER_CACHE_SECONDS, edge: SERIES_EDGE_CACHE_SECONDS };
  } else {
    upstream = `${API_BASE}/league/${encodeURIComponent(leagueId)}/${endpoint}`;
    cacheLabel = name;
    cacheSeconds = { browser: BROWSER_CACHE_SECONDS, edge: EDGE_CACHE_SECONDS };
  }

  // Serve from the edge cache when we can.
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let res;
  try {
    res = await fetch(upstream, {
      headers: { 'x-api-key': env.IMPRINT_API_KEY, 'Accept': 'application/json' }
    });
  } catch (err) {
    return json({ error: 'Could not reach the Imprint API.', detail: String(err) }, 502);
  }

  const text = await res.text();

  if (!res.ok) {
    // Pass the status through so the page can tell "bad key" from "no data",
    // but don't echo the upstream body verbatim in case it repeats the key.
    return json({
      error: `Imprint API returned ${res.status}`,
      endpoint: cacheLabel,
      leagueId
    }, res.status === 401 || res.status === 403 ? 502 : res.status);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return json({ error: 'Imprint API returned a non-JSON response.', endpoint: cacheLabel }, 502);
  }

  const out = json({ endpoint: cacheLabel, leagueId, data }, 200, cacheSeconds);
  context.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
}
