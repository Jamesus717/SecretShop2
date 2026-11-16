import { supabase } from './supabase';
import { logoKey } from './teamlogo';

// Team rosters from the Google Apps Script web app (same URL legacy teaminfo.js/playoffs.js use).
// It can take ~16s cold, so results are cached in memory and in sessionStorage.
export const ROSTER_URL =
  'https://script.google.com/macros/s/AKfycby727bbYh0mTv8sWjyHe9DJVp5YTkZnTNyAzcxfWJPNXcnbJ32xbyX_QM7CQwlQ5Pie1Q/exec';

// ---------- Ranks (ported from legacy js/ranks.js) ----------
export interface RankBand { icon: string; label: string; min: number; max: number }

export const RANKS: RankBand[] = [
  { icon: '/assets/ranks/herald.png', label: 'Herald', min: 1, max: 769 },
  { icon: '/assets/ranks/guardian.png', label: 'Guardian', min: 770, max: 1539 },
  { icon: '/assets/ranks/crusader.png', label: 'Crusader', min: 1540, max: 2309 },
  { icon: '/assets/ranks/archon.png', label: 'Archon', min: 2310, max: 3079 },
  { icon: '/assets/ranks/legend.png', label: 'Legend', min: 3080, max: 3849 },
  { icon: '/assets/ranks/ancient.png', label: 'Ancient', min: 3850, max: 4619 },
  { icon: '/assets/ranks/divine.png', label: 'Divine', min: 4620, max: 5619 },
  { icon: '/assets/ranks/immortal.png', label: 'Immortal', min: 5620, max: Infinity },
];

const IMMORTAL_NOMINAL_MMR = 6000;

export function mmrToRank(mmr: unknown): RankBand | null {
  const n = Number(mmr);
  if (!Number.isFinite(n) || n < 1) return null;
  return RANKS.find((r) => n >= r.min && n <= r.max) ?? RANKS[RANKS.length - 1];
}

/** Icon path for a rank label such as "Legend"; '' when unknown. */
export function rankIconFor(label: string | null | undefined): string {
  const l = String(label ?? '').trim().toLowerCase();
  return RANKS.find((r) => r.label.toLowerCase() === l)?.icon ?? '';
}

// ---------- Second Dotabuff accounts (ported from legacy js/altaccounts.js) ----------
// Display only. steam64 = account id + 76561197960265728.
export const ALT_ACCOUNTS: Record<string, { id: string; label: string }[]> = {
  // Immoral (The Bortymites, pos 4). Registered on 713653325 / 76561198673919053.
  '713653325': [{ id: '106214458', label: 'Alt' }],
  '76561198673919053': [{ id: '106214458', label: 'Alt' }],
};

export function altAccountsFor(...ids: (string | number | null | undefined)[]): { url: string; label: string }[] {
  const seen = new Set<string>();
  const out: { url: string; label: string }[] = [];
  for (const id of ids) {
    for (const alt of ALT_ACCOUNTS[String(id ?? '').trim()] ?? []) {
      if (seen.has(alt.id)) continue;
      seen.add(alt.id);
      out.push({ url: `https://www.dotabuff.com/players/${alt.id}`, label: alt.label || 'Alt' });
    }
  }
  return out;
}

// ---------- Types ----------
export interface Player {
  ign: string;
  steam: string;
  dotabuff: string;
  rank: string;
  mmr: number | null;
  position: string;
  isCaptain: boolean;
}

export interface Team {
  id: string;
  teamName: string;
  captain: string;
  players: Player[];
}

// ---------- Normalisation ----------
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/** Admins publish a team by setting Visible to 1; blank (older rows) counts as visible. */
export function isVisible(v: unknown): boolean {
  const s = str(v).toLowerCase();
  if (s === '') return true;
  return s === '1' || s === 'true' || s === 'yes' || s === 'y';
}

/** Only accept a Dotabuff player URL; the sheet is hostile input (no javascript: links). */
export function safeDotabuffUrl(raw: unknown, steam: unknown): string {
  const r = str(raw);
  if (/^https:\/\/(www\.)?dotabuff\.com\/players\/\d+\/?$/i.test(r)) return r;
  const s = str(steam);
  return /^\d{17}$/.test(s) ? `https://www.dotabuff.com/players/${s}` : '';
}

function normPlayer(raw: unknown): Player | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const ign = str(p.ign);
  const steam = str(p.steam);
  if (!ign && !steam) return null;
  const m = Number(p.mmr);
  return {
    ign,
    steam,
    dotabuff: safeDotabuffUrl(p.dotabuff, steam),
    rank: str(p.rank),
    mmr: Number.isFinite(m) && m > 0 ? Math.round(m) : null,
    position: str(p.position),
    isCaptain: p.isCaptain === true || p.isCaptain === 'TRUE' || p.isCaptain === 'true' || p.isCaptain === 1,
  };
}

