import { DIV_ORDER } from './aliases';
import type { Division, Team } from './types';

/**
 * Win rate in series units, counting a tie as half a win. Rate rather than differential
 * because divisions aren't full round robins.
 */
export function winRate(T: Pick<Team, 'wins' | 'ties' | 'losses'>): number {
  const played = T.wins + T.ties + T.losses;
  return played ? (T.wins + T.ties / 2) / played : 0;
}

/** Head-to-head between exactly these two. A pairwise tiebreak, not a total order. */
export function headToHead(A: Pick<Team, 'h2h'>, B: Pick<Team, 'key'>): number {
  const rec = A.h2h && A.h2h[B.key];
  if (!rec) return 0;
  return rec.wins - rec.losses;
}

/** A division's bracket is complete once one of its teams has place 1. */
function finished(teams: Map<string, Team>, div: Division): boolean {
  for (const T of teams.values()) if (T.division === div && T.place === 1) return true;
  return false;
}

/** Team keys ranked: win rate, then head-to-head, then wins, then games played, then name. */
export function sortedKeys(teams: Map<string, Team>): string[] {
  return [...teams.keys()].sort((a, b) => {
    const A = teams.get(a)!, B = teams.get(b)!;
    // Keep divisions apart so the placement rules below never compare across them.
    if (A.division !== B.division) return DIV_ORDER.indexOf(A.division) - DIV_ORDER.indexOf(B.division);
    // A finished bracket (playoffs view): champion, runner-up, then how far each team got.
    if (A.place || B.place) return (A.place ?? 9) - (B.place ?? 9);
    if (A.lastSeries !== B.lastSeries && finished(teams, A.division)) return (B.lastSeries ?? 0) - (A.lastSeries ?? 0);
    const rate = winRate(B) - winRate(A);
    if (Math.abs(rate) > 1e-9) return rate;
    const h2h = headToHead(B, A); // positive => B beat A => B ranks first
    if (h2h) return h2h;
    return (B.wins - A.wins)
      || ((B.wins + B.ties + B.losses) - (A.wins + A.ties + A.losses))
      || A.name.localeCompare(B.name);
  });
}

export function groupByDivision(teams: Map<string, Team>, keys: string[]): Record<Division, string[]> {
  const groups: Record<Division, string[]> = { upper: [], mid: [], lower: [], unassigned: [] };
  for (const k of keys) (groups[teams.get(k)!.division] || groups.unassigned).push(k);
  return groups;
}

/**
 * For teams level on win rate with the team ranked just above them, say who the head-to-head
 * (the first tiebreak) put ahead. team key -> note. Returns only teams where it decided the order.
 */
export function tiebreakNotes(teams: Map<string, Team>, orderedKeys: string[]): Map<string, string> {
  const notes = new Map<string, string>();
  for (let i = 1; i < orderedKeys.length; i++) {
    const above = teams.get(orderedKeys[i - 1])!, below = teams.get(orderedKeys[i])!;
    if (Math.abs(winRate(above) - winRate(below)) > 1e-9) continue;
    if (headToHead(above, below) > 0) notes.set(above.key, `Level on win rate; ahead of ${below.name} on head-to-head`);
  }
  return notes;
}
