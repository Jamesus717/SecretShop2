import { fallbackRows } from './fallback';
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
