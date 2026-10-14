/**
 * Cloudflare Pages Function: /api/clips — the community clip queue (option B,
 * see docs/clip-queue-design.md).
 *
 * Members send clips through Owen's Discord bot, any admin approves them (on
 * /clips, or with a button in Discord), and Owen's PC pulls the approved ones,
 * renders them in the Highlight Cutter and posts them through Buffer.
 *
 * Auth, like functions/api/news.js:
 *   Authorization: Bearer <CLIPS_BOT_TOKEN>        — Owen's bot and PC
 *   Authorization: Bearer <admin's Supabase token> — /clips (js/clips.js)
 * CLIPS_BOT_TOKEN is separate from NEWS_BOT_TOKEN so rotating one doesn't
 * break the other. Whoever holds it can approve clips, so the bot must check
 * the person pressing its Discord approve button has the admin role.
 *
 * Routes:
 *   POST /api/clips                 (bot) add a clip
 *        JSON: { link, submitter_discord_id, submitter_name, teams, match_id,
 *                description, discord_message_id }
 *        or multipart/form-data with the same fields and a `file` (MP4 / MOV /
 *        WEBM, max 50MB) instead of `link` — for Discord attachments, whose
 *        links expire within a day. teams: array, or comma-separated in a form.
 *        -> 201 { id, status }  ·  200 { id, status, duplicate: true } when the
 *           discord_message_id was already sent
 *   GET  /api/clips?status=approved (bot/PC or admin) list clips; status is
 *        pending | approved (default) | rejected | posted. pending/approved
 *        come oldest first, rejected/posted newest first. limit ≤ 100.
 *        Uploaded files come with file_url, a signed link valid for 1 hour.
 *        -> 200 { clips: [...] }
 *   POST /api/clips/:id/review      (bot or admin)
 *        { decision: "approve" | "reject", reviewer, reason }
 *        reviewer (the Discord admin's name) is required from the bot; for a
 *        site admin it comes from their profile. Works on pending clips, and
 *        on approved ones not yet posted (an admin changing their mind).
 *        Rejecting is final: an uploaded file is deleted.
 *        -> 200 { id, status }  ·  409 if it's already rejected/posted
 *   POST /api/clips/:id/posted      (PC or admin) { post_urls: [...] }
 *        Call after Buffer really posted it — fetching the queue changes
 *        nothing, so a failed render never loses a clip. Deletes the file.
 *        -> 200 { id, status }  ·  409 if it isn't approved
 *
 * Errors: 4xx/5xx { error }.
 *
 * Setup (Pages → Settings → Variables, both *encrypted*):
 *   CLIPS_BOT_TOKEN            long random string, shared with Owen only
 *   SUPABASE_SERVICE_ROLE_KEY  already set for imprint-sync.js
 * and run clips-migration.sql once in the Supabase SQL editor.
 */

const DEFAULT_SUPABASE_URL = 'https://nqcbfsnscqoaznypovyx.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_a_5S14K41Okv1vsNTNZn3A_QxQ601vA';
const BUCKET = 'clip-files';
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_PENDING_PER_MEMBER = 10;
const MAX_TEAMS = 4;
const MAX_POST_URLS = 10;
const SIGNED_URL_SECONDS = 3600;
const STATUSES = new Set(['pending', 'approved', 'rejected', 'posted']);
const COLUMNS = 'id,created_at,submitter_discord_id,submitter_name,link,file_path,teams,match_id,description,status,reviewed_by,reviewed_via,reviewed_at,reject_reason,posted_at,post_urls,discord_message_id';
// These links expire within a day — the bot must upload the file instead.
const EXPIRING_HOSTS = /(^|\.)(discordapp\.com|discordapp\.net|discord\.com)$/i;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

// Compare digests, not the raw strings, so the comparison is constant-time
// and doesn't leak the token's length. Same as news.js.
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

