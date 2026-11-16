import { describe, expect, it, vi } from 'vitest';
import {
  canonicalHeader, createSchedule, fallbackRows, layoutBracket, loadSchedule, parseCSV, parseSchedule,
  stateAt, streamLinks, ukNow, normName,
} from './index';

// Header uses the renamed "Match #" column. "Winner of Match #1" was overwritten by
// the team name on the sheet once match 1 was played (Midland Massive won).
const CSV = [
  'Division,Week,Date of Game,Time,Match #,Elimination?,Caster Name,Analyst Name,Observer,Format,Team 1 Name,Team 2 Name,Score,Winner,Stream Link,Notes',
  'Upper ,1,15-09-2026,19:00 BST,Upper 1,No,Casty,,Obs,Bo3,Glizzy Gladiators,Midland Massive,0-2,Midland Massive,https://twitch.tv/x javascript:alert(1),"Notes, with ""quotes"""',
  'Upper,2,22-09-2026,19:00 BST,Upper 2,No,,,,Bo3,N-Sitution,Midland Massive,2-1,N-Sitution,,',
  'Upper,2,22-09-2026,19:30 BST,Upper 3,No,,,,Bo3,Slob Team,Golden Retrievers,,,,',
  'Upper,3,29-09-2026,,Upper 4,No,,,,Bo3,Winner of Match #2,Winner of match 3,,,,',
  'Upper,3,29-09-2026,,Upper 5,Yes,,,,Bo3,Loser of Match # 1,Loser of match 3,,,,',
  'Upper,6,,,Upper 8,No,,,,Bo5,Winner of match 7,Winner of match 4,,,,',
  'Nonsense,1,,,1,,,,,,A,B,,,,',
].join('\n');

describe('csv parsing', () => {
  it('handles quoted fields, escaped quotes and commas', () => {
    const rows = parseCSV('a,b\n"x, y","say ""hi"""\n');
    expect(rows[1]).toEqual(['x, y', 'say "hi"']);
  });

  it('aliases header renames', () => {
    expect(canonicalHeader(' Match  # ')).toBe('#');
    expect(canonicalHeader('caster name')).toBe('Caster Name');
  });

  it('parses rows, dropping unknown divisions', () => {
    const rows = parseSchedule(CSV);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ div: 'upper', week: 1, n: 1, date: '2026-09-15', time: '19:00', bo: 3, caster: 'Casty' });
    expect(rows[0].score).toEqual([0, 2]);
    expect(rows[0].notes).toBe('Notes, with "quotes"');
    expect(rows[3].a).toEqual({ winnerOf: 2 });
    expect(rows[4].a).toEqual({ loserOf: 1 });
    expect(rows[4].elim).toBe(true);
    expect(rows[5].bo).toBe(5);
  });

  it('throws when match numbers are missing (renamed header)', () => {
    expect(() => parseSchedule('Division,Week,Weird\nUpper,1,x')).toThrow(/match numbers/);
  });

  it('only lets http(s) stream links through', () => {
    expect(streamLinks('https://twitch.tv/x javascript:alert(1)')).toEqual(['https://twitch.tv/x']);
  });
});

describe('schedule', () => {
  const s = createSchedule(parseSchedule(CSV), ['N-stitution', 'Midlands Massive']);

  it('resolves aliases and known names', () => {
    expect(s.resolveTeamName('N-Sitution')).toBe('N-stitution');
    expect(s.resolveTeamName('Midland Massive')).toBe('Midlands Massive');
    expect(normName('Lumière!')).toBe('lumiere');
  });

  it('works out winners from the Winner column or score', () => {
    const m1 = s.findMatch('upper', 1)!;
    expect(s.matchWinner(m1)).toBe('b');
    expect(s.matchResult(m1)).toMatchObject({ winner: 'Midlands Massive', loser: 'Glizzy Gladiators', score: [2, 0] });
  });

  it('recovers "Winner of match N" links lost when the sheet was overwritten', () => {
    const m2 = s.findMatch('upper', 2)!;
    expect(m2.b).toMatchObject({ team: 'Midland Massive', winnerOf: 1, derived: true });
    expect(s.slotTeam(s.findMatch('upper', 4)!.a, 'upper')).toBe('N-stitution');
    expect(s.slotText(s.findMatch('upper', 4)!.b, 'upper')).toBe('Winner of #3');
    expect(s.slotText(s.findMatch('upper', 5)!.a, 'upper')).toBe('Glizzy Gladiators');
  });

  it('detects the grand final as the last week', () => {
    expect(s.finalRow('upper')!.n).toBe(8);
    expect(s.isGrandFinal(s.findMatch('upper', 8)!)).toBe(true);
    expect(s.isGrandFinal(s.findMatch('upper', 2)!)).toBe(false);
  });

  it('does not mutate the input rows', () => {
    const rows = parseSchedule(CSV);
    createSchedule(rows);
    expect(rows[1].b).toEqual({ team: 'Midland Massive' });
  });
});

