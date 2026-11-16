import { describe, expect, it } from 'vitest';
import {
  emptySolo, emptyTeam, parseDraft, parseMmr, sanitizeSteam, serialiseDraft, sortAvailability, soloRow, teamRow,
  teamSheetPayload, validatePlayer, validateSolo, validateTeam, availabilityLabel, stepOfError,
  type TeamForm,
} from './registration';

const STEAM = '76561198000000001';
const goodTeam = (): TeamForm => {
  const t = emptyTeam();
  t.name = 'FarmVille';
  t.players = t.players.map((_, i) => ({ ign: `P${i + 1}`, steam: STEAM, discord: i === 0 ? 'cap#1' : '', mmr: String(3000 + i * 100), pos: String(i + 1) }));
  return t;
};

describe('basic helpers', () => {
  it('parseMmr accepts whole numbers 1..15000', () => {
    expect(parseMmr('3400')).toBe(3400);
    expect(parseMmr(' 1 ')).toBe(1);
    expect(parseMmr('0')).toBeNull();
    expect(parseMmr('15001')).toBeNull();
    expect(parseMmr('34.5')).toBeNull();
    expect(parseMmr('abc')).toBeNull();
  });
  it('sanitizeSteam strips non digits and caps at 17', () => {
    expect(sanitizeSteam('7656 1198-00000001999')).toBe('76561198000000019');
  });
  it('availability sorts by day then slot', () => {
    const l = [availabilityLabel(2, 0), availabilityLabel(0, 2), availabilityLabel(0, 0)];
    expect(sortAvailability(l)).toEqual(['Mon: Morning', 'Mon: Evening', 'Wed: Morning']);
  });
});

describe('solo validation', () => {
  it('flags everything on an empty form', () => {
    const e = validateSolo(emptySolo(), []);
    expect(Object.keys(e).sort()).toEqual(['availability', 'ign', 'mmr', 'positions', 'steam']);
  });
  it('passes a complete form (discord optional)', () => {
    const s = { ...emptySolo(), ign: 'a', steam: STEAM, mmr: '4000', positions: ['1', '4'] };
    expect(validateSolo(s, ['Mon: Morning'])).toEqual({});
  });
});

describe('team validation', () => {
  it('passes a complete team and needs only the captain discord', () => {
    expect(validateTeam(goodTeam(), true, ['Mon: Morning'])).toEqual({});
  });
  it('requires logo, availability, name', () => {
    const t = goodTeam(); t.name = ' ';
    expect(Object.keys(validateTeam(t, false, [])).sort()).toEqual(['availability', 'logo', 'name']);
  });
  it('moves the discord requirement with the captain', () => {
    const t = goodTeam(); t.captain = 3;
    const e = validateTeam(t, true, ['x']);
    expect(Object.keys(e).sort()).toEqual(['p3.discord']);
    expect(stepOfError('p3.discord')).toBe(3);
    expect(stepOfError('name')).toBe(0);
  });
  it('validatePlayer keys by slot', () => {
    expect(Object.keys(validatePlayer({ ign: '', steam: '1', discord: '', mmr: '', pos: '' }, 1, 1)).sort())
      .toEqual(['p2.ign', 'p2.mmr', 'p2.pos', 'p2.steam']);
  });
});

describe('payloads', () => {
  it('teamRow averages MMR and keeps captain info', () => {
    const r = teamRow(goodTeam(), 'uid', 'https://x/logo.webp');
    expect(r).toMatchObject({ team_name: 'FarmVille', captain_ign: 'P1', captain_discord: 'cap#1', captain_user_id: 'uid', avg_mmr: 3200 });
    expect(r.players).toHaveLength(5);
    expect(r.players[0]).toMatchObject({ steam_id: STEAM, rank: 'Archon', mmr: 3000, primary_position: 1 });
  });
  it('soloRow uses the first pick as primary', () => {
    const r = soloRow({ ...emptySolo(), ign: 'a', steam: STEAM, mmr: '5000', positions: ['3', '1'] });
    expect(r).toMatchObject({ primary_position: 3, rank: 'Divine', discord_username: null });
  });
  it('sheet payload matches the Apps Script field names', () => {
    const p = teamSheetPayload(goodTeam(), ['Mon: Morning'], 'u', 'ts');
    expect(Object.keys(p).sort()).toEqual(['availability', 'captain', 'captainDiscord', 'captainIgn', 'logo', 'players', 'teamName', 'timestamp', 'type']);
    expect(Object.keys(p.players[0]).sort()).toEqual(['discord', 'dotabuff', 'ign', 'mmr', 'position', 'rank', 'steam']);
  });
});

describe('draft', () => {
  it('round-trips through the legacy-shaped JSON', () => {
    const team = goodTeam();
    const d = { mode: 'team' as const, solo: emptySolo(), team, logo: 'data:image/webp;base64,AAA', availability: ['Mon: Morning'] };
    const back = parseDraft(serialiseDraft(d));
    expect(back).toEqual(d);
  });
  it('reads a legacy draft and rejects junk', () => {
    const legacy = JSON.stringify({ mode: 'solo', solo: { ign: 'a', steamId: STEAM, discord: '', mmr: '3000', pos: '2' }, team: { teamName: 'T', captain: 9, players: [] }, availability: ['Tue-Evening', 'Tue: Evening'] });
    const d = parseDraft(legacy);
    expect(d?.mode).toBe('solo');
    expect(d?.solo.positions).toEqual(['2']);
    expect(d?.team.captain).toBe(1);
    expect(d?.availability).toEqual(['Tue: Evening']);
    expect(parseDraft('{nope')).toBeNull();
    expect(parseDraft(null)).toBeNull();
  });
  it('drops a non-image logo', () => {
    expect(parseDraft(JSON.stringify({ team: { logo: 'javascript:alert(1)' } }))?.logo).toBeNull();
  });
});
