export type Division = 'upper' | 'mid' | 'lower';

/** A team cell: a name, or a pointer at another match. `derived` marks links recovered by linkResults. */
export interface Slot {
  team?: string;
  winnerOf?: number;
  loserOf?: number;
  derived?: boolean;
}

export interface MatchRow {
  div: Division;
  week: number | null;
  n: number | null;
  date: string | null;
  time: string | null;
  bo: number;
  elim: boolean;
  a: Slot | null;
  b: Slot | null;
  caster: string;
  analyst: string;
  observer: string;
  stream: string;
  score: [number, number] | null;
  winner: string;
  notes: string;
}

export type MatchState = 'done' | 'live' | 'awaiting' | 'upcoming';
export type Side = 'a' | 'b';

export interface MatchResult {
  winner: string | null;
  loser: string | null;
  winnerSide: Side;
  loserSide: Side;
  /** Games, winner first. */
  score: [number, number] | null;
}

export interface UkClock {
  date: string;
  time: string;
}
