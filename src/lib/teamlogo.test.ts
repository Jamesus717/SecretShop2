import { describe, expect, it } from 'vitest';
import { logoKey, teamImageCandidates, teamInitials } from './teamlogo';

describe('logoKey', () => {
  it('keeps letters and digits only, lowercased', () => {
    expect(logoKey('The Truers')).toBe('thetruers');
    expect(logoKey('N-stitution')).toBe('nstitution');
    expect(logoKey('  Money   Talks! ')).toBe('moneytalks');
  });
  it('strips accents', () => {
    expect(logoKey('Crêpe stack')).toBe('crepestack');
  });
  it('handles empty input', () => {
    expect(logoKey(null)).toBe('');
    expect(logoKey(undefined)).toBe('');
  });
});

describe('teamImageCandidates', () => {
  it('uses the override file for known names', () => {
    expect(teamImageCandidates('The Truers')).toEqual(['/assets/teaminfoimgs/The_Truers.webp']);
  });
  it('puts an uploaded logo first', () => {
    const map = new Map([['moneytalks', 'https://x/logo.webp']]);
    expect(teamImageCandidates('Money Talks', map)[0]).toBe('https://x/logo.webp');
  });
  it('derives underscored filenames for other teams', () => {
    const c = teamImageCandidates('Catwice');
    expect(c[0]).toBe('/assets/teaminfoimgs/Catwice.png');
    expect(teamImageCandidates('Free Bans Gang')).toContain('/assets/teaminfoimgs/Free_Bans_Gang.png');
  });
});

describe('teamInitials', () => {
  it('uses first and last word initials', () => {
    expect(teamInitials('The Truers')).toBe('TT');
    expect(teamInitials('FarmVille')).toBe('FA');
    expect(teamInitials('N-stitution')).toBe('NS');
  });
  it('falls back to ?', () => {
    expect(teamInitials('!!!')).toBe('?');
  });
});
