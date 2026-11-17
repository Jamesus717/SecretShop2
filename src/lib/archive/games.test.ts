import { describe, expect, it } from 'vitest';
import { createSchedule, fallbackRows, type MatchRow } from '../playoffs';
import { SCHEDULE } from '../../pages/GroupStage/schedule';
import { SECRETLEAGUE_I } from '../../data/champions';
import {
  NO_FILTER, buildGames, filterGames, gameNumbers, groupByRound, groupGames, playoffGames, teamNames, winnerOf,
} from './games';

const names = SECRETLEAGUE_I.divisions.flatMap((d) => [d.champion.name, d.runnerUp.name, d.third]);
// The offline seed has no results, so give a few rows scores to exercise the result paths.
const rows: MatchRow[] = fallbackRows().map((r) => ({ ...r }));
const upper = (n: number) => rows.find((r) => r.div === 'upper' && r.n === n)!;
Object.assign(upper(1), { score: [0, 2], winner: 'Midlands Massive', stream: 'https://www.twitch.tv/videos/1 javascript:alert(1)' });
Object.assign(upper(8), { week: 6, score: [2, 1], winner: 'N-stitution' });
const playoffs = createSchedule(rows, names);

describe('winnerOf', () => {
  it('reads a score', () => {
    expect(winnerOf([2, 0])).toBe('a');
    expect(winnerOf([0, 2])).toBe('b');
    expect(winnerOf([1, 1])).toBe('tie');
    expect(winnerOf(null)).toBeNull();
  });
});

describe('groupGames', () => {
  const games = groupGames(SCHEDULE);
  it('lists every fixture once with unique ids', () => {
    expect(new Set(games.map((g) => g.id)).size).toBe(games.length);
    expect(games.length).toBeGreaterThan(50);
  });
  it('carries score, forfeit, cast and time overrides', () => {
    const g = games.find((x) => x.n === 62);
    expect(g).toMatchObject({ div: 'upper', score: [2, 0], winner: 'a', forfeit: true, stage: 'group' });
    expect(games.find((x) => x.n === 3)?.cast).toBe(true);
    expect(games.find((x) => x.n === 17)?.time).toBe('19:30');
  });
});

describe('playoffGames', () => {
  const games = playoffGames(playoffs);
  it('keeps the score in a/b order and marks the grand final', () => {
    for (const g of games.filter((x) => x.score)) {
      const [x, y] = g.score!;
      expect(g.winner === 'a' ? x > y : y > x).toBe(true);
    }
    const gf = games.find((g) => g.div === 'upper' && g.grandFinal)!;
    expect(gf.round).toBe('Grand Final');
    expect(gf.n).toBe(8);
  });
  it('reads results, and only keeps http(s) stream links', () => {
    const g = games.find((x) => x.id === 'p-upper-1')!;
    expect(g.score).toEqual([0, 2]);
    expect(g.winner).toBe('b');
    expect(g.streams).toEqual(['https://www.twitch.tv/videos/1']);
  });
  it('leaves undecided series without a score and shows placeholders', () => {
    const g = games.find((x) => x.id === 'p-upper-4')!;
    expect(g.score).toBeNull();
    expect(g.winner).toBeNull();
    expect(g.a).toBe('Winner of #2');
  });
});

describe('buildGames / filters', () => {
  const all = buildGames(SCHEDULE, playoffs);
  it('puts playoffs first, then group stage, oldest first', () => {
    const firstGroup = all.findIndex((g) => g.stage === 'group');
    expect(all.slice(0, firstGroup).every((g) => g.stage === 'playoffs')).toBe(true);
    const groupDates = all.slice(firstGroup).map((g) => g.date ?? '');
    expect([...groupDates].sort()).toEqual(groupDates);
  });
  it('filters by division, stage and team', () => {
    expect(filterGames(all, { ...NO_FILTER, div: 'lower' }).every((g) => g.div === 'lower')).toBe(true);
    expect(filterGames(all, { ...NO_FILTER, stage: 'group' }).every((g) => g.stage === 'group')).toBe(true);
    const fv = filterGames(all, { ...NO_FILTER, team: 'FarmVille' });
    expect(fv.length).toBeGreaterThan(3);
    expect(fv.every((g) => g.a === 'FarmVille' || g.b === 'FarmVille')).toBe(true);
    expect(filterGames(all, NO_FILTER)).toHaveLength(all.length);
  });
  it('lists team names without bracket placeholders', () => {
    const t = teamNames(all);
    expect(t).toContain('N-stitution');
    expect(t.some((n) => /^Winner of/.test(n))).toBe(false);
  });
  it('groups consecutive games by round', () => {
    const rounds = groupByRound(all);
    expect(rounds.reduce((n, r) => n + r.games.length, 0)).toBe(all.length);
    expect(rounds.some((r) => r.round === 'Grand Final')).toBe(true);
    expect(rounds[0].stage).toBe('playoffs');
  });
  it('counts numbers', () => {
    const n = gameNumbers(all);
    expect(n.played).toBe(n.groupPlayed + n.playoffSeries);
    expect(n.forfeits).toBeGreaterThan(0);
  });
});
