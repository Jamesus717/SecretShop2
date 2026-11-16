import { supabase } from './supabase';

// Shared by the register page (upload) and every page that shows a crest.
// See team-logos-migration.sql for the bucket, table and RLS policies.

const BUCKET = 'team-logos';
const OUTPUT_SIZE = 256;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;

// SVG is excluded on purpose: it can carry script and the bucket is public.
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const LOGO_ACCEPT_ATTR = ACCEPTED_TYPES.join(',');

/** Team names disagree on casing/spacing between sources, so match on letters and digits only. */
export function logoKey(name: string | null | undefined): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image couldn't be read. Try a different file.")); };
    img.src = url;
  });
}

/** Validate and shrink a picked file to a square 256px WEBP. Throws an Error safe to show the user. */
export async function prepareLogo(file: File | null | undefined): Promise<Blob> {
  if (!file) throw new Error('No image selected.');
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error('Please use a PNG, JPG, WEBP or GIF image.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That image is over 8MB. Please pick a smaller one.');

  const img = await loadImage(file);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  if (!longest) throw new Error("That image couldn't be read. Try a different file.");

  const scale = Math.min(1, OUTPUT_SIZE / longest);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Couldn't process that image. Try a different file.");
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, Math.round((OUTPUT_SIZE - w) / 2), Math.round((OUTPUT_SIZE - h) / 2), w, h);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.92));
  if (!blob) throw new Error("Couldn't process that image. Try a different file.");
  return blob;
}

export async function uploadTeamLogo(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/logo-${Date.now()}.webp`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp', upsert: true });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function saveTeamLogoRecord(userId: string, teamName: string, logoUrl: string): Promise<void> {
  const { error } = await supabase.from('team_logos').upsert(
    { user_id: userId, team_name: teamName, name_key: logoKey(teamName), logo_url: logoUrl, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

/** Best-effort cleanup when a captain deletes their team registration. */
export async function deleteTeamLogo(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  try {
    const { data: files } = await supabase.storage.from(BUCKET).list(userId);
    if (files?.length) await supabase.storage.from(BUCKET).remove(files.map((f) => `${userId}/${f.name}`));
  } catch (e) {
    console.error('Team logo file cleanup failed:', e);
  }
  await supabase.from('team_logos').delete().eq('user_id', userId);
}

export type LogoMap = Map<string, string>;

/** name_key -> logo_url. Empty Map if the lookup fails. */
export async function fetchTeamLogoMap(): Promise<LogoMap> {
  try {
    const { data, error } = await supabase
      .from('team_logos')
      .select('name_key, logo_url, updated_at')
      .order('updated_at', { ascending: true });
    if (error) throw error;
    const map: LogoMap = new Map();
    // Ascending, so the newer upload wins if two captains claim one name.
    (data || []).forEach((row: { name_key: string; logo_url: string }) => map.set(row.name_key, row.logo_url));
    return map;
  } catch (e) {
    console.error('Failed to load uploaded team logos:', e);
    return new Map();
  }
}

// Resolving a crest for display: uploaded logo first, then a file in assets/teaminfoimgs/.
const IMG_EXTS = ['png', 'webp', 'jpg', 'jpeg'];
const IMG_DIR = '/assets/teaminfoimgs/';

// Exact registered team name -> file, for names whose filename can't be derived.
export const TEAM_IMAGE_OVERRIDES: Record<string, string> = {
  'The Dark Side of the Map': `${IMG_DIR}TheDarkSideoftheMap.png`,
  'Money Talks': `${IMG_DIR}MoneyTalks.png`,
  'The Truers': `${IMG_DIR}The_Truers.webp`,
  'Crêpe stack': `${IMG_DIR}Crepe_stack.png`,
};

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Hosts are usually case-sensitive, so probe the common casings.
function caseVariants(s: string): string[] {
  const lower = s.toLowerCase();
  return [s, lower, lower.charAt(0).toUpperCase() + lower.slice(1)];
}

function slugCandidates(name: string | null | undefined): string[] {
  const trimmed = (name || '').trim();
  if (!trimmed) return [];
  const forms = [trimmed.replace(/\s+/g, '_'), trimmed.replace(/\s+/g, ''), trimmed, trimmed.replace(/\s+/g, '-')];
  const out: string[] = [];
  [forms, forms.map(stripAccents)].forEach((set) => set.forEach((f) => caseVariants(f).forEach((v) => out.push(v))));
  return [...new Set(out)];
}

/** Every path worth trying for this team, best first. */
export function teamImageCandidates(name: string | null | undefined, logoMap?: LogoMap | null): string[] {
  const uploaded = logoMap?.get(logoKey(name));
  const override = TEAM_IMAGE_OVERRIDES[(name || '').trim()];
  if (override) return uploaded ? [uploaded, override] : [override];
  const paths: string[] = uploaded ? [uploaded] : [];
  slugCandidates(name).forEach((base) => IMG_EXTS.forEach((ext) => paths.push(`${IMG_DIR}${base}.${ext}`)));
  return paths;
}

// Resolution loads each candidate until one decodes (a missing asset on the live
// host is a 200 HTML page, so status codes can't be trusted). Cached as a promise
// per team name so simultaneous callers share one round of probing.
const imageCache = new Map<string, Promise<string | null>>();

export function resolveTeamImage(name: string, logoMap?: LogoMap | null): Promise<string | null> {
  const key = logoKey(name);
  const cached = imageCache.get(key);
  if (cached) return cached;

  const promise = new Promise<string | null>((resolve) => {
    const candidates = teamImageCandidates(name, logoMap);
    let i = 0;
    const tryNext = () => {
      if (i >= candidates.length) { resolve(null); return; }
      const src = candidates[i++];
      const img = new Image();
      img.onload = () => resolve(src);
      img.onerror = tryNext;
      img.src = src;
    };
    tryNext();
  });
  imageCache.set(key, promise);
  return promise;
}

/** Up to two initials for the fallback crest. */
export function teamInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s-]/gu, '').split(/[\s-]+/).filter(Boolean);
  if (!words.length) return '?';
  const first = words[0][0] ?? '';
  const second = words.length > 1 ? (words[words.length - 1][0] ?? '') : (words[0][1] ?? '');
  return (first + second).toUpperCase();
}
