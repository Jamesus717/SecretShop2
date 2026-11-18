import { describe, expect, it } from 'vitest';
import { LATEST_PATCH, getPatch } from './index';

const ICON = /^https:\/\/cdn\.cloudflare\.steamstatic\.com\/apps\/dota2\/images\/dota_react\/(heroes|items)\/[a-z0-9_]+\.png$/;

describe('patch 7.42 data', () => {
  const p = getPatch('7.42');

  it('loads and is the latest', () => {
    expect(LATEST_PATCH).toBe('7.42');
    expect(p).toBeDefined();
  });

  it('every hero has a name, short name, attribute and a Valve CDN icon', () => {
    for (const h of p!.heroes) {
      expect(h.name, `hero ${h.id} name`).toBeTruthy();
      expect(h.shortName).toBeTruthy();
      expect(h.icon, h.name).toMatch(ICON);
      expect(h.icon).toContain(`/heroes/${h.shortName}.png`);
      expect(h.attribute, h.name).not.toBeNull();
    }
    expect(p!.heroes.length).toBe(127);
  });

  it('every item and neutral item has a name and icon', () => {
    for (const i of [...p!.items, ...p!.neutral_items.items]) {
      expect(i.name, `item ${i.id}`).toBeTruthy();
      expect(i.icon, i.name).toMatch(ICON);
      expect(i.icon).toContain(`/items/${i.shortName}.png`);
    }
  });

  it('has all sections and no raw markup left in text', () => {
    expect(p!.general.length).toBe(4);
    expect(p!.items.length).toBeGreaterThan(50);
    expect(p!.neutral_items.items.length).toBeGreaterThan(50);
    expect(p!.neutral_creeps.creeps.length).toBeGreaterThan(10);
    const all: string[] = [];
    const add = (ls: { text: string; info?: string }[]) => ls.forEach((l) => all.push(l.text, l.info ?? ''));
    p!.general.forEach((g) => add(g.lines));
    p!.heroes.forEach((h) => {
      add(h.notes);
      add(h.talents);
      h.abilities.forEach((a) => add(a.lines));
    });
    p!.items.forEach((i) => add(i.lines));
    expect(all.filter((t) => /<[a-z/]|\[\/?b\]/i.test(t))).toEqual([]);
  });

  it('every line has a kind and magnitude 1-3', () => {
    for (const h of p!.heroes) {
      for (const l of [...h.notes, ...h.talents, ...h.abilities.flatMap((a) => a.lines)]) {
        expect(['buff', 'nerf', 'rework', 'neutral']).toContain(l.kind);
        expect([1, 2, 3]).toContain(l.magnitude);
      }
    }
  });
});

describe('patch 7.42 highlights', () => {
  const p = getPatch('7.42')!;
  const hl = p.highlights;

  it('has 8-12 crazy changes, 10 buffs, 10 nerfs', () => {
    expect(hl.crazyChanges.length).toBeGreaterThanOrEqual(8);
    expect(hl.crazyChanges.length).toBeLessThanOrEqual(12);
    expect(hl.topBuffs).toHaveLength(10);
    expect(hl.topNerfs).toHaveLength(10);
  });

  it('every hero has a verdict and every ref resolves', () => {
    for (const h of p.heroes) expect(hl.heroVerdicts[h.shortName], h.name).toBeDefined();
    for (const m of [...hl.topBuffs, ...hl.topNerfs]) {
      const list = m.type === 'hero' ? p.heroes : p.items;
      expect(list.some((x) => x.shortName === m.ref), m.name).toBe(true);
    }
    for (const c of hl.crazyChanges) expect(c.blurb.length).toBeGreaterThan(10);
  });
});
