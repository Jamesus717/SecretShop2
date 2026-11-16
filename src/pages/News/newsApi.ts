import { supabase } from '../../lib/supabase';
import { COLUMNS, imageUrl, type NewsPost } from '../../lib/news';

// News page data + admin actions. Reads go to Supabase directly (RLS returns hidden
// posts to admins only); posting goes to POST /api/news with the admin's own session,
// which the server checks against admin_users (as legacy newsfeed.js did).

export const PAGE_SIZE = 24;
const THUMB_WIDTH = 640;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function loadOne(id: string): Promise<NewsPost | null> {
  const { data, error } = await supabase.from('news_posts').select(COLUMNS).eq('id', id).maybeSingle();
  if (error || !data) return null;
  const p = data as NewsPost;
  return imageUrl(p) ? p : null;
}

/** A YouTube link or bare id -> 11-char id. null = empty, undefined = not YouTube. Mirrors functions/api/news.js. */
export function youtubeId(v: unknown): string | null | undefined {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let u: URL;
  try { u = new URL(s); } catch { return undefined; }
  const host = u.hostname.replace(/^(www|m)\./, '');
  let id: string | null | undefined = null;
  if (host === 'youtu.be') id = u.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v') || /^\/(?:shorts|embed|live)\/([^/?#]+)/.exec(u.pathname)?.[1];
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? (id as string) : undefined;
}

export async function setPostFields(id: string | number, patch: { hidden?: boolean; youtube_id?: string | null }): Promise<void> {
  const { error } = await supabase.from('news_posts').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

async function adminToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

async function canvasBlob(source: Blob, width: number, type: string, quality?: number): Promise<Blob> {
  const bmp = await createImageBitmap(source);
  const scale = Math.min(1, width / bmp.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const toBlob = (t: string, q?: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, t, q));
  let blob = await toBlob(type, quality);
  // Older Safari can't encode WEBP and quietly hands back a PNG instead.
  if (!blob || blob.type !== type) blob = await toBlob('image/png');
  if (!blob) throw new Error("Couldn't process that image.");
  return blob;
}

/** The full card: anything wider than 1920px or heavier than 1.5MB becomes a 1920px WEBP. */
async function prepareFull(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const small = bmp.width <= 1920 && file.size <= 1.5 * 1024 * 1024;
  bmp.close();
  return small ? file : canvasBlob(file, 1920, 'image/webp', 0.92);
}

export interface NewCard {
  file: File; title: string; kind: string; division: string; teams: string; match_ids: string; youtube: string;
}

/** POST /api/news as the signed-in admin. Throws Error with a human message. */
export async function postCard(card: NewCard, onStatus: (s: string) => void): Promise<void> {
  const token = await adminToken();
  if (!token) throw new Error("You're signed out. Sign in again and retry.");
  if (youtubeId(card.youtube) === undefined) throw new Error("That isn't a YouTube video link.");

  onStatus('Preparing image…');
  const [image, thumb] = await Promise.all([prepareFull(card.file), canvasBlob(card.file, THUMB_WIDTH, 'image/webp', 0.8)]);
  if (image.size > MAX_UPLOAD_BYTES) throw new Error('That image is still over 5MB after shrinking. Export at 1x instead.');

  const fd = new FormData();
  fd.append('image', image, 'card');
  fd.append('thumb', thumb, 'thumb');
  fd.append('title', card.title.trim());
  fd.append('kind', card.kind.trim());
  fd.append('division', card.division.trim());
  fd.append('match_ids', card.match_ids.trim());
  fd.append('teams', card.teams.trim());
  fd.append('youtube', card.youtube.trim());

  onStatus('Uploading…');
  const res = await fetch('/api/news', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((out as { error?: string }).error || `Upload failed (HTTP ${res.status}).`);
}

export function cardLink(id: string | number): string {
  return `${window.location.origin}/news?card=${encodeURIComponent(String(id))}`;
}
