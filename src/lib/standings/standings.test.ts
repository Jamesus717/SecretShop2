import { seriesResults, parseSchedule } from '../playoffs';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { logoKey } from '../teamlogo';
import { ALIAS_BY_KEY, displayName, seededDivision } from './aliases';
import { buildTeams } from './buildTeams';
import { deriveStandings, type RawStandings } from './derive';
import { buildHeroList, trendingHeroes } from './heroes';
import { PLAYOFFS_FIRST_MATCH_ID, isGroupStageSeries, isPlayoffSeries, rebuildFromBundle } from './series';
import { computePlayoffStats } from './playoffs';
import { groupByDivision, sortedKeys, tiebreakNotes, winRate } from './records';
import type { SeriesData, Team } from './types';

const fixture = (n: string) => JSON.parse(readFileSync(`mock-data/imprint-${n}.json`, 'utf8')).data;
const bundle: SeriesData[] = fixture('series-bundle').series;

function fromMock(): ReturnType<typeof deriveStandings> & { raw: RawStandings } {
  const r = rebuildFromBundle(bundle);
  const raw: RawStandings = {
    imprintTeams: fixture('teams').teams, imprintPlayers: fixture('players').players, heroesPayload: fixture('heroes'),
    computedTeams: r.computedTeams, computedPlayers: r.computedPlayers, computedHeroes: r.computedHeroes,
    playoffSeries: r.playoffSeries, divisionOverrides: {}, forfeits: [], logos: new Map(), playerNames: new Map(),
    lastSyncedAt: null, mock: true,
  };
  return { ...deriveStandings(raw), raw };
}

const team = (key: string, name: string, wins: number, ties: number, losses: number, h2h: Team['h2h'] = {}): Team => ({
  key, id: key, name, logo: null, logoUrl: null, registeredRoster: [], wins, ties, losses, matchCount: 0,
  statsSynced: true, rating: null, ratingLabel: null, forfeitWins: 0, forfeitLosses: 0, roster: {}, h2h,
  division: 'upper', statsGap: 0, statsIncomplete: false,
});

describe('aliases', () => {
  it('resolves drifted Imprint names to the registered name', () => {
    expect(displayName(logoKey('#DOTA_BadGuys'), '#DOTA_BadGuys')).toBe('Imprint Esports');
    expect(displayName(logoKey('Truers Official'), 'Truers Official')).toBe('The Truers');
    expect(displayName(logoKey('Bortymites'), 'Bortymites')).toBe('The Bortymites');
    expect(ALIAS_BY_KEY[logoKey('#DOTA_BadGuys')]).toBe('imprintesports');
  });
  it('normalises case and accents via logoKey', () => {
    expect(displayName(logoKey('CATWICE'), 'CATWICE')).toBe('Catwice');
    expect(displayName(logoKey('Crepe stack'), 'x')).toBe('Crêpe stack');
  });
  it('seeds divisions, following aliases', () => {
    expect(seededDivision(logoKey('Midlands Massive'))).toBe('upper');
    expect(seededDivision(logoKey('Truers Official'))).toBe('mid');
    expect(seededDivision(logoKey('Catwice'))).toBe('lower');
    expect(seededDivision('nobody')).toBeNull();
  });
});

describe('ranking', () => {
  it('orders by win rate, counting a tie as half a win', () => {
    expect(winRate({ wins: 4, ties: 0, losses: 2 })).toBeCloseTo(2 / 3);
    expect(winRate({ wins: 1, ties: 2, losses: 0 })).toBeCloseTo(2 / 3);
    const teams = new Map([
      ['a', team('a', 'A', 5, 0, 3)], // 62.5%
      ['b', team('b', 'B', 4, 0, 2)], // 66.7%
    ]);
    expect(sortedKeys(teams)).toEqual(['b', 'a']);
  });
  it('breaks a rate tie by head-to-head, then wins, then name', () => {
    const a = team('a', 'A', 2, 0, 2, { b: { wins: 0, ties: 0, losses: 1 } });
    const b = team('b', 'B', 2, 0, 2, { a: { wins: 1, ties: 0, losses: 0 } });
    const m = new Map([['a', a], ['b', b]]);
    expect(sortedKeys(m)).toEqual(['b', 'a']);
    expect(tiebreakNotes(m, ['b', 'a']).get('b')).toContain('ahead of A');
    const c = team('c', 'Cee', 1, 0, 1), d = team('d', 'Dee', 1, 0, 1);
    expect(sortedKeys(new Map([['d', d], ['c', c]]))).toEqual(['c', 'd']);
  });
  it('ranks the mock league consistently within each division', () => {
    const { teams } = fromMock();
    const groups = groupByDivision(teams, sortedKeys(teams));
    for (const keys of Object.values(groups)) {
      const rates = keys.map((k) => winRate(teams.get(k)!));
      expect(rates).toEqual([...rates].sort((x, y) => y - x));
    }
    expect(groups.unassigned).toEqual([]);
    expect(teams.get(groups.lower[0])!.name).toBe('FarmVille');
    expect(groups.upper[0]).toBe(logoKey('N-stitution'));
  });
});

