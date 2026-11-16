import { describe, expect, it } from 'vitest';
import { altAccountsFor, averageMmr, averageRank, isVisible, mmrToRank, normaliseRosters, safeDotabuffUrl, teamStrength, type Player } from './rosters';
import { divisionFor } from '../data/divisions';

const pl = (over: Partial<Player>): Player => ({ ign: 'x', steam: '', dotabuff: '', rank: '', mmr: null, position: '', isCaptain: false, ...over });

describe('normaliseRosters', () => {
  it('returns [] for junk', () => {
    expect(normaliseRosters(null)).toEqual([]);
    expect(normaliseRosters({ teams: 'no' })).toEqual([]);
  });

  it('trims, drops hidden teams and empty players, flags captain by IGN', () => {
    const teams = normaliseRosters({
      teams: [
        { id: 't1', teamName: '  FarmVille ', captain: 'ebolabear', visible: '', players: [
          { ign: 'EbolaBear', steam: 76561198000000001, rank: 'Legend', mmr: '3400', position: 1 },
          { ign: '', steam: '' },
          { ign: 'Akim', mmr: 'abc', position: '2' },
        ] },
        { teamName: 'Hidden', visible: 0, players: [{ ign: 'a' }] },
        { teamName: '', players: [] },
      ],
    });
    expect(teams).toHaveLength(1);
    expect(teams[0].teamName).toBe('FarmVille');
    expect(teams[0].players).toHaveLength(2);
    expect(teams[0].players[0]).toMatchObject({ steam: '76561198000000001', mmr: 3400, position: '1', isCaptain: true });
    expect(teams[0].players[1].mmr).toBeNull();
  });

  it('honours the isCaptain flag over the captain name', () => {
    const [t] = normaliseRosters({ teams: [{ teamName: 'A', captain: 'b', players: [{ ign: 'a', isCaptain: true }, { ign: 'b' }] }] });
    expect(t.players.map((p) => p.isCaptain)).toEqual([true, false]);
  });
});

describe('isVisible / safeDotabuffUrl', () => {
  it('visible flag', () => {
    expect(isVisible('')).toBe(true);
    expect(isVisible(undefined)).toBe(true);
    expect(isVisible(1)).toBe(true);
    expect(isVisible('0')).toBe(false);
    expect(isVisible('no')).toBe(false);
  });
  it('only passes real dotabuff player links', () => {
    expect(safeDotabuffUrl('javascript:alert(1)', '')).toBe('');
    expect(safeDotabuffUrl('https://evil.example/players/1', '76561198000000001')).toBe('https://www.dotabuff.com/players/76561198000000001');
    expect(safeDotabuffUrl('https://www.dotabuff.com/players/123', '')).toBe('https://www.dotabuff.com/players/123');
  });
});

describe('strength', () => {
  it('averages real MMR and ignores missing', () => {
    expect(averageMmr([pl({ mmr: 3000 }), pl({ mmr: 4000 }), pl({ mmr: null })])).toBe(3500);
    expect(averageMmr([pl({})])).toBeNull();
  });
  it('rank fallback uses band midpoints', () => {
    expect(averageRank([pl({ rank: 'Legend' }), pl({ rank: 'Archon' })])?.label).toBe('Legend');
    expect(averageRank([pl({ rank: 'Immortal' })])?.label).toBe('Divine');
    expect(averageRank([pl({ rank: '??' })])).toBeNull();
  });
  it('prefers MMR, labels the fallback as Avg Rank', () => {
    expect(teamStrength([pl({ mmr: 3001 }), pl({ mmr: 4000, rank: 'Herald' })])).toMatchObject({ kind: 'mmr', mmr: 3501 });
    expect(teamStrength([pl({ rank: 'Herald' })])).toMatchObject({ kind: 'rank', label: 'Avg Rank Herald' });
    expect(teamStrength([pl({})])).toBeNull();
  });
  it('mmrToRank bounds', () => {
    expect(mmrToRank(0)).toBeNull();
    expect(mmrToRank(1)?.label).toBe('Herald');
    expect(mmrToRank(770)?.label).toBe('Guardian');
    expect(mmrToRank(9000)?.label).toBe('Immortal');
  });
});

describe('alt accounts + divisions', () => {
  it('dedupes alt links across ids', () => {
    expect(altAccountsFor('713653325', '76561198673919053')).toHaveLength(1);
    expect(altAccountsFor('nope', null)).toEqual([]);
  });
  it('divisionFor uses seed then overrides', () => {
    expect(divisionFor('FarmVille')).toBe('lower');
    expect(divisionFor('crepe STACK')).toBe('upper');
    expect(divisionFor('FarmVille', { farmville: 'mid' })).toBe('mid');
    expect(divisionFor('Unknown Team')).toBeNull();
  });
});
