import { logoKey } from '../lib/teamlogo';
import { SECRETLEAGUE_I } from './champions';

export type DivisionKey = 'upper' | 'mid' | 'lower';

export const DIVISION_ORDER: DivisionKey[] = ['upper', 'mid', 'lower'];

export const DIVISION_LABEL: Record<DivisionKey, string> = { upper: 'Upper', mid: 'Middle', lower: 'Lower' };

/**
 * Group-stage seedings, copied from legacy js/standings.js DIVISION_SEED_NAMES.
 * Supabase `team_divisions` rows (team_key -> division) win over this seed.
 */
export const DIVISION_SEED_NAMES: Record<DivisionKey, string[]> = {
  upper: ['Midlands Massive', 'N-stitution', 'Institutionalized Mentaly Ill Players', 'Glizzy Gladiators',
    'Golden Retrievers', 'SLOB Team', 'Crêpe stack'],
  mid: ['Ctrl Alt Defeat', 'TaiLungs Accountants', 'Money Talks', 'Imprint Esports', 'The Dark Side of the Map',
    'The Bortymites', 'Free Bans Gang', 'The Truers', '5 Stuns No Brains'],
  lower: ['Catwice', 'Chutney Smugglers', 'FarmVille', 'Herald Royale with Cheese', 'No Sweat', 'D2Ire Rejects'],
};

const SEED_BY_KEY: Record<string, DivisionKey> = {};
for (const div of DIVISION_ORDER) {
  for (const n of DIVISION_SEED_NAMES[div]) SEED_BY_KEY[logoKey(n)] = div;
}

export function isDivisionKey(v: unknown): v is DivisionKey {
  return v === 'upper' || v === 'mid' || v === 'lower';
}

/** Division for a team name: admin override first, then the seed, else null. */
export function divisionFor(name: string, overrides: Record<string, string> = {}): DivisionKey | null {
  const key = logoKey(name);
  const o = overrides[key];
  if (isDivisionKey(o)) return o;
  return SEED_BY_KEY[key] ?? null;
}

export type Honour = 'champion' | 'runnerUp';

/** SecretLeague I result for a team name, matched on logoKey. */
export function honourFor(name: string): Honour | null {
  const k = logoKey(name);
  for (const d of SECRETLEAGUE_I.divisions) {
    if (logoKey(d.champion.name) === k) return 'champion';
    if (logoKey(d.runnerUp.name) === k) return 'runnerUp';
  }
  return null;
}
