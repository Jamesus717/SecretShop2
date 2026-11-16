import { supabase, SUPABASE_URL } from './supabase';

// Clip queue client (docs/clip-queue-design.md). Everything goes through
// functions/api/clips with the admin's own session, which the server checks
// against admin_users. ?mock=1 reads /mock-data/clip-submissions.json instead.

export type ClipStatus = 'pending' | 'approved' | 'posted' | 'rejected';
export const CLIP_STATUSES: { key: ClipStatus; label: string }[] = [
  { key: 'pending', label: 'Waiting' },
  { key: 'approved', label: 'Approved' },
  { key: 'posted', label: 'Posted' },
  { key: 'rejected', label: 'Rejected' },
];
export const CLIP_EMPTY: Record<ClipStatus, string> = {
  pending: 'Nothing waiting. New clips from the bot show up here.',
  approved: 'No approved clips waiting for Owen.',
  posted: 'Nothing posted yet.',
  rejected: 'No rejected clips.',
};

export interface Clip {
  id: number;
  created_at: string;
  submitter_name: string;
  link: string | null;
  file_path: string | null;
  file_url?: string | null;
  teams: string[] | null;
  match_id: number | string | null;
  description: string | null;
  status: ClipStatus;
  reviewed_by: string | null;
  reviewed_via: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  posted_at: string | null;
  post_urls: string[] | null;
}

export class ClipApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const SIGNED_FILE_PREFIX = `${SUPABASE_URL}/storage/v1/object/sign/clip-files/`;

/** Only ever link to https pages. */
export function safeLink(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  try { return new URL(u).protocol === 'https:' ? u : null; } catch { return null; }
}
/** Only play files from our own signed bucket URLs (or mock-data in mock mode). */
export function safeFileUrl(u: unknown, mock = false): string | null {
  if (typeof u !== 'string') return null;
  if (mock) return /^\/?mock-data\/[\w./-]+$/.test(u) && !u.includes('..') ? (u.startsWith('/') ? u : `/${u}`) : null;
  return u.startsWith(SIGNED_FILE_PREFIX) ? u : null;
}
export function hostOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}
export function isMatchId(v: unknown): boolean {
  return /^\d{6,12}$/.test(String(v ?? ''));
}
export function when(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const t = await token();
  if (!t) throw new ClipApiError('signed out', 401);
  const res = await fetch(`/api/clips${path}`, {
    method: opts.method ?? 'GET',
    headers: { Authorization: `Bearer ${t}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  // A missing Pages Function comes back as Cloudflare's 200 HTML page, not JSON:
  // anything that isn't JSON means "not deployed".
  const out = await res.json().catch(() => null);
  if (!res.ok || !out) throw new ClipApiError((out && out.error) || `HTTP ${res.status}`, out ? res.status : 0);
  return out as T;
}

let mockRows: Clip[] | null = null;
async function mockLoad(status: ClipStatus): Promise<Clip[]> {
  if (!mockRows) {
    const res = await fetch('/mock-data/clip-submissions.json', { cache: 'no-store' });
    if (!res.ok) throw new ClipApiError(`mock clips HTTP ${res.status}`, res.status);
    mockRows = (await res.json()) as Clip[];
  }
  const rows = mockRows.filter((c) => c.status === status);
  const dir = status === 'pending' || status === 'approved' ? 1 : -1;
  rows.sort((a, b) => dir * a.created_at.localeCompare(b.created_at));
  return rows.map((r) => ({ ...r }));
}

export async function loadClips(status: ClipStatus, mock: boolean): Promise<Clip[]> {
  if (mock) return mockLoad(status);
  return (await api<{ clips: Clip[] }>(`?status=${status}&limit=100`)).clips;
}

export type ClipAction = 'approve' | 'reject' | 'posted';
/** Approve / reject / mark posted. In mock mode only the in-memory rows change. */
export async function actOnClip(id: number, kind: ClipAction, mock: boolean, reason = ''): Promise<void> {
  if (mock) {
    const row = mockRows?.find((c) => c.id === id);
    if (!row) return;
    const now = new Date().toISOString();
    if (kind === 'posted') Object.assign(row, { status: 'posted', posted_at: now });
    else Object.assign(row, {
      status: kind === 'approve' ? 'approved' : 'rejected', reviewed_by: 'you (mock)', reviewed_via: 'site',
      reviewed_at: now, reject_reason: kind === 'reject' ? reason || null : null,
    });
    return;
  }
  if (kind === 'posted') await api(`/${id}/posted`, { method: 'POST', body: {} });
  else await api(`/${id}/review`, { method: 'POST', body: { decision: kind, reason } });
}
