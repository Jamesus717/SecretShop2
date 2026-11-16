import { supabaseClient } from './supabase.js';

// Shared by register.js (upload) and teaminfo.js (display).
// See team-logos-migration.sql for the bucket, table and RLS policies.

const BUCKET = 'team-logos';
const OUTPUT_SIZE = 256;          // rendered into an 84px circle — 256 covers retina with room to spare
const MAX_INPUT_BYTES = 8 * 1024 * 1024;

// SVG is excluded on purpose: it can carry script and the bucket is public.
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export const LOGO_ACCEPT_ATTR = ACCEPTED_TYPES.join(',');

// Team names arrive from two places that disagree on casing and spacing (the
// Google Sheet vs. what the captain typed), so match on letters and digits only.
export function logoKey(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image couldn't be read — try a different file.")); };
    img.src = url;
  });
}

/**
 * Validate and shrink a user-picked file to a square 256px WEBP.
 * Square output means the circular crest never crops the logo (the wheel uses
 * object-fit: cover); the image is centred with transparent padding instead.
 * Throws an Error whose message is safe to show the user.
 */
export async function prepareLogo(file) {
  if (!file) throw new Error('No image selected.');
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('Please use a PNG, JPG, WEBP or GIF image.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('That image is over 8MB — please pick a smaller one.');
  }

  const img = await loadImage(file);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (!longest) throw new Error("That image couldn't be read — try a different file.");

  const scale = Math.min(1, OUTPUT_SIZE / longest);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  // No background fill — transparent PNG logos stay transparent.
  ctx.drawImage(img, Math.round((OUTPUT_SIZE - w) / 2), Math.round((OUTPUT_SIZE - h) / 2), w, h);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.92));
  if (!blob) throw new Error("Couldn't process that image — try a different file.");
  return blob;
}

export async function uploadTeamLogo(userId, blob) {
  const path = `${userId}/logo-${Date.now()}.webp`;
  const { error } = await supabaseClient.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/webp', upsert: true });
  if (error) throw error;

  const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function saveTeamLogoRecord(userId, teamName, logoUrl) {
  const { error } = await supabaseClient.from('team_logos').upsert({
    user_id: userId,
    team_name: teamName,
    name_key: logoKey(teamName),
    logo_url: logoUrl,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
  if (error) throw error;
}

/** Best-effort cleanup when a captain deletes their team registration. */
export async function deleteTeamLogo(userId) {
  if (!userId) return;
  try {
    const { data: files } = await supabaseClient.storage.from(BUCKET).list(userId);
    if (files?.length) {
      await supabaseClient.storage.from(BUCKET).remove(files.map((f) => `${userId}/${f.name}`));
    }
  } catch (e) {
    console.error('Team logo file cleanup failed:', e);
  }
  await supabaseClient.from('team_logos').delete().eq('user_id', userId);
}

/** name_key → logo_url, for Team Info. Returns an empty Map if the lookup fails. */
export async function fetchTeamLogoMap() {
  try {
    const { data, error } = await supabaseClient
      .from('team_logos')
      .select('name_key, logo_url, updated_at')
      .order('updated_at', { ascending: true });
    if (error) throw error;

    const map = new Map();
    // Ascending, so if two captains claim the same team name the newer upload wins.
    (data || []).forEach((row) => map.set(row.name_key, row.logo_url));
    return map;
  } catch (e) {
    console.error('Failed to load uploaded team logos:', e);
    return new Map();
  }
}

// ── Resolving a team's crest for display ─────────────────────────
// Two sources, in order of authority:
//   1. the logo the captain uploaded at registration (team_logos, above)
//   2. a file an admin dropped into assets/teaminfoimgs/ — how every team that
//      registered before uploads existed still gets a crest
//
// Shared by Team Info and the playoffs bracket so a team's crest is the same
// picture everywhere. Before this lived here, the playoffs page only knew about
// source 1 and showed initials for the nine teams that only have source 2.

const IMG_EXTS = ['png', 'webp', 'jpg', 'jpeg'];

// Manual escape hatch: if a team's logo filename can't be derived from its name,
// map the exact registered team name to its file here.
//
// Worth using whenever a filename drops the spaces or changes the extension:
// the probe below only reaches the no-separator form after trying four
// extensions across three casings of the underscored one, so these three
// entries alone save two dozen wasted requests per page load.
const TEAM_IMAGE_OVERRIDES = {
  'The Dark Side of the Map': 'assets/teaminfoimgs/TheDarkSideoftheMap.png',
  'Money Talks': 'assets/teaminfoimgs/MoneyTalks.png',
  'The Truers': 'assets/teaminfoimgs/The_Truers.webp',
  // Accent-stripped forms are probed last, so this one costs 32 requests without
  // the shortcut — the file is Crepe_stack.png but the team is "Crêpe stack".
  'Crêpe stack': 'assets/teaminfoimgs/Crepe_stack.png'
};

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Filenames are matched case-insensitively (live hosts are usually case-sensitive,
// so we probe the common casings rather than trusting the team name's own casing).
function caseVariants(s) {
  const lower = s.toLowerCase();
  const sentence = lower.charAt(0).toUpperCase() + lower.slice(1);
  return [s, lower, sentence];
}

function slugCandidates(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return [];

  const separatorForms = [
    trimmed.replace(/\s+/g, '_'),
    trimmed.replace(/\s+/g, ''),
    trimmed,
    trimmed.replace(/\s+/g, '-')
  ];

  const out = [];
  // Exact-accent forms first, then accent-stripped (e.g. "Crêpe stack" → "Crepe_stack").
  [separatorForms, separatorForms.map(stripAccents)].forEach((forms) => {
    forms.forEach((form) => caseVariants(form).forEach((v) => out.push(v)));
  });
  return [...new Set(out)];
}

/** Every path worth trying for this team, best first. */
export function teamImageCandidates(name, logoMap) {
  // A logo the captain uploaded at registration wins — it's the team's own
  // choice, and the paths below are only a fallback for teams that registered
  // before uploads existed (or whose logo an admin added by hand).
  const uploaded = logoMap?.get(logoKey(name));

  const override = TEAM_IMAGE_OVERRIDES[(name || '').trim()];
  if (override) return uploaded ? [uploaded, override] : [override];

  const paths = uploaded ? [uploaded] : [];
  slugCandidates(name).forEach((base) => {
    IMG_EXTS.forEach((ext) => paths.push(`assets/teaminfoimgs/${base}.${ext}`));
  });
  return paths;
}

// Resolution means actually loading each candidate until one decodes, which is
// the only reliable test: a missing asset on the live host comes back as a 200
// with an HTML error page rather than a 404, so status codes can't be trusted
// (an <img> still rejects it, because HTML isn't decodable as an image).
//
// Results are cached per page load, keyed by team name — the wheel re-renders
// on every tab switch and shouldn't re-probe. The cache holds the promise, not
// the value, so simultaneous callers share one round of probing.
const imageCache = new Map();

/** Resolves to a usable image URL for the team, or null if it has no crest. */
export function resolveTeamImage(name, logoMap) {
  const key = logoKey(name);
  if (imageCache.has(key)) return imageCache.get(key);

  const promise = new Promise((resolve) => {
    const candidates = teamImageCandidates(name, logoMap);
    let i = 0;
    function tryNext() {
      if (i >= candidates.length) { resolve(null); return; }
      const src = candidates[i++];
      const img = new Image();
      img.onload = () => resolve(src);
      img.onerror = tryNext;
      img.src = src;
    }
    tryNext();
  });

  imageCache.set(key, promise);
  return promise;
}