// A signed-in admin's Supabase session -> their user id, else null. Same two
// hops as isAdminToken() in news.js: Supabase turns the (signed, unforgeable)
// token into a user, then admin_users is checked with the service role.
async function adminUserId(env, token) {
  if (!token) return null;
  const base = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  try {
    const userRes = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
    });
    if (!userRes.ok) return null;
    const user = await userRes.json();
    if (!user || !user.id) return null;
    const rowsRes = await fetch(`${base}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
    });
    if (!rowsRes.ok) return null;
    const rows = await rowsRes.json();
    return Array.isArray(rows) && rows.length ? user.id : null;
  } catch (e) {
    console.error('clips: admin check failed:', e);
    return null; // fail closed
  }
}

// Strip control characters and squash whitespace; everything is escaped again
// on render, this just keeps junk out of the table.
function cleanText(v, max) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function toList(v) {
  if (Array.isArray(v)) return v;
  return String(v ?? '').split(',');
}

// https only, a real host name (no IPs or localhost: Owen's PC downloads
// these), and not a Discord attachment link. Returns the normalised URL, or
// an error message.
function checkLink(raw) {
  const s = String(raw ?? '').trim();
  if (s.length > 500) return { error: 'link is too long.' };
  let u;
  try { u = new URL(s); } catch { return { error: 'link must be a full https:// URL.' }; }
  if (u.protocol !== 'https:') return { error: 'link must start with https://.' };
  if (u.username || u.password) return { error: 'link must not contain a username or password.' };
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost')
    || /^[\d.]+$/.test(host) || host.startsWith('[')) {
    return { error: 'link must point to a public website.' };
  }
  if (EXPIRING_HOSTS.test(host)) {
    return { error: 'Discord attachment links expire. Upload the file instead.' };
  }
  return { link: u.href };
}

// Trust the file's bytes, not its declared type.
function sniffVideo(b) {
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { type: 'video/webm', ext: 'webm' };
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) { // "ftyp"
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    return brand === 'qt  ' ? { type: 'video/quicktime', ext: 'mov' } : { type: 'video/mp4', ext: 'mp4' };
  }
  return null;
}

function ctx(env) {
  const base = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
  };
  return { base, headers };
}

async function deleteFile(env, path) {
  if (!path) return;
  const { base, headers } = ctx(env);
  const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, { method: 'DELETE', headers }).catch(() => null);
  if (!res || !res.ok) console.error('clips: could not delete file', path, res && res.status);
}

// PATCH one clip, only if it's still in one of `fromStatuses`, so two admins
// clicking at once can't both win. Returns the updated row or null.
async function patchClip(env, id, fromStatuses, patch) {
  const { base, headers } = ctx(env);
  const res = await fetch(`${base}/rest/v1/clip_submissions?id=eq.${id}&status=in.(${fromStatuses.join(',')})&select=${COLUMNS}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(patch)
  });
  if (!res.ok) {
    console.error('clips: update failed', res.status, await res.text().catch(() => ''));
    throw new Error(`update HTTP ${res.status}`);
  }
  const rows = await res.json();
  return rows[0] || null;
}

async function currentStatus(env, id) {
  const { base, headers } = ctx(env);
  const res = await fetch(`${base}/rest/v1/clip_submissions?id=eq.${id}&select=status`, { headers });
  const rows = res.ok ? await res.json() : [];
  return rows[0] ? rows[0].status : null;
}

async function conflict(env, id, what) {
  const status = await currentStatus(env, id);
  if (!status) return json({ error: 'No such clip.' }, 404);
  return json({ error: `Can't ${what}: this clip is ${status}.`, status }, 409);
}