/** Raw Apps Script JSON -> visible teams with cleaned players. Never throws. */
export function normaliseRosters(raw: unknown): Team[] {
  const list = raw && typeof raw === 'object' ? (raw as { teams?: unknown }).teams : null;
  if (!Array.isArray(list)) return [];
  const out: Team[] = [];
  list.forEach((t, i) => {
    if (!t || typeof t !== 'object') return;
    const r = t as Record<string, unknown>;
    const teamName = str(r.teamName);
    if (!teamName || !isVisible(r.visible)) return;
    const players = (Array.isArray(r.players) ? r.players : [])
      .map(normPlayer)
      .filter((p): p is Player => p !== null);
    const captain = str(r.captain);
    // The flag is authoritative; fall back to matching the captain's IGN.
    if (!players.some((p) => p.isCaptain) && captain) {
      const hit = players.find((p) => p.ign.toLowerCase() === captain.toLowerCase());
      if (hit) hit.isCaptain = true;
    }
    out.push({ id: str(r.id) || `team-${i}`, teamName, captain, players });
  });
  return out;
}

// ---------- Strength ----------
/** Mean of real per-player MMR, rounded; null when no player has one. */
export function averageMmr(players: Pick<Player, 'mmr'>[]): number | null {
  const m = players.map((p) => p.mmr).filter((n): n is number => typeof n === 'number' && n > 0);
  if (!m.length) return null;
  return Math.round(m.reduce((a, b) => a + b, 0) / m.length);
}

/** Rank-band fallback for teams registered before MMR was collected. */
export function averageRank(players: Pick<Player, 'rank'>[]): RankBand | null {
  const mids = players
    .map((p) => RANKS.find((r) => r.label.toLowerCase() === p.rank.trim().toLowerCase()))
    .filter((r): r is RankBand => !!r)
    .map((r) => (r.max === Infinity ? IMMORTAL_NOMINAL_MMR : (r.min + r.max) / 2));
  if (!mids.length) return null;
  return mmrToRank(mids.reduce((a, b) => a + b, 0) / mids.length);
}

export type Strength =
  | { kind: 'mmr'; mmr: number; label: string }
  | { kind: 'rank'; rank: RankBand; label: string }
  | null;

/** Real MMR preferred; "Avg Rank" is labelled as such so an approximation never reads as an average. */
export function teamStrength(players: Player[]): Strength {
  const mmr = averageMmr(players);
  if (mmr !== null) return { kind: 'mmr', mmr, label: `Avg MMR ${mmr.toLocaleString('en-GB')}` };
  const rank = averageRank(players);
  return rank ? { kind: 'rank', rank, label: `Avg Rank ${rank.label}` } : null;
}

export function findTeam(teams: Team[], name: string | null | undefined): Team | undefined {
  const k = logoKey(name);
  return k ? teams.find((t) => logoKey(t.teamName) === k) : undefined;
}

// ---------- Fetch + cache ----------
const CACHE_KEY = 'ss_rosters_v1';
const CACHE_TTL_MS = 10 * 60 * 1000;

let memory: Team[] | null = null;
let inflight: Promise<Team[]> | null = null;

function readSession(): Team[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { at, teams } = JSON.parse(raw) as { at: number; teams: Team[] };
    if (!Array.isArray(teams) || Date.now() - at > CACHE_TTL_MS) return null;
    return teams;
  } catch {
    return null;
  }
}

function writeSession(teams: Team[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), teams }));
  } catch { /* quota or private mode: the memory cache still works */ }
}

/** Synchronous cache hit (memory, then sessionStorage), or null. */
export function cachedRosters(): Team[] | null {
  if (memory) return memory;
  const s = readSession();
  if (s) memory = s;
  return memory;
}

/** Fetch rosters; shares one in-flight request and uses the cache unless `force`. Rejects on network failure. */
export function fetchRosters(force = false): Promise<Team[]> {
  if (!force) {
    const hit = cachedRosters();
    if (hit) return Promise.resolve(hit);
  }
  if (inflight) return inflight;
  inflight = fetch(ROSTER_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((json) => {
      const teams = normaliseRosters(json);
      memory = teams;
      writeSession(teams);
      return teams;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** team_key (logoKey of the name) -> division, from admin overrides. {} on failure. */
export async function fetchDivisionOverrides(): Promise<Record<string, string>> {
  try {
    const { data, error } = await supabase.from('team_divisions').select('team_key, division');
    if (error) throw error;
    const map: Record<string, string> = {};
    (data ?? []).forEach((r: { team_key: string; division: string }) => { map[r.team_key] = r.division; });
    return map;
  } catch (e) {
    console.error('Could not load division overrides:', e);
    return {};
  }
}
