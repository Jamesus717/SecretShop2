import { DEFAULT_BO, parseSlot } from './parse';
import type { Division, MatchRow } from './types';

interface Seed { div: Division; week: number; date?: string; n: number; elim?: boolean; bo?: number; a: string; b: string }

// Last known good schedule, used only when the live sheet can't be reached.
// Deliberately minimal: the page shows a "may be stale" banner when it is used.
export const FALLBACK_ROWS: Seed[] = [
  { div: 'mid', week: 1, date: '2026-09-14', n: 1, a: 'The Bortymites', b: 'Ctrl Alt Defeat' },
  { div: 'mid', week: 1, date: '2026-09-17', n: 2, a: 'Winner of match 1', b: '5 Stuns No Brains' },
  { div: 'mid', week: 1, date: '2026-09-15', n: 3, a: 'The Truers', b: 'The Dark side of the map' },
  { div: 'mid', week: 1, date: '2026-09-14', n: 4, a: 'Tailungs Accountants', b: 'Money Talks' },
  { div: 'mid', week: 1, date: '2026-09-14', n: 5, a: 'Imprint Esports', b: 'Free Bans Gang' },
  { div: 'mid', week: 2, date: '2026-09-21', n: 6, elim: true, a: 'Loser of match 1', b: 'Loser of match 5' },
  { div: 'mid', week: 2, date: '2026-09-21', n: 7, elim: true, a: 'Winner of match 6', b: 'Loser of match 4' },
  { div: 'mid', week: 2, date: '2026-09-21', n: 8, elim: true, a: 'Loser of match 2', b: 'Loser of match 3' },
  { div: 'mid', week: 2, date: '2026-09-21', n: 9, a: 'Winner of match 2', b: 'Winner of match 3' },
  { div: 'mid', week: 2, date: '2026-09-21', n: 10, a: 'Winner of match 4', b: 'Winner of match 5' },
  { div: 'mid', week: 3, date: '2026-09-28', n: 11, a: 'Winner of match 9', b: 'Winner of match 10' },
  { div: 'mid', week: 3, date: '2026-09-28', n: 12, elim: true, a: 'Winner of match 7', b: 'Loser of match 9' },
  { div: 'mid', week: 3, date: '2026-09-28', n: 13, elim: true, a: 'Winner of match 8', b: 'Loser of match 10' },
  { div: 'mid', week: 4, date: '2026-09-30', n: 14, elim: true, a: 'Winner of match 12', b: 'Winner of match 13' },
  { div: 'mid', week: 5, date: '2026-10-05', n: 15, elim: true, a: 'Winner of match 14', b: 'Loser of match 11' },
  { div: 'mid', week: 6, n: 16, bo: 5, a: 'Winner of match 15', b: 'Winner of match 11' },
  { div: 'upper', week: 1, date: '2026-09-15', n: 1, a: 'Glizzy Gladiators', b: 'Midland Massive' },
  { div: 'upper', week: 2, date: '2026-09-22', n: 2, a: 'N-Sitution', b: 'Winner of match 1' },
  { div: 'upper', week: 2, date: '2026-09-22', n: 3, a: 'Slob Team', b: 'Golden Retrievers' },
  { div: 'upper', week: 3, date: '2026-09-29', n: 4, a: 'Winner of match 2', b: 'Winner of match 3' },
  { div: 'upper', week: 3, date: '2026-09-29', n: 5, elim: true, a: 'Loser of match 1', b: 'Loser of match 3' },
  { div: 'upper', week: 4, date: '2026-09-30', n: 6, elim: true, a: 'Winner of match 5', b: 'Loser of match 2' },
  { div: 'upper', week: 5, date: '2026-10-06', n: 7, elim: true, a: 'Winner of match 6', b: 'Loser of match 4' },
  { div: 'upper', week: 6, n: 8, bo: 5, a: 'Winner of match 7', b: 'Winner of match 4' },
  { div: 'lower', week: 1, date: '2026-09-15', n: 1, a: 'No Sweat', b: 'Chutney Smugglers' },
  { div: 'lower', week: 1, date: '2026-09-15', n: 2, a: 'D2Ire Rejects', b: 'Herald Royale' },
  { div: 'lower', week: 2, date: '2026-09-22', n: 3, a: 'Farmville', b: 'Winner of match 1' },
  { div: 'lower', week: 2, date: '2026-09-23', n: 4, a: 'Catwice', b: 'Winner of match 2' },
  { div: 'lower', week: 3, date: '2026-09-30', n: 5, a: 'Winner of match 3', b: 'Winner of match 4' },
  { div: 'lower', week: 3, date: '2026-09-30', n: 6, elim: true, a: 'Loser of match 1', b: 'Loser of match 3' },
  { div: 'lower', week: 3, date: '2026-09-30', n: 7, elim: true, a: 'Loser of match 2', b: 'Loser of match 4' },
  { div: 'lower', week: 4, date: '2026-10-05', n: 8, elim: true, a: 'Winner of match 6', b: 'Winner of match 7' },
  { div: 'lower', week: 5, date: '2026-10-07', n: 9, elim: true, a: 'Winner of match 8', b: 'Loser of match 5' },
  { div: 'lower', week: 6, n: 10, bo: 5, a: 'Winner of match 9', b: 'Winner of match 5' },
];

/** The offline seed in the same shape as a parsed sheet row. */
export function fallbackRows(): MatchRow[] {
  return FALLBACK_ROWS.map((r) => ({
    div: r.div,
    week: r.week,
    n: r.n,
    date: r.date ?? null,
    time: null,
    bo: r.bo ?? DEFAULT_BO,
    elim: Boolean(r.elim),
    a: parseSlot(r.a),
    b: parseSlot(r.b),
    caster: '', analyst: '', observer: '', stream: '',
    score: null, winner: '', notes: '',
  }));
}
