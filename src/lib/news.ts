import { supabase, SUPABASE_URL } from './supabase';

// Match cards posted by the Discord bot / admins, stored in news_posts (written
// only by functions/api/news.js, which has no GET: reads go to Supabase directly).

const BUCKET = 'news-cards';
export const COLUMNS = 'id, created_at, kind, title, image_path, thumb_path, division, teams, match_ids, youtube_id, hidden';

export type DivisionKey = 'upper' | 'mid' | 'lower';

export interface NewsPost {
  id: string | number;
  created_at: string;
  kind: string;
  title: string;
  image_path: string | null;
  thumb_path: string | null;
  division: DivisionKey | null;
  teams: string[] | null;
  match_ids: string[] | null;
  youtube_id: string | null;
  hidden: boolean;
}

export const DIV_LABELS: Record<DivisionKey, string> = { upper: 'Upper', mid: 'Middle', lower: 'Lower' };
export const KIND_LABELS: Record<string, string> = {
  result: 'Result', match: 'Scoreboard', elimination: 'Eliminations',
  bracket: 'Bracket', hero: 'Hero', team: 'Team', other: 'News',
};

// Paths are YYYY-MM/<uuid>[-thumb].<ext>. Anything else isn't ours: don't build a URL from it.
const PATH_RE = /^\d{4}-\d{2}\/[0-9a-f-]{36}(-thumb)?\.(png|webp|jpg)$/;

export function storageUrl(path: string | null | undefined): string | null {
  if (!path || !PATH_RE.test(path)) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}
export const imageUrl = (p: Pick<NewsPost, 'image_path'>) => storageUrl(p.image_path);
/** The bot's full cards are ~3MB PNGs; lists use the small copy when there is one. */
export const thumbUrl = (p: Pick<NewsPost, 'image_path' | 'thumb_path'>) => storageUrl(p.thumb_path) || imageUrl(p);

export async function loadNewsPosts(
  opts: {
    limit?: number; before?: string | null; division?: DivisionKey | null; kind?: string | null;
    /** Keep posts flagged hidden. RLS only returns those to admins, so this is safe to pass for everyone. */
    includeHidden?: boolean;
  } = {},
): Promise<NewsPost[]> {
  const { limit = 12, before = null, division = null, kind = null, includeHidden = false } = opts;
  let q = supabase.from('news_posts').select(COLUMNS).order('created_at', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  if (division) q = q.eq('division', division);
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) throw error;
  return ((data || []) as NewsPost[]).filter((p) => imageUrl(p) && (includeHidden || !p.hidden));
}

/** Never throws: Latest simply hides when the feed is unavailable. */
export async function loadLatestPosts(limit = 6): Promise<NewsPost[]> {
  try {
    return await loadNewsPosts({ limit });
  } catch (e) {
    console.warn('News cards unavailable:', e instanceof Error ? e.message : e);
    return [];
  }
}

export function formatPostDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