// ---------- POST /api/clips ----------
async function submit(request, env) {
  const isForm = (request.headers.get('Content-Type') || '').includes('multipart/form-data');
  let body, file = null;
  try {
    if (isForm) {
      const form = await request.formData();
      body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string'));
      const f = form.get('file');
      if (f && typeof f !== 'string') file = f;
    } else {
      body = await request.json();
    }
  } catch {
    return json({ error: 'Send JSON, or multipart/form-data with a file.' }, 400);
  }
  if (!body || typeof body !== 'object') return json({ error: 'Send a JSON object.' }, 400);

  const submitterId = cleanText(body.submitter_discord_id, 25);
  if (!/^\d{5,25}$/.test(submitterId)) return json({ error: 'submitter_discord_id must be a Discord user id.' }, 400);
  const submitterName = cleanText(body.submitter_name, 64);
  if (!submitterName) return json({ error: 'Missing submitter_name.' }, 400);

  const hasLink = String(body.link ?? '').trim() !== '';
  if (hasLink === !!file) return json({ error: 'Send either a link or a file, not both.' }, 400);
  let link = null;
  if (hasLink) {
    const checked = checkLink(body.link);
    if (checked.error) return json({ error: checked.error }, 400);
    link = checked.link;
  }

  const teams = toList(body.teams).map((t) => cleanText(t, 60)).filter(Boolean);
  if (teams.length > MAX_TEAMS) return json({ error: `At most ${MAX_TEAMS} teams.` }, 400);

  const matchRaw = cleanText(body.match_id, 20);
  if (matchRaw && !/^\d{6,12}$/.test(matchRaw)) return json({ error: 'match_id must be a Dota match id (digits only).' }, 400);

  const description = cleanText(body.description, 500);
  const messageId = cleanText(body.discord_message_id, 25) || null;
  if (messageId && !/^\d{5,25}$/.test(messageId)) return json({ error: 'discord_message_id must be a Discord message id.' }, 400);

  const { base, headers } = ctx(env);

  // A retry of something we already have: say so rather than adding it twice.
  const findByMessage = async () => {
    const res = await fetch(`${base}/rest/v1/clip_submissions?discord_message_id=eq.${messageId}&select=id,status`, { headers });
    const rows = res.ok ? await res.json() : [];
    return rows[0] || null;
  };
  if (messageId) {
    const existing = await findByMessage();
    if (existing) return json({ id: existing.id, status: existing.status, duplicate: true }, 200);
  }

  const pendingRes = await fetch(
    `${base}/rest/v1/clip_submissions?submitter_discord_id=eq.${submitterId}&status=eq.pending&select=id&limit=${MAX_PENDING_PER_MEMBER}`,
    { headers }
  );
  if (!pendingRes.ok) {
    console.error('clips: pending count failed', pendingRes.status, await pendingRes.text().catch(() => ''));
    return json({ error: `Reading the queue failed (HTTP ${pendingRes.status}). Has clips-migration.sql been run?` }, 502);
  }
  if ((await pendingRes.json()).length >= MAX_PENDING_PER_MEMBER) {
    return json({ error: `You already have ${MAX_PENDING_PER_MEMBER} clips waiting for an admin. Try again once some are reviewed.` }, 429);
  }

  let filePath = null;
  if (file) {
    if (file.size > MAX_FILE_BYTES) return json({ error: 'file is over 50MB.' }, 413);
    const video = sniffVideo(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    if (!video) return json({ error: 'file must be MP4, MOV or WEBM.' }, 415);
    filePath = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${video.ext}`;
    const up = await fetch(`${base}/storage/v1/object/${BUCKET}/${filePath}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': video.type },
      body: file
    });
    if (!up.ok) {
      console.error('clips: file upload failed', up.status, await up.text().catch(() => ''));
      return json({ error: 'File upload failed. Has clips-migration.sql been run?' }, 502);
    }
  }

  const ins = await fetch(`${base}/rest/v1/clip_submissions?select=id,status`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      submitter_discord_id: submitterId,
      submitter_name: submitterName,
      link,
      file_path: filePath,
      teams,
      match_id: matchRaw ? Number(matchRaw) : null,
      description,
      discord_message_id: messageId
    })
  });
  if (!ins.ok) {
    const text = await ins.text().catch(() => '');
    await deleteFile(env, filePath);
    // Two copies of the same retry raced past the check above.
    if (ins.status === 409 && messageId) {
      const existing = await findByMessage();
      if (existing) return json({ id: existing.id, status: existing.status, duplicate: true }, 200);
    }
    console.error('clips: insert failed', ins.status, text);
    return json({ error: `Saving the clip failed (HTTP ${ins.status}).` }, 502);
  }
  const [saved] = await ins.json();
  return json({ id: saved.id, status: saved.status }, 201);
}

