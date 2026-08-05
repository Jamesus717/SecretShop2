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
