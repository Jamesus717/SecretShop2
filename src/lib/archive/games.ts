import type { Day, DivKey } from '../../pages/GroupStage/schedule';
import { matchOpts } from '../../pages/GroupStage/schedule';
import { fmtDate, streamLinks, type Schedule } from '../playoffs';

export type Stage = 'group' | 'playoffs';

/** One game (a Bo2 group match or a playoff series) in a shape the archive can render. */
export interface ArchiveGame {
  id: string;
  stage: Stage;
  div: DivKey;
  /** League match number (group) or sheet match number (playoffs). */
  n: number | null;
  /** YYYY-MM-DD, or null when the sheet had no date. */
  date: string | null;
  time: string | null;
  a: string;
  b: string;
  /** Games won by a and b. null = no result recorded. */
  score: [number, number] | null;
  /** 'tie' only happens in the group stage (1-1). */
  winner: 'a' | 'b' | 'tie' | null;
  forfeit: boolean;
  cast: boolean;
  grandFinal: boolean;
  /** "Week 2", "Grand Final" ... */
  round: string;
  week: number | null;
  /** http(s) VOD / stream links only. */
  streams: string[];
}

export function winnerOf(score: [number, number] | null): ArchiveGame['winner'] {
  if (!score) return null;
  if (score[0] === score[1]) return 'tie';
  return score[0] > score[1] ? 'a' : 'b';
}

/** Group-stage fixtures from the static schedule. Unplayed fixtures keep score = null. */
export function groupGames(days: Day[]): ArchiveGame[] {
  const out: ArchiveGame[] = [];
  for (const day of days) {
    for (const key of ['upper', 'mid', 'lower'] as const) {
      for (const m of day.divisions[key] ?? []) {
        const [n, a, b] = m;
        const o = matchOpts(m);
        const score = Array.isArray(o.score) ? o.score : null;
        out.push({
          id: `g-${n}`, stage: 'group', div: key, n, date: day.date, time: o.time ?? day.time ?? null,
          a, b, score, winner: winnerOf(score), forfeit: !!o.forfeit, cast: !!o.cast, grandFinal: false,
          round: `Week ${day.week}`, week: day.week, streams: [],
        });
      }
    }
  }
  return out;
}

/** Playoff series from the sheet schedule. Score is in a/b order, not winner-first. */
export function playoffGames(s: Schedule): ArchiveGame[] {
  return s.matches().map((m) => {
    const res = s.matchResult(m);
    let score: [number, number] | null = null;
    if (res?.score) score = res.winnerSide === 'a' ? res.score : [res.score[1], res.score[0]];
    const gf = s.isGrandFinal(m);
    return {
      id: `p-${m.div}-${m.n}`, stage: 'playoffs' as const, div: m.div, n: m.n, date: m.date, time: m.time,
      a: s.slotText(m.a, m.div), b: s.slotText(m.b, m.div),
      score, winner: res ? res.winnerSide : null, forfeit: false, cast: m.stream.trim() !== '', grandFinal: gf,
      round: gf ? 'Grand Final' : m.week != null ? `Week ${m.week}` : 'To be confirmed', week: m.week,
      streams: streamLinks(m.stream),
    };
  });
}

const STAGE_ORDER: Record<Stage, number> = { playoffs: 0, group: 1 };
const DIV_ORDER: Record<DivKey, number> = { upper: 0, mid: 1, lower: 2 };

/** Playoffs first, then group stage; each oldest to newest, then division, then match number. */
export function sortGames(games: ArchiveGame[]): ArchiveGame[] {
  return [...games].sort((x, y) =>
    STAGE_ORDER[x.stage] - STAGE_ORDER[y.stage]
    || (x.date ?? '9999').localeCompare(y.date ?? '9999')
    || DIV_ORDER[x.div] - DIV_ORDER[y.div]
    || (x.n ?? 0) - (y.n ?? 0));
}

/** The recorded final of a division (see data/champions.ts). */
export interface KnownFinal { key: DivKey; champion: string; score: string }

/**
 * The live sheet sometimes lacks a grand-final result. Fill a missing one from the verified champion
 * data (score is "2-1", champion's games first). Games that already have a result are left alone.
 */
export function fillKnownFinals(games: ArchiveGame[], finals: KnownFinal[]): ArchiveGame[] {
  return games.map((g) => {
    if (!g.grandFinal || g.score) return g;
    const f = finals.find((x) => x.key === g.div);
    const m = f?.score.match(/^(\d+)\D+(\d+)$/);
    if (!f || !m) return g;
    const side = g.a === f.champion ? 'a' : g.b === f.champion ? 'b' : null;
    if (!side) return g;
    const w = Number(m[1]), l = Number(m[2]);
    return { ...g, score: side === 'a' ? [w, l] : [l, w], winner: side };
  });
}

export function buildGames(days: Day[], playoffs: Schedule, finals: KnownFinal[] = []): ArchiveGame[] {
  return sortGames(fillKnownFinals([...groupGames(days), ...playoffGames(playoffs)], finals));
}

export interface GameFilter { div: DivKey | 'all'; stage: Stage | 'all'; team: string }

export const NO_FILTER: GameFilter = { div: 'all', stage: 'all', team: '' };

export function filterGames(games: ArchiveGame[], f: GameFilter): ArchiveGame[] {
  return games.filter((g) =>
    (f.div === 'all' || g.div === f.div)
    && (f.stage === 'all' || g.stage === f.stage)
    && (!f.team || g.a === f.team || g.b === f.team));
}

/** Sorted, de-duplicated team names across a game list (placeholders like "Winner of #4" excluded). */
export function teamNames(games: ArchiveGame[]): string[] {
  const set = new Set<string>();
  for (const g of games) for (const t of [g.a, g.b]) if (!/^(Winner|Loser) of #|^TBD$/.test(t)) set.add(t);
  return [...set].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' }));
}

/** Consecutive games sharing a round, in list order, for section headings. */
export function groupByRound(games: ArchiveGame[]): { key: string; stage: Stage; round: string; games: ArchiveGame[] }[] {
  const out: { key: string; stage: Stage; round: string; games: ArchiveGame[] }[] = [];
  for (const g of games) {
    const key = `${g.stage}|${g.round}`;
    const last = out[out.length - 1];
    if (last && last.key === key) last.games.push(g);
    else out.push({ key, stage: g.stage, round: g.round, games: [g] });
  }
  return out;
}

export interface GameNumbers { played: number; groupPlayed: number; playoffSeries: number; casts: number; forfeits: number; withVod: number }

export function gameNumbers(games: ArchiveGame[]): GameNumbers {
  const played = games.filter((g) => g.score);
  return {
    played: played.length,
    groupPlayed: played.filter((g) => g.stage === 'group').length,
    playoffSeries: played.filter((g) => g.stage === 'playoffs').length,
    casts: games.filter((g) => g.cast).length,
    forfeits: games.filter((g) => g.forfeit).length,
    withVod: games.filter((g) => g.streams.length).length,
  };
}

export function gameDate(g: Pick<ArchiveGame, 'date'>): string {
  return fmtDate(g.date);
}
