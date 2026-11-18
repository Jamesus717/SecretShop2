// Typed loader for the baked patch data. The JSON is produced by scripts/patch-fetch.mjs
// (Valve's datafeed) and src/data/patches/<ver>.highlights.json by scripts/patch-highlights.mjs.
// Import this module from a lazily loaded route: the JSON is ~450 KB.
import patch742 from './7.42.json';
import highlights742 from './7.42.highlights.json';
import tldr742 from './7.42.tldr.json';

export type ChangeKind = 'buff' | 'nerf' | 'rework' | 'neutral';
export type Attribute = 'strength' | 'agility' | 'intelligence' | 'universal';

/** One change line. `text` is plain text with **bold** markers (split on ** to render <strong>). */
export interface PatchLine {
  text: string;
  indent: number;
  /** true for sub-headings such as "Hero Stats"; they carry no change. */
  heading?: boolean;
  /** Valve's small grey explanation under the line (same ** convention). */
  info?: string;
  aghs?: 'scepter' | 'shard';
  /** Stat icon hint from Valve (agility, movement, armor, ...). */
  stat?: string;
  kind: ChangeKind;
  /** 1 small, 2 medium, 3 big. */
  magnitude: 1 | 2 | 3;
}

export interface Summary {
  buff: number;
  nerf: number;
  rework: number;
  neutral: number;
  /** sum of buff magnitudes minus sum of nerf magnitudes */
  score: number;
}

export interface PatchAbility {
  id: number;
  name: string;
  shortName: string;
  /** null when Valve's CDN has no icon yet (brand new 7.42 abilities). */
  icon: string | null;
  lines: PatchLine[];
}

export interface PatchHero {
  id: number;
  name: string;
  shortName: string;
  icon: string;
  attribute: Attribute | null;
  notes: PatchLine[];
  talents: PatchLine[];
  abilities: PatchAbility[];
  summary: Summary;
}

export interface PatchItem {
  id: number;
  name: string;
  shortName: string;
  icon: string;
  /** e.g. "New Item", "New Tier 3 Artifact" */
  label?: string;
  /** e.g. "Basic Items", "Upgrades" */
  group?: string;
  lines: PatchLine[];
  summary: Summary;
}

export interface PatchSection {
  title: string;
  lines: PatchLine[];
}

export interface PatchCreep {
  name: string;
  shortName: string;
  lines: PatchLine[];
  summary: Summary;
}

export interface PatchData {
  version: string;
  name: string;
  timestamp: number;
  general: PatchSection[];
  heroes: PatchHero[];
  items: PatchItem[];
  neutral_items: { sections: PatchSection[]; items: PatchItem[] };
  neutral_creeps: { sections: PatchSection[]; creeps: PatchCreep[] };
}

export interface CrazyChange {
  id: number;
  type: 'hero' | 'item' | 'general';
  ref: string;
  name: string;
  icon?: string;
  /** our one-line punchy summary; numbers copied from Valve's text */
  blurb: string;
  /** Valve's exact line the blurb is based on */
  line: string;
}

export interface TopMover {
  type: 'hero' | 'item';
  ref: string;
  name: string;
  icon: string;
  score: number;
  /** Valve's own lines, ability name prefixed */
  lines: string[];
}

export type Verdict = 'buffed' | 'nerfed' | 'reworked' | 'mixed';

export interface HeroVerdict {
  verdict: Verdict;
  net: number;
  line: string;
}

export interface PatchHighlights {
  version: string;
  crazyChanges: CrazyChange[];
  topBuffs: TopMover[];
  topNerfs: TopMover[];
  /** keyed by hero shortName */
  heroVerdicts: Record<string, HeroVerdict>;
}

/** Hand-written overview card. Every bullet is backed by exact Valve lines in `src` (checked by tests). */
export interface TldrCard {
  id: string;
  title: string;
  tab: 'general' | 'neutral-items' | 'items' | 'heroes';
  bullets: { text: string; src: string[] }[];
}

export interface PatchTldr {
  version: string;
  cards: TldrCard[];
}

export interface Patch extends PatchData {
  highlights: PatchHighlights;
  tldr: PatchTldr;
}

export const LATEST_PATCH = '7.42';

const PATCHES: Record<string, Patch> = {
  '7.42': {
    ...(patch742 as unknown as PatchData),
    highlights: highlights742 as unknown as PatchHighlights,
    tldr: tldr742 as unknown as PatchTldr,
  },
};

export function getPatch(version: string): Patch | undefined {
  return PATCHES[version];
}

export function patchVersions(): string[] {
  return Object.keys(PATCHES);
}
