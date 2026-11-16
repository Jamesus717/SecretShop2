import type { Schedule } from './schedule';
import type { Division, MatchRow } from './types';

export type Section = 'winners' | 'elim' | 'final';

export interface BracketNode {
  match: MatchRow;
  section: Section;
  /** Column, 0 = leftmost. The grand final is the last column. */
  col: number;
  /** Vertical position in match-rows (fractional). */
  row: number;
}

export interface BracketEdge {
  from: number; // feeding match number
  to: number;
  /** The "to" match's slot is fed by this match's winner. */
  section: Section;
}

export interface BracketLayout {
  nodes: BracketNode[];
  edges: BracketEdge[];
  cols: number;
  rows: number;
  /** Row where the elimination section starts (for a section label), or null. */
  elimStartRow: number | null;
  finalMatch: MatchRow | null;
}

interface Tree { match: MatchRow; depth: number; kids: Tree[] }

/**
 * Double-elimination layout read off the sheet's "Winner of match N" links:
 * winners tree on top, elimination tree below, grand final at the right.
 * Teams dropping in ("Loser of match N") stay as labelled slots inside the card.
 */
export function layoutBracket(s: Schedule, div: Division): BracketLayout {
  const final = s.finalRow(div);
  const pool = s.matches(div).filter((m) => m !== final);
  const byNum = new Map(pool.map((m) => [m.n as number, m]));
  const seen = new Set<number>();

  function walk(m: MatchRow, depth: number): Tree {
    seen.add(m.n as number);
    const kids: Tree[] = [];
    for (const slot of [m.a, m.b]) {
      const n = slot?.winnerOf;
      const child = n != null ? byNum.get(n) : undefined;
      if (child && !seen.has(child.n as number)) kids.push(walk(child, depth + 1));
    }
    return { match: m, depth, kids };
  }

  const pickRoot = (elim: boolean): MatchRow | null => {
    const candidates = pool.filter((m) => m.elim === elim);
    if (!candidates.length) return null;
    const viaFinal = final && [final.a, final.b].map((x) => x?.winnerOf)
      .map((n) => (n != null ? byNum.get(n) : undefined))
      .find((m) => m && m.elim === elim);
    if (viaFinal) return viaFinal;
    // Grand final not seeded yet: the last match of this kind nothing else feeds from.
    const fed = new Set(pool.flatMap((m) => [m.a?.winnerOf, m.b?.winnerOf]));
    return candidates.filter((m) => !fed.has(m.n as number)).sort((x, y) => (y.n as number) - (x.n as number))[0] ?? null;
  };

  const winRoot = pickRoot(false);
  const elimRoot = pickRoot(true);
  const winTree = winRoot ? walk(winRoot, 0) : null;
  const elimTree = elimRoot ? walk(elimRoot, 0) : null;
  // Anything unreachable (a typo in the sheet) still gets drawn, as its own root.
  const orphans = pool.filter((m) => !seen.has(m.n as number)).sort((x, y) => (x.n as number) - (y.n as number))
    .map((m) => walk(m, 0));

  const depthOf = (t: Tree | null): number => (t ? Math.max(t.depth, ...t.kids.map(depthOf)) : 0);
  const maxDepth = Math.max(depthOf(winTree), depthOf(elimTree), ...orphans.map(depthOf));

  const nodes: BracketNode[] = [];
  const edges: BracketEdge[] = [];
  let cursor = 0;

  function place(t: Tree, section: Section): number {
    const kidRows = t.kids.map((k) => place(k, section));
    const row = kidRows.length ? kidRows.reduce((a, b) => a + b, 0) / kidRows.length : cursor++;
    nodes.push({ match: t.match, section, col: maxDepth - t.depth, row });
    for (const k of t.kids) edges.push({ from: k.match.n as number, to: t.match.n as number, section });
    return row;
  }

  const winRow = winTree ? place(winTree, 'winners') : null;
  let elimStartRow: number | null = null;
  let elimRow: number | null = null;
  if (elimTree) {
    cursor += winTree ? 0.5 : 0;
    elimStartRow = cursor;
    elimRow = place(elimTree, 'elim');
  }
  for (const o of orphans) place(o, 'winners');

  let finalMatch: MatchRow | null = null;
  if (final) {
    finalMatch = final;
    const rowsFed = [winRow, elimRow].filter((r): r is number => r != null);
    const row = rowsFed.length ? rowsFed.reduce((a, b) => a + b, 0) / rowsFed.length : 0;
    nodes.push({ match: final, section: 'final', col: maxDepth + 1, row });
    for (const slot of [final.a, final.b]) {
      const child = slot?.winnerOf != null ? byNum.get(slot.winnerOf) : undefined;
      if (child) edges.push({ from: child.n as number, to: final.n as number, section: child.elim ? 'elim' : 'winners' });
    }
  }

  return {
    nodes, edges, cols: maxDepth + 2, rows: Math.max(cursor, 1), elimStartRow, finalMatch,
  };
}

/** Matches the champion played in (for dimming everything else). */
export function championMatchNumbers(s: Schedule, div: Division, champ: string | null): Set<number> {
  const out = new Set<number>();
  if (!champ) return out;
  for (const m of s.matches(div)) {
    if (s.sameTeam(s.slotTeam(m.a, div), champ) || s.sameTeam(s.slotTeam(m.b, div), champ)) out.add(m.n as number);
  }
  return out;
}
