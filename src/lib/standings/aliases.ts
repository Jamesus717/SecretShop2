import { logoKey } from '../teamlogo';
import type { Division } from './types';

export const DIV_ORDER: Division[] = ['upper', 'mid', 'lower', 'unassigned'];
export const DIV_LABELS: Record<Division, string> = {
  upper: 'Upper Division', mid: 'Mid Division', lower: 'Lower Division', unassigned: 'Unassigned',
};
export const POSITIONS = [1, 2, 3, 4, 5];

// Seeded from the group stage groupings so Standings and Group Stage agree on divisions
// until an admin moves someone. Overrides live in team_divisions and win over this seed.
export const DIVISION_SEED_NAMES: Record<Exclude<Division, 'unassigned'>, string[]> = {
  upper: ['Midlands Massive', 'N-stitution', 'Institutionalized Mentaly Ill Players', 'Glizzy Gladiators',
    'Golden Retrievers', 'SLOB Team', 'Crêpe stack'],
  mid: ['Ctrl Alt Defeat', 'TaiLungs Accountants', 'Money Talks', 'Imprint Esports', 'The Dark Side of the Map',
    'The Bortymites', 'Free Bans Gang', 'The Truers', '5 Stuns No Brains'],
  lower: ['Catwice', 'Chutney Smugglers', 'FarmVille', 'Herald Royale with Cheese', 'No Sweat', 'D2Ire Rejects'],
};

// Imprint's team names have drifted from the registered ones. Keyed Imprint name -> registered
// name; every other difference (case, 'CATWICE', 'SLOB TEAM') already normalises away via logoKey.
// '#DOTA_BadGuys' is Imprint Esports: the only Imprint name with no registered counterpart.
export const TEAM_NAME_ALIASES: Record<string, string> = {
  '#DOTA_BadGuys': 'Imprint Esports',
  'Truers Official': 'The Truers',
  'Bortymites': 'The Bortymites',
};

export const ALIAS_BY_KEY: Record<string, string> = {};
for (const [imprintName, registeredName] of Object.entries(TEAM_NAME_ALIASES)) {
  ALIAS_BY_KEY[logoKey(imprintName)] = logoKey(registeredName);
}

export const DIVISION_SEED: Record<string, Division> = {};
export const REGISTERED_BY_KEY: Record<string, string> = {};
for (const [div, names] of Object.entries(DIVISION_SEED_NAMES)) {
  for (const n of names) {
    DIVISION_SEED[logoKey(n)] = div as Division;
    REGISTERED_BY_KEY[logoKey(n)] = n;
  }
}

/** The name the team signed up with, falling back to whatever Imprint calls it. */
export function displayName(key: string, imprintName: string): string {
  return REGISTERED_BY_KEY[key] || REGISTERED_BY_KEY[ALIAS_BY_KEY[key]] || imprintName;
}

/** Division for a team key, following an alias when Imprint's name has drifted. */
export function seededDivision(key: string): Division | null {
  return DIVISION_SEED[key] || DIVISION_SEED[ALIAS_BY_KEY[key]] || null;
}
