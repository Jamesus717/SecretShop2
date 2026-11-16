import { describe, expect, it } from 'vitest';
import { DEFAULT_TIME, SCHEDULE, dayId, matchOpts, matchesOf, totals } from './schedule';

describe('group stage schedule data', () => {
  it('has 70 matches over the three divisions, numbered 1-70 exactly once', () => {
    const nums = SCHEDULE.flatMap(matchesOf).map((m) => m[0]).sort((a, b) => a - b);
    expect(nums).toEqual(Array.from({ length: 70 }, (_, i) => i + 1));
    expect(totals().matches).toBe(70);
  });
  it('keeps match numbers inside their division block', () => {
    const inBlock = (nums: number[], lo: number, hi: number) => nums.every((n) => n >= lo && n <= hi);
    const pick = (k: 'lower' | 'mid' | 'upper') => SCHEDULE.flatMap((d) => (d.divisions[k] || []).map((m) => m[0]));
    expect(inBlock(pick('lower'), 1, 15)).toBe(true);
    expect(inBlock(pick('mid'), 16, 49)).toBe(true);
    expect(inBlock(pick('upper'), 50, 70)).toBe(true);
  });
  it('normalises the cast shorthand and object options', () => {
    expect(matchOpts([1, 'a', 'b'])).toEqual({});
    expect(matchOpts([1, 'a', 'b', 'cast'])).toEqual({ cast: true });
    expect(matchOpts([1, 'a', 'b', { score: [2, 0], forfeit: true }])).toEqual({ score: [2, 0], forfeit: true });
  });
  it('gives every day a unique anchor id and a default time', () => {
    const ids = SCHEDULE.map(dayId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('day-17-08-2026');
    expect(DEFAULT_TIME).toBe('19:00');
  });
});