describe('group vs playoff split by match id', () => {
  it('classifies series by the first-playoff-game cutoff', () => {
    const mk = (id: number, sid = 1): SeriesData => ({ series_id: sid, matches: [{ match_id: id }] });
    expect(isGroupStageSeries(mk(PLAYOFFS_FIRST_MATCH_ID - 1))).toBe(true);
    expect(isPlayoffSeries(mk(PLAYOFFS_FIRST_MATCH_ID - 1))).toBe(false);
    expect(isPlayoffSeries(mk(PLAYOFFS_FIRST_MATCH_ID))).toBe(true);
    expect(isPlayoffSeries(mk(PLAYOFFS_FIRST_MATCH_ID, 0))).toBe(false); // series_id 0 is never a series
    expect(isGroupStageSeries({ series_id: 2, matches: [{ match_id: 1 }, { match_id: PLAYOFFS_FIRST_MATCH_ID }] })).toBe(false);
  });
  it('keeps playoff games out of group-stage records', () => {
    const r = rebuildFromBundle(bundle);
    const playoffIds = Object.values(r.playoffSeries).flatMap((s) => s.matches!.map((m) => m.match_id));
    expect(playoffIds.length).toBeGreaterThan(0);
    expect(playoffIds.every((id) => id >= PLAYOFFS_FIRST_MATCH_ID)).toBe(true);
    const groupGames = bundle.filter(isGroupStageSeries).reduce((n, s) => n + s.matches!.length, 0);
    const heroPicks = Object.values(r.computedHeroes.heroes).reduce((n, h) => n + h.picks, 0);
    expect(heroPicks).toBe(groupGames * 10);
  });
  it('sums playoff series from raw games and decides at two game wins', () => {
    const { playoff, raw } = fromMock();
    const po = computePlayoffStats(raw.playoffSeries);
    expect(po.gameCount).toBe(8);
    expect(playoff.seriesCount).toBe(po.seriesCount);
    const byName = Object.fromEntries([...playoff.teams.values()].map((T) => [T.name, T]));
    expect(byName['Money Talks'].wins).toBe(3);
    expect(byName['Money Talks'].losses).toBe(0);
    expect([...playoff.teams.values()].every((T) => T.ties === 0)).toBe(true);
  });
  it('replaces game-derived records with sheet results when given', () => {
    const { raw } = fromMock();
    const d = deriveStandings({ ...raw, playoffResults: [{ winner: 'Money Talks', loser: 'Truers Official' }] });
    const mt = [...d.playoff.teams.values()].find((T) => T.name === 'Money Talks')!;
    expect(mt.wins).toBe(1);
    expect(d.playoff.seriesCount).toBe(1);
  });
});

describe('sheet playoff results', () => {
  it('turns sheet rows (incl. a forfeit with no score) into series results', () => {
    const H = 'Division,Week,Date of Game,Time,#,Elimination?,Caster Name,Analyst Name,Observer,Format,Team 1 Name,Team 2 Name,Score,Winner,Stream Link,Notes';
    const csv = [
      H,
      'Upper,1,14/09/2026,19:00,1,,,,,Bo3,Alpha,Beta,2-0,Alpha,,',
      'Upper,1,15/09/2026,19:00,2,,,,,Bo3,Gamma,Delta,,Gamma,,forfeit',
    ].join('
');
    const res = seriesResults(parseSchedule(csv));
    expect(res).toEqual([{ winner: 'Alpha', loser: 'Beta' }, { winner: 'Gamma', loser: 'Delta' }]);
  });
});

describe('buildTeams', () => {
  it('uses the registered name for aliased Imprint teams and folds forfeits on top', () => {
    const { raw } = fromMock();
    const base = buildTeams(raw.imprintTeams, raw.imprintPlayers, raw.computedTeams, raw.computedPlayers, {}, [], new Map());
    const truers = base.get(logoKey('Truers Official'))!;
    expect(truers.name).toBe('The Truers');
    expect(truers.division).toBe('mid');
    const forfeit = { id: '1', winner_key: truers.key, winner_name: 'The Truers', loser_key: 'catwice', loser_name: 'Catwice' };
    const after = buildTeams(raw.imprintTeams, raw.imprintPlayers, raw.computedTeams, raw.computedPlayers, {}, [forfeit], new Map());
    expect(after.get(truers.key)!.wins).toBe(truers.wins + 1);
    expect(after.get('catwice')!.losses).toBe(base.get('catwice')!.losses + 1);
    expect(after.get(truers.key)!.forfeitWins).toBe(1);
  });
  it('division overrides win over the seed', () => {
    const { raw } = fromMock();
    const t = buildTeams(raw.imprintTeams, raw.imprintPlayers, raw.computedTeams, raw.computedPlayers, { catwice: 'upper' }, [], new Map());
    expect(t.get('catwice')!.division).toBe('upper');
  });
  it('marks at most one core player per position', () => {
    const { teams } = fromMock();
    for (const T of teams.values()) {
      for (const pos of [1, 2, 3, 4, 5]) {
        expect((T.roster[pos] || []).filter((p) => p.isCore).length).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('heroes', () => {
  it('adds playoff games onto the group-stage hero totals', () => {
    const { heroes, playoff } = fromMock();
    const picks = heroes.reduce((n, h) => n + h.picks, 0);
    const groupGames = bundle.filter(isGroupStageSeries).reduce((n, s) => n + s.matches!.length, 0);
    expect(picks).toBe((groupGames + playoff.gameCount) * 10);
    expect(heroes.every((h) => h.wr >= 0 && h.wr <= 100)).toBe(true);
  });
  it('falls back to Imprint /heroes when computed_heroes is incomplete', () => {
    const h = buildHeroList(fixture('heroes'), { complete: false }, []);
    expect(h.length).toBeGreaterThan(0);
    const { trending, struggling } = trendingHeroes(h);
    expect(trending.every((x) => x.wr >= 60 && x.picks >= 2)).toBe(true);
    expect(struggling.every((x) => x.wr <= 40 && x.picks >= 2)).toBe(true);
  });
});
