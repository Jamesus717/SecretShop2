/**
 * Cloudflare Pages Function: POST /api/news
 *
 * Where the Discord bot (Owen's match-cards-bot) drops a copy of each card it
 * posts, so the home page "Latest" sidebar can show it too. Cards are made by
 * tools/stat-designer; this endpoint only stores them.
 *
 * The bot authenticates with its own shared secret, NEWS_BOT_TOKEN, rather
 * than holding our Supabase service role key. If the bot (or the machine it
 * runs on) is ever compromised, rotate NEWS_BOT_TOKEN and nothing else is
 * exposed — the worst it could do with the token is post cards, which an
 * admin can hide from the home page.
 *
 * Admins can post too, from the "+ Add card" button on the home page
 * (js/newsfeed.js): they send their own Supabase session token instead, which
 * is checked against admin_users here, the same way imprint-sync.js checks
 * force refresh. So Owen can also just send cards to an admin.
 *
 * Request — multipart/form-data:
 *   Authorization: Bearer <NEWS_BOT_TOKEN, or a signed-in admin's access token>
 *   image       PNG / WEBP / JPEG, max 5MB             (required)
 *   title       e.g. "Hurricane 2–0 FarmVille", ≤140   (required)
 *   kind        result | match | elimination | bracket | hero | team | other
 *   division    upper | mid | lower
 *   teams       comma-separated team names
 *   match_ids   comma-separated Dota match ids (links to OpenDota/Dotabuff)
 *   dedupe_key  optional, e.g. "result:8995123456" — re-sending the same key
 *               replaces that post instead of adding a second one
 *
 * Response: 201 { id, image_url }  ·  4xx { error }  ·  500 if misconfigured
 *
 * Setup (Pages → Settings → Variables, both *encrypted*):
 *   NEWS_BOT_TOKEN             long random string, shared with the bot only
 *   SUPABASE_SERVICE_ROLE_KEY  already set for imprint-sync.js
 * and run news-migration.sql once in the Supabase SQL editor.
 */

const DEFAULT_SUPABASE_URL = 'https://nqcbfsnscqoaznypovyx.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_a_5S14K41Okv1vsNTNZn3A_QxQ601vA';
const BUCKET = 'news-cards';
const MAX_BYTES = 5 * 1024 * 1024;
const KINDS = new Set(['result', 'match', 'elimination', 'bracket', 'hero', 'team', 'other']);
const DIVISIONS = new Set(['upper', 'mid', 'lower']);
const MAX_TEAMS = 24;      // an "Eliminated teams" card can list a lot of them
const MAX_MATCH_IDS = 10;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