describe('match states (UK clock)', () => {
  const m = { date: '2026-09-22', time: '19:00' };
  it('upcoming before start', () => expect(stateAt(m, false, { date: '2026-09-22', time: '18:59' })).toBe('upcoming'));
  it('live at start and for 3h', () => {
    expect(stateAt(m, false, { date: '2026-09-22', time: '19:00' })).toBe('live');
    expect(stateAt(m, false, { date: '2026-09-22', time: '22:00' })).toBe('live');
  });
  it('awaiting after 3h and on later days', () => {
    expect(stateAt(m, false, { date: '2026-09-22', time: '22:01' })).toBe('awaiting');
    expect(stateAt(m, false, { date: '2026-09-23', time: '08:00' })).toBe('awaiting');
  });
  it('done once decided; undated is upcoming; default time 19:00', () => {
    expect(stateAt(m, true, { date: '2026-09-30', time: '12:00' })).toBe('done');
    expect(stateAt({ date: null, time: null }, false, { date: '2026-09-30', time: '12:00' })).toBe('upcoming');
    expect(stateAt({ date: '2026-09-22', time: null }, false, { date: '2026-09-22', time: '19:30' })).toBe('live');
  });
  it('reads the UK clock across BST/GMT', () => {
    expect(ukNow(new Date('2026-09-22T18:00:00Z'))).toEqual({ date: '2026-09-22', time: '19:00' });
    expect(ukNow(new Date('2026-11-01T18:00:00Z'))).toEqual({ date: '2026-11-01', time: '18:00' });
  });
});

describe('bracket layout', () => {
  it('lays out the fallback upper division with the grand final in the last column', () => {
    const s = createSchedule(fallbackRows());
    const l = layoutBracket(s, 'upper');
    expect(l.nodes).toHaveLength(8);
    const gf = l.nodes.find((n) => n.section === 'final')!;
    expect(gf.match.n).toBe(8);
    expect(gf.col).toBe(l.cols - 1);
    expect(l.edges).toContainEqual({ from: 7, to: 8, section: 'elim' });
    expect(l.edges).toContainEqual({ from: 4, to: 8, section: 'winners' });
    expect(l.elimStartRow).not.toBeNull();
  });
});

describe('fallback path', () => {
  it('flags stale and returns seed rows when the fetch fails', async () => {
    const fail = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const r = await loadSchedule(fail);
    expect(r.stale).toBe(true);
    expect(r.error).toMatch(/network down/);
    expect(r.rows.length).toBe(fallbackRows().length);
  });

  it('falls back on HTTP errors and on a broken sheet', async () => {
    const http = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;
    expect((await loadSchedule(http)).stale).toBe(true);
    const junk = vi.fn().mockResolvedValue({ ok: true, text: async () => 'foo,bar\n1,2' }) as unknown as typeof fetch;
    expect((await loadSchedule(junk)).stale).toBe(true);
  });

  it('returns live rows, not stale, on success', async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, text: async () => CSV }) as unknown as typeof fetch;
    const r = await loadSchedule(ok);
    expect(r.stale).toBe(false);
    expect(r.rows).toHaveLength(6);
  });
});
