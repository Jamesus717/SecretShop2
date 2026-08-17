/**
 * Imprint Esports API proxy — Cloudflare Pages Function.
 *
 * The site is static, so the Imprint API key can't live in client JS (anyone
 * could read it). This runs server-side, holds the key, and exposes only the
 * handful of read-only league endpoints the site actually needs.
 *
 * Routes (all GET):
 *   /api/imprint/teams     -> /league/{id}/teams
 *   /api/imprint/players   -> /league/{id}/players
 *   /api/imprint/heroes    -> /league/{id}/heroes
 *   /api/imprint/matches   -> /league/{id}/matches
 *
 * Setup: add IMPRINT_API_KEY as an *encrypted* variable on the Pages project,
 * then redeploy — variables only take effect on the next build.
 * Optionally set IMPRINT_LEAGUE_ID to override the default below.
 */

const API_BASE = 'https://v2.api.imprint.gg';
const DEFAULT_LEAGUE_ID = '19942';

// Allowlist, so this can't be used as an open proxy to arbitrary Imprint paths.
const ROUTES = {
  teams: 'teams',
  players: 'players',
  heroes: 'heroes',
  matches: 'matches'
};

// Cached at the edge so a busy page doesn't hammer Imprint. Short enough that
// standings still feel live.
const EDGE_CACHE_SECONDS = 120;
const BROWSER_CACHE_SECONDS = 60;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${BROWSER_CACHE_SECONDS}, s-maxage=${EDGE_CACHE_SECONDS}`,
      ...extraHeaders
    }
  });
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
  const upstream = `${API_BASE}/league/${encodeURIComponent(leagueId)}/${endpoint}`;

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
      endpoint: name,
      leagueId
    }, res.status === 401 || res.status === 403 ? 502 : res.status);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return json({ error: 'Imprint API returned a non-JSON response.', endpoint: name }, 502);
  }

  const out = json({ endpoint: name, leagueId, data });
  context.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
}
