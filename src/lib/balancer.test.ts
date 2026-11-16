import { describe, expect, it } from 'vitest';
import {
  avgMmr, balanceSummary, buildTeams, copyText, coverageText, positionBadgeLabel, positionLabel,
  rankKey, seedStarterPlayers, validatePlayers, type PlayerInput,
} from './balancer';

const mk = (id: number, rank: string, pos1 = '', pos2 = ''): PlayerInput => ({ id, name: `P${id}`, rank, pos1, pos2 });
const opts = { mmr: true, pos: true, variance: false };

describe('buildTeams', () => {
  const ten = ['Immortal 8k+', 'Immortal 7k', 'Immortal 6k', 'Divine', 'Ancient', 'Legend', 'Archon', 'Crusader', 'Guardian', 'Herald']
    .map((r, i) => mk(i + 1, r));

  it('splits 10 players into two teams of 5 with no one lost or duplicated', () => {
    const { teamA, teamB } = buildTeams(ten, opts);
    expect(teamA).toHaveLength(5);
    expect(teamB).toHaveLength(5);
    expect([...teamA, ...teamB].map((p) => p.id).sort((a, b) => a - b)).toEqual(ten.map((p) => p.id));
  });

  it('keeps the average MMR gap small for a spread of ranks', () => {
    const { teamA, teamB } = buildTeams(ten, opts);
    expect(Math.abs(avgMmr(teamA) - avgMmr(teamB))).toBeLessThan(1500);
    expect(balanceSummary(teamA, teamB).score).toBeGreaterThan(25);
  });

  it('gives team A the extra player when the count is odd', () => {
    const { teamA, teamB } = buildTeams(ten.slice(0, 7), opts);
    expect([teamA.length, teamB.length]).toEqual([4, 3]);
  });

  it('splits an even count evenly (the page caps the pool at 10)', () => {
    const { teamA, teamB } = buildTeams(ten.slice(0, 6), opts);
    expect([teamA.length, teamB.length]).toEqual([3, 3]);
  });

  it('is deterministic without variance, whatever the rng', () => {
    const a = buildTeams(ten, opts, () => 0.99).parsed;
    const b = buildTeams(ten, opts, () => 0.01).parsed;
    expect(a).toEqual(b);
    expect(a.reasoning).toBe('Balanced using MMR.');
  });

  it('variance shuffles within buckets of four and says so', () => {
    const r = buildTeams(ten, { ...opts, variance: true }, () => 0);
    expect(r.parsed.reasoning).toBe('Balanced using MMR with slight variance.');
    expect(r.teamA.length + r.teamB.length).toBe(10);
  });

  it('spreads duplicate primary positions across teams when pos is on', () => {
    const four = ['Divine', 'Divine', 'Divine', 'Divine'].map((r, i) => mk(i + 1, r, '1'));
    const { teamA, teamB } = buildTeams(four, opts);
    expect([teamA.length, teamB.length]).toEqual([2, 2]);
  });

  it('treats unknown ranks as 400 MMR and does not mutate input', () => {
    const input = [mk(1, 'Nope'), mk(2, 'OP')];
    const { teamA, teamB } = buildTeams(input, opts);
    expect(teamA[0].mmr).toBe(10000);
    expect(teamB[0].mmr).toBe(400);
    expect(input[0]).not.toHaveProperty('mmr');
  });
});

describe('summary and labels', () => {
  const t = (m: number) => [{ ...mk(1, 'Herald'), mmr: m }];
  it('scores equal teams 100 and a 2000 gap 0', () => {
    expect(balanceSummary(t(3000), t(3000)).score).toBe(100);
    expect(balanceSummary(t(5000), t(3000)).score).toBe(0);
    expect(balanceSummary(t(3000), t(3000)).desc).toBe('Perfectly balanced.');
  });
  it('clamps the needle', () => {
    expect(balanceSummary(t(10000), t(0)).needlePct).toBe(95);
  });
  it('formats positions', () => {
    expect(positionLabel('1', 'fill')).toBe('Pos 1 / Fill');
    expect(positionLabel('', '')).toBe('Flex');
    expect(positionBadgeLabel('2', '3')).toBe('2/3');
    expect(positionBadgeLabel('', '')).toBe('?');
  });
  it('reports role coverage', () => {
    expect(coverageText([mk(1, 'Herald', '1', '2'), mk(2, 'Herald', 'fill', '')]))
      .toBe('Roles: 1, 2 ✓ · Missing: 3, 4, 5 · +1 Fill');
  });
  it('maps ranks to colour keys', () => {
    expect(rankKey('Immortal 7k')).toBe('immortal');
    expect(rankKey('OP')).toBe('op');
    expect(rankKey('???')).toBe('immortal');
  });
  it('builds the Discord copy text', () => {
    expect(copyText(['a'], ['b'], 'r')).toBe('⚔️ SecretLeague Draft ⚔️\n\n🌿 Radiant:\n  1. a\n\n🔥 Dire:\n  1. b\n\nr');
  });
});

describe('validate and seed', () => {
  it('validates in legacy order', () => {
    expect(validatePlayers([mk(1, 'OP')])).toMatch(/at least 2/);
    expect(validatePlayers([mk(1, 'OP'), { ...mk(2, 'OP'), name: ' ' }])).toMatch(/names/);
    expect(validatePlayers([mk(1, 'OP'), mk(2, '')])).toMatch(/rank/);
    expect(validatePlayers([mk(1, 'OP'), mk(2, 'OP')])).toBeNull();
  });
  it('seeds 10 unique starters, secondary never equals primary', () => {
    const s = seedStarterPlayers();
    expect(s).toHaveLength(10);
    expect(new Set(s.map((p) => p.name)).size).toBe(10);
    s.forEach((p) => expect(p.pos2 === '' || p.pos2 !== p.pos1).toBe(true));
  });
});
