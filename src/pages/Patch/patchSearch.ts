// Pure search + filter helpers for the patch page. No React, no JSON import (types only).
import type { Patch, PatchAbility, PatchCreep, PatchHero, PatchItem, PatchLine, PatchSection } from '../../data/patches';

export type TabId = 'overview' | 'general' | 'heroes' | 'items' | 'neutral-items' | 'neutral-creeps' | 'biggest';

export const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'general', label: 'General' },
  { id: 'heroes', label: 'Heroes' },
  { id: 'items', label: 'Items' },
  { id: 'neutral-items', label: 'Neutral items' },
  { id: 'neutral-creeps', label: 'Neutral creeps' },
  { id: 'biggest', label: 'Biggest buffs & nerfs' },
];

export const isTabId = (v: string | null): v is TabId => TABS.some((t) => t.id === v);

/** Lower-cased, trimmed query ('' = no search). */
export const normQuery = (q: string): string => q.trim().toLowerCase();

const plain = (s: string): string => s.replace(/\*\*/g, '').toLowerCase();
const has = (s: string | undefined, q: string): boolean => !!s && plain(s).includes(q);

export const lineMatches = (l: PatchLine, q: string): boolean => has(l.text, q) || has(l.info, q);

/** Lines that match; a sub-heading is kept only when a line under it is kept (or it matches itself). */
export function filterLines(lines: PatchLine[], q: string): PatchLine[] {
  if (!q) return lines;
  const out: PatchLine[] = [];
  let pending: PatchLine | null = null;
  for (const l of lines) {
    if (l.heading) { pending = l; if (lineMatches(l, q)) { out.push(l); pending = null; } continue; }
    if (lineMatches(l, q)) { if (pending) { out.push(pending); pending = null; } out.push(l); }
  }
  return out;
}

const pick = (lines: PatchLine[], whole: boolean, q: string): PatchLine[] => (whole || !q ? lines : filterLines(lines, q));

export interface SectionView { section: PatchSection; lines: PatchLine[] }
export function viewSections(sections: PatchSection[], q: string): SectionView[] {
  return sections
    .map((section) => ({ section, lines: pick(section.lines, has(section.title, q), q) }))
    .filter((v) => v.lines.length > 0 || (!!q && has(v.section.title, q)));
}

export interface ItemView { item: PatchItem; lines: PatchLine[] }
export function viewItems(items: PatchItem[], q: string): ItemView[] {
  return items
    .map((item) => {
      const whole = has(item.name, q) || has(item.label, q) || has(item.group, q);
      return { item, lines: pick(item.lines, whole, q), whole };
    })
    .filter((v) => !q || v.whole || v.lines.length > 0)
    .map(({ item, lines }) => ({ item, lines }));
}

export interface CreepView { creep: PatchCreep; lines: PatchLine[] }
export function viewCreeps(creeps: PatchCreep[], q: string): CreepView[] {
  return creeps
    .map((creep) => ({ creep, lines: pick(creep.lines, has(creep.name, q), q), whole: has(creep.name, q) }))
    .filter((v) => !q || v.whole || v.lines.length > 0)
    .map(({ creep, lines }) => ({ creep, lines }));
}

export interface HeroView {
  hero: PatchHero;
  notes: PatchLine[];
  talents: PatchLine[];
  abilities: { ability: PatchAbility; lines: PatchLine[] }[];
}
export function viewHero(hero: PatchHero, q: string): HeroView | null {
  const whole = has(hero.name, q) || has(hero.shortName.replace(/_/g, ' '), q);
  const notes = pick(hero.notes, whole, q);
  const talents = pick(hero.talents, whole, q);
  const abilities = hero.abilities
    .map((ability) => ({ ability, lines: pick(ability.lines, whole || has(ability.name, q), q) }))
    .filter((a) => a.lines.length > 0);
  if (q && !whole && !notes.length && !talents.length && !abilities.length) return null;
  return { hero, notes, talents, abilities };
}

/** Number of matching entries per tab (how many cards/rows the tab would show). */
export function tabCounts(patch: Patch, q: string): Record<TabId, number> {
  const h = patch.highlights;
  const crazy = h.crazyChanges.filter((c) => has(c.name, q) || has(c.blurb, q) || has(c.line, q) || has(c.ref, q)).length;
  const movers = (list: typeof h.topBuffs) =>
    list.filter((m) => has(m.name, q) || m.lines.some((l) => has(l, q))).length;
  return {
    overview: crazy,
    general: viewSections(patch.general, q).length,
    heroes: patch.heroes.filter((x) => viewHero(x, q)).length,
    items: viewItems(patch.items, q).length,
    'neutral-items': viewSections(patch.neutral_items.sections, q).length + viewItems(patch.neutral_items.items, q).length,
    'neutral-creeps': viewSections(patch.neutral_creeps.sections, q).length + viewCreeps(patch.neutral_creeps.creeps, q).length,
    biggest: movers(h.topBuffs) + movers(h.topNerfs),
  };
}

/** Split text into pieces, flagging those that equal the query (case-insensitive). */
export function splitMatches(text: string, q: string): { text: string; hit: boolean }[] {
  if (!q) return [{ text, hit: false }];
  const out: { text: string; hit: boolean }[] = [];
  const low = text.toLowerCase();
  let i = 0;
  for (;;) {
    const j = low.indexOf(q, i);
    if (j < 0) break;
    if (j > i) out.push({ text: text.slice(i, j), hit: false });
    out.push({ text: text.slice(j, j + q.length), hit: true });
    i = j + q.length;
  }
  if (i < text.length) out.push({ text: text.slice(i), hit: false });
  return out.length ? out : [{ text, hit: false }];
}
