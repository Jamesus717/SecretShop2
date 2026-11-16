import { describe, expect, it } from 'vitest';
import { lazyLeagueStartDate, playoffsLive, signupsClosed, PLAYOFFS_START, SIGNUPS_CLOSE } from './config';

const t = (iso: string) => new Date(iso).getTime();

describe('playoffsLive', () => {
  it('is false before the cutover and true after', () => {
    expect(playoffsLive('', t(PLAYOFFS_START) - 1000)).toBe(false);
    expect(playoffsLive('', t(PLAYOFFS_START) + 1000)).toBe(true);
  });
  it('?phase overrides the date', () => {
    expect(playoffsLive('?phase=playoffs', 0)).toBe(true);
    expect(playoffsLive('?phase=group', t(PLAYOFFS_START) + 1e9)).toBe(false);
  });
});

describe('signupsClosed', () => {
  it('flips at the deadline', () => {
    expect(signupsClosed(t(SIGNUPS_CLOSE) - 1)).toBe(false);
    expect(signupsClosed(t(SIGNUPS_CLOSE) + 1)).toBe(true);
  });
});

describe('lazyLeagueStartDate', () => {
  it('is null while TBA', () => {
    expect(lazyLeagueStartDate()).toBeNull();
    expect(lazyLeagueStartDate(null)).toBeNull();
  });
  it('parses a real date and rejects garbage', () => {
    expect(lazyLeagueStartDate('2027-01-09T18:00:00+00:00')?.getTime()).toBe(t('2027-01-09T18:00:00Z'));
    expect(lazyLeagueStartDate('not a date')).toBeNull();
  });
});