// ---------- GET /api/clips ----------
async function list(request, env) {
  const url = new URL(request.url);
  const status = (url.searchParams.get('status') || 'approved').toLowerCase();
  if (!STATUSES.has(status)) return json({ error: 'status must be pending, approved, rejected or posted.' }, 400);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit'), 10) || 50, 1), 100);
  const order = status === 'pending' || status === 'approved' ? 'created_at.asc' : 'created_at.desc';

  const { base, headers } = ctx(env);
  const res = await fetch(`${base}/rest/v1/clip_submissions?status=eq.${status}&select=${COLUMNS}&order=${order}&limit=${limit}`, { headers });
  if (!res.ok) {
    console.error('clips: list failed', res.status, await res.text().catch(() => ''));
    return json({ error: `Reading the queue failed (HTTP ${res.status}). Has clips-migration.sql been run?` }, 502);
  }
  const clips = await res.json();

  const paths = clips.map((c) => c.file_path).filter(Boolean);
  if (paths.length) {
    const sign = await fetch(`${base}/storage/v1/object/sign/${BUCKET}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS, paths })
    });
    const signed = sign.ok ? await sign.json() : [];
    if (!sign.ok) console.error('clips: signing links failed', sign.status);
    const byPath = new Map(signed.filter((s) => s && s.signedURL).map((s) => [s.path, s.signedURL]));
    for (const c of clips) {
      const rel = c.file_path && byPath.get(c.file_path);
      c.file_url = rel ? `${base}${rel.startsWith('/storage/v1') ? '' : '/storage/v1'}${rel}` : null;
    }
  }
  return json({ clips });
}

// ---------- POST /api/clips/:id/review ----------
async function review(request, env, id, caller) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  const decision = cleanText(body && body.decision, 10).toLowerCase();
  if (decision !== 'approve' && decision !== 'reject') return json({ error: 'decision must be approve or reject.' }, 400);

  let reviewer;
  if (caller.bot) {
    reviewer = cleanText(body.reviewer, 64);
    if (!reviewer) return json({ error: 'Missing reviewer (the Discord admin who pressed the button).' }, 400);
  } else {
    // The admin's own Discord name, from their profile, so the site can't be
    // told someone else approved it.
    const { base, headers } = ctx(env);
    const res = await fetch(`${base}/rest/v1/profiles?id=eq.${caller.adminId}&select=discord_username`, { headers });
    const rows = res.ok ? await res.json() : [];
    reviewer = cleanText(rows[0] && rows[0].discord_username, 64) || 'site admin';
  }

  const patch = {
    status: decision === 'approve' ? 'approved' : 'rejected',
    reviewed_by: reviewer,
    reviewed_via: caller.bot ? 'discord' : 'site',
    reviewed_at: new Date().toISOString(),
    reject_reason: decision === 'reject' ? (cleanText(body.reason, 300) || null) : null
  };
  const row = await patchClip(env, id, ['pending', 'approved'], patch);
  if (!row) return conflict(env, id, decision);
  if (decision === 'reject') await deleteFile(env, row.file_path);
  return json({ id: row.id, status: row.status });
}

// ---------- POST /api/clips/:id/posted ----------
async function markPosted(request, env, id) {
  let body = {};
  try { body = await request.json(); } catch { /* post_urls is optional */ }
  const urls = toList(body && body.post_urls).map((u) => String(u ?? '').trim()).filter(Boolean);
  if (urls.length > MAX_POST_URLS) return json({ error: `At most ${MAX_POST_URLS} post_urls.` }, 400);
  for (const u of urls) {
    if (u.length > 500 || !/^https:\/\/[^\s]+$/.test(u)) return json({ error: 'post_urls must be https:// links.' }, 400);
  }
  const row = await patchClip(env, id, ['approved'], { status: 'posted', posted_at: new Date().toISOString(), post_urls: urls });
  if (!row) return conflict(env, id, 'mark posted');
  await deleteFile(env, row.file_path);
  return json({ id: row.id, status: row.status });
}

export async function onRequest({ request, env, params }) {
  const missing = ['CLIPS_BOT_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !env[k]);
  if (missing.length) {
    // Names only, never values — see news.js.
    const similar = Object.keys(env).filter((k) => /clip|bot|token/i.test(k)).map((k) => JSON.stringify(k));
    return json({ error: `The clip queue is not configured: ${missing.join(', ')} not set on this deployment.`, similar_names: similar }, 500);
  }

  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const bot = await tokenMatches(token, env.CLIPS_BOT_TOKEN);
  const adminId = bot ? null : await adminUserId(env, token);
  if (!bot && !adminId) return json({ error: 'Unauthorised.' }, 401);
  const caller = { bot, adminId };

  const route = [].concat(params.route || []);
  const method = request.method;
  try {
    if (route.length === 0) {
      if (method === 'GET') return await list(request, env);
      if (method === 'POST') {
        if (!bot) return json({ error: 'Clips are submitted through the Discord bot.' }, 403);
        return await submit(request, env);
      }
      return json({ error: 'Use GET or POST.' }, 405);
    }
    if (route.length === 2 && /^\d{1,15}$/.test(route[0])) {
      if (method !== 'POST') return json({ error: 'Use POST.' }, 405);
      if (route[1] === 'review') return await review(request, env, route[0], caller);
      if (route[1] === 'posted') return await markPosted(request, env, route[0]);
    }
    return json({ error: 'Not found.' }, 404);
  } catch (e) {
    console.error('clips: request failed', e);
    return json({ error: 'Something went wrong talking to the database.' }, 502);
  }
}
