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

  it('every crazyChanges / topBuffs / topNerfs ref resolves to a real hero, item or general section', () => {
    const resolves = (type: string, ref: string) =>
      type === 'hero'
        ? p.heroes.some((x) => x.shortName === ref)
        : type === 'item'
          ? p.items.some((x) => x.shortName === ref)
          : p.general.some((g) => g.title === ref);
    for (const c of hl.crazyChanges) expect(resolves(c.type, c.ref), `${c.type}/${c.ref}`).toBe(true);
    for (const m of [...hl.topBuffs, ...hl.topNerfs]) expect(resolves(m.type, m.ref), `${m.type}/${m.ref}`).toBe(true);
  });

  it('no Cyrillic/Greek lookalikes left in note text', () => {
    const bad: string[] = [];
    for (const h of p.heroes)
      for (const l of [...h.notes, ...h.talents, ...h.abilities.flatMap((a) => a.lines)]) if (/[Ͱ-ӿ]/.test(l.text)) bad.push(l.text);
    expect(bad).toEqual([]);
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

describe('patch 7.42 tldr cards', () => {
  const p = getPatch('7.42')!;
  const plain = (s: string) => s.replace(/\*\*/g, '');
  const valve = new Set<string>();
  const add = (lines: { text: string }[]) => lines.forEach((l) => valve.add(plain(l.text)));
  for (const s of [...p.general, ...p.neutral_items.sections, ...p.neutral_creeps.sections]) add(s.lines);
  const nums = (s: string) => s.match(/\d+(?:[.,:]\d+)*/g) ?? [];

  it('has 6 cards with 2 to 3 bullets each', () => {
    expect(p.tldr.cards).toHaveLength(6);
    for (const c of p.tldr.cards) {
      expect(c.bullets.length, c.id).toBeGreaterThanOrEqual(2);
      expect(c.bullets.length, c.id).toBeLessThanOrEqual(3);
    }
  });

  it('every bullet is backed by exact Valve lines and every number comes from them', () => {
    for (const c of p.tldr.cards) {
      for (const b of c.bullets) {
        expect(b.src.length, b.text).toBeGreaterThan(0);
        for (const line of b.src) expect(valve.has(line), `${c.id}: "${line}" is not a Valve line`).toBe(true);
        const source = b.src.join(' ');
        for (const n of nums(b.text)) expect(source, `${c.id}: number ${n} in "${b.text}"`).toContain(n);
      }
    }
  });
});
