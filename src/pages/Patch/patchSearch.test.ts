import { describe, expect, it } from 'vitest';
import { getPatch } from '../../data/patches';
import { filterLines, normQuery, splitMatches, tabCounts, viewHero } from './patchSearch';

const patch = getPatch('7.42')!;

describe('patch search', () => {
  it('finds Blink in items', () => {
    expect(tabCounts(patch, normQuery('Blink')).items).toBeGreaterThan(0);
  });
  it('finds Medusa in heroes', () => {
    const c = tabCounts(patch, normQuery(' Medusa '));
    expect(c.heroes).toBeGreaterThan(0);
    const m = patch.heroes.find((h) => h.name === 'Medusa')!;
    expect(viewHero(m, 'medusa')?.abilities.length).toBe(m.abilities.filter((a) => a.lines.length).length);
  });
  it('empty query keeps every hero', () => {
    expect(tabCounts(patch, '').heroes).toBe(patch.heroes.length);
  });
  it('keeps a heading only above a kept line', () => {
    const lines = [
      { text: 'Head', indent: 1, heading: true, kind: 'neutral', magnitude: 1 },
      { text: 'Foo up', indent: 1, kind: 'buff', magnitude: 1 },
      { text: 'Head2', indent: 1, heading: true, kind: 'neutral', magnitude: 1 },
      { text: 'Bar', indent: 1, kind: 'nerf', magnitude: 1 },
    ] as const;
    expect(filterLines([...lines], 'bar').map((l) => l.text)).toEqual(['Head2', 'Bar']);
  });
  it('splits matches', () => {
    expect(splitMatches('Blink Dagger', 'blink')).toEqual([{ text: 'Blink', hit: true }, { text: ' Dagger', hit: false }]);
  });
});
