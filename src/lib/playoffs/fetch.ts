import { fallbackRows } from './fallback';
import { createSchedule } from './schedule';
import { parseSchedule, SHEET_CSV } from './parse';
import type { MatchRow } from './types';

export interface ScheduleLoad {
  rows: MatchRow[];
  /** true when the live sheet could not be read and the seed rows are shown. */
  stale: boolean;
  error?: string;
}

/** Live fetch. Cache-busted: the sheet is edited on match nights. Throws on failure. */
export async function fetchScheduleRows(fetchFn: typeof fetch = fetch): Promise<MatchRow[]> {
  const res = await fetchFn(`${SHEET_CSV}&_=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseSchedule(await res.text());
}

/** Live rows, or the fallback seed flagged stale. Never rejects. */
export async function loadSchedule(fetchFn: typeof fetch = fetch): Promise<ScheduleLoad> {
  try {
    return { rows: await fetchScheduleRows(fetchFn), stale: false };
  } catch (e) {
    return { rows: fallbackRows(), stale: true, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Decided series off the sheet (forfeits and games Imprint missed included), winner/loser by name. */
export function seriesResults(rows: MatchRow[], knownNames: string[] = []) {
  const s = createSchedule(rows, knownNames);
  const out: { winner: string; loser: string; div: MatchRow['div']; week: number | null; n: number | null; final: boolean }[] = [];
  for (const m of s.matches()) {
    const r = s.matchResult(m);
    if (r && r.winner && r.loser) {
      out.push({ winner: r.winner, loser: r.loser, div: m.div, week: m.week, n: m.n, final: s.isGrandFinal(m) });
    }
  }
  return out;
}

/** Live sheet -> series results. Resolves null when the sheet is unreachable (callers keep game-derived records). */
export async function fetchPlayoffResults(fetchFn: typeof fetch = fetch, knownNames: string[] = []) {
  try {
    return seriesResults(await fetchScheduleRows(fetchFn), knownNames);
  } catch (e) {
    console.warn('Playoff sheet unavailable, using game-derived records:', e);
    return null;
  }
}
