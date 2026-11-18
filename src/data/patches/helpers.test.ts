import { describe, expect, it } from 'vitest';
import { classifyLine, cleanNote, magnitudeFor, parseChange, statPolarity, toSegments } from './helpers.mjs';

describe('cleanNote', () => {
  it('strips tags and turns Valve red emphasis into bold', () => {
    expect(cleanNote("<font color='#e03e2e'>Damage penalty</font> changed from <font color='#e03e2e'>35/70</font> to <font color='#e03e2e'>70</font>")).toBe(
      '**Damage penalty** changed from **35/70** to **70**',
    );
  });
  it('removes subtitles spans, br, bbcode and entities', () => {
    expect(cleanNote('<span class="Subtitle">Hero Stats</span>')).toBe('Hero Stats');
    expect(cleanNote('<br>')).toBe('');
    expect(cleanNote('a<br>b &amp; [i]c[/i]')).toBe('a b & c');
    expect(cleanNote(null)).toBe('');
  });
  it('splits into segments', () => {
    expect(toSegments('a **b** c')).toEqual([
      { text: 'a ', bold: false },
      { text: 'b', bold: true },
      { text: ' c', bold: false },
    ]);
  });
});

describe('statPolarity', () => {
  it('lower is better for cooldown, mana cost, BAT, cast point, cost', () => {
    for (const s of ['Cooldown', 'Mana Cost', 'Base Attack Time', 'Cast Point', 'Total cost', 'Restock time']) {
      expect(statPolarity(s)).toBe('lowerBetter');
    }
  });
  it('higher is better for damage, armor, duration, cooldown reduction', () => {
    for (const s of ['Damage', 'Armor bonus', 'Duration', 'Cooldown Reduction bonus']) {
      expect(statPolarity(s)).toBe('higherBetter');
    }
  });
});

describe('parseChange / magnitudeFor', () => {
  it('reads direction and means of level lists', () => {
    expect(parseChange('Movement Slow decreased from 18/22/26/30% to 16/19/22/25%')).toMatchObject({ direction: 'down', from: 24, to: 20.5 });
  });
  it('treats 56-76 as a range, not a negative', () => {
    expect(parseChange('Damage at level 1 rescaled from 56-76 to 61-71')).toMatchObject({ from: 66, to: 66, direction: null });
  });
  it('scales magnitude 1-3', () => {
    expect(magnitudeFor(100, 110)).toBe(1);
    expect(magnitudeFor(100, 130)).toBe(2);
    expect(magnitudeFor(100, 200)).toBe(3);
  });
});

describe('classifyLine', () => {
  it('cooldown down = buff, cooldown up = nerf', () => {
    expect(classifyLine('Cooldown decreased from 30s to 25s').kind).toBe('buff');
    expect(classifyLine('Cooldown increased from 25s to 30s').kind).toBe('nerf');
  });
  it('mana cost down = buff, up = nerf', () => {
    expect(classifyLine('Mana Cost decreased from 35 to 20')).toMatchObject({ kind: 'buff', magnitude: 3 });
    expect(classifyLine('Mana Cost increased from 40 to 75').kind).toBe('nerf');
  });
  it('base attack time down = buff, damage/armor/duration up = buff, inverted when decreased', () => {
    expect(classifyLine('Base Attack Time decreased from 1.7 to 1.6').kind).toBe('buff');
    expect(classifyLine('Damage increased from 50 to 60').kind).toBe('buff');
    expect(classifyLine('Armor bonus decreased from +9 to +4.5').kind).toBe('nerf');
    expect(classifyLine('Duration decreased from 5s to 4s').kind).toBe('nerf');
  });
  it('ignores the earlier sentence when naming the stat', () => {
    expect(classifyLine('Added allied interaction with a separate cooldown. Damage increased from 130 to 175').kind).toBe('buff');
  });
  it('by-N changes, improved/worsened, and a cost shuffle that nets out', () => {
    expect(classifyLine('Base Damage increased by 3').kind).toBe('buff');
    expect(classifyLine('Cast Point improved from 0.3s to 0.2s').kind).toBe('buff');
    expect(classifyLine('Recipe cost increased from 500g to 600g. Total cost unchanged at 2575g').kind).toBe('neutral');
  });
  it('behaviour changes are rework, plain info is neutral', () => {
    expect(classifyLine('Ability Reworked').kind).toBe('rework');
    expect(classifyLine('Item Cycled Out').kind).toBe('neutral');
    expect(classifyLine('Tier changed from 4 to 2').kind).toBe('neutral');
  });
});