// Compare digests, not the raw strings, so the comparison is constant-time
// and doesn't leak the token's length.
async function tokenMatches(given, expected) {
  if (!given || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected))
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// Is this bearer token a signed-in admin's Supabase session? Same two hops as
// isAdminRequest() in imprint-sync.js: Supabase turns the (signed, unforgeable)
// token into a user id, then admin_users is checked with the service role.
async function isAdminToken(env, token) {
  if (!token) return false;
  const base = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  try {
    const userRes = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
    });
    if (!userRes.ok) return false;
    const user = await userRes.json();
    if (!user || !user.id) return false;
    const rowsRes = await fetch(`${base}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
    });
    if (!rowsRes.ok) return false;
    const rows = await rowsRes.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) {
    console.error('news: admin check failed:', e);
    return false; // fail closed
  }
}

// Trust the file's bytes, not its declared type.
function sniffImage(bytes) {
  const b = (i) => bytes[i];
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return { type: 'image/png', ext: 'png' };
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46
    && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return { type: 'image/webp', ext: 'webp' };
  return null;
}

// Strip control characters and squash whitespace; everything is escaped again
// on render, this just keeps junk out of the table.
function cleanText(v, max) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function splitList(v) {
  return String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export async function onRequestPost({ request, env }) {
  const missing = ['NEWS_BOT_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !env[k]);
  if (missing.length) {
    // Names only, never values: a misspelt or space-padded variable name in the
    // Cloudflare dashboard is the usual cause, and this makes it visible.
    const similar = Object.keys(env).filter((k) => /news|bot|token/i.test(k)).map((k) => JSON.stringify(k));
    return json({
      error: `News uploads are not configured: ${missing.join(', ')} not set on this deployment.`,
      similar_names: similar
    }, 500);
  }

  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!(await tokenMatches(token, env.NEWS_BOT_TOKEN)) && !(await isAdminToken(env, token))) {
    return json({ error: 'Unauthorised.' }, 401);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Send multipart/form-data.' }, 400);
  }

  // ---- validate ----
  const file = form.get('image');
  if (!file || typeof file === 'string') return json({ error: 'Missing image file.' }, 400);
  if (file.size > MAX_BYTES) return json({ error: 'Image is over 5MB.' }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const img = sniffImage(bytes);
  if (!img) return json({ error: 'Image must be PNG, WEBP or JPEG.' }, 415);

  const title = cleanText(form.get('title'), 140);
  if (!title) return json({ error: 'Missing title.' }, 400);

  const kindRaw = cleanText(form.get('kind'), 20).toLowerCase() || 'other';
  if (!KINDS.has(kindRaw)) return json({ error: `kind must be one of: ${[...KINDS].join(', ')}.` }, 400);

  const divRaw = cleanText(form.get('division'), 10).toLowerCase();
  if (divRaw && !DIVISIONS.has(divRaw)) return json({ error: 'division must be upper, mid or lower.' }, 400);

  const teams = splitList(form.get('teams')).map((t) => cleanText(t, 60)).filter(Boolean).slice(0, MAX_TEAMS);

  const matchIds = splitList(form.get('match_ids'));
  if (matchIds.length > MAX_MATCH_IDS) return json({ error: `At most ${MAX_MATCH_IDS} match ids.` }, 400);
  if (matchIds.some((id) => !/^\d{6,12}$/.test(id))) return json({ error: 'match_ids must be Dota match ids (digits only).' }, 400);

  const dedupeKey = cleanText(form.get('dedupe_key'), 120) || null;

  // ---- store image ----
  // Always a fresh path: overwriting in place would leave the old picture in
  // Supabase's public CDN cache for up to an hour after a corrected re-post.
  const base = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const month = new Date().toISOString().slice(0, 7);
  const imagePath = `${month}/${crypto.randomUUID()}.${img.ext}`;
  const serviceHeaders = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
  };

  const up = await fetch(`${base}/storage/v1/object/${BUCKET}/${imagePath}`, {
    method: 'POST',
    headers: { ...serviceHeaders, 'Content-Type': img.type, 'Cache-Control': 'max-age=31536000' },
    body: bytes
  });
  if (!up.ok) {
    const text = await up.text().catch(() => '');
    console.error('news: image upload failed', up.status, text);
    return json({ error: `Image upload failed (HTTP ${up.status}). Has news-migration.sql been run?` }, 502);
  }

  // ---- write post ----
  // With a dedupe_key this is an upsert: a retry or a corrected card replaces
  // the post's content but keeps its date and whether an admin hid it.
  const row = {
    kind: kindRaw,
    title,
    image_path: imagePath,
    division: divRaw || null,
    teams,
    match_ids: matchIds,
    dedupe_key: dedupeKey
  };
  const ins = await fetch(`${base}/rest/v1/news_posts${dedupeKey ? '?on_conflict=dedupe_key' : ''}`, {
    method: 'POST',
    headers: {
      ...serviceHeaders,
      'Content-Type': 'application/json',
      Prefer: `${dedupeKey ? 'resolution=merge-duplicates,' : ''}return=representation`
    },
    body: JSON.stringify(row)
  });
  if (!ins.ok) {
    const text = await ins.text().catch(() => '');
    console.error('news: insert failed', ins.status, text);
    return json({ error: `Saving the post failed (HTTP ${ins.status}). Has news-migration.sql been run?` }, 502);
  }
  const [saved] = await ins.json();

  return json({
    id: saved && saved.id,
    image_url: `${base}/storage/v1/object/public/${BUCKET}/${imagePath}`
  }, 201);
}

export function onRequest() {
  return json({ error: 'Use POST.' }, 405);
}
