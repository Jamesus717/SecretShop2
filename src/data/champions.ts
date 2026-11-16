// Verified from the schedule sheet + site news cards, 2026-11-16.
// roster entries are [ign, position]

export type RosterEntry = [ign: string, position: number];
export type ChampionDivisionKey = 'upper' | 'mid' | 'lower';

export interface ChampionTeam {
  name: string;
  logoKey: string;
  roster: RosterEntry[];
}

export interface ChampionDivision {
  key: ChampionDivisionKey;
  label: string;
  champion: ChampionTeam;
  runnerUp: ChampionTeam;
  third: string;
  final: { score: string; date: string; format: string };
  path: string[];
}

export const SECRETLEAGUE_I: {
  season: string;
  year: number;
  teams: number;
  series: number;
  divisions: ChampionDivision[];
} = {
  season: 'SecretLeague I',
  year: 2026,
  teams: 23,
  series: 34,
  divisions: [
    {
      key: 'upper',
      label: 'Upper Division',
      champion: {
        name: 'N-stitution',
        logoKey: 'nstitution',
        roster: [['espresso depresso', 1], ['dekaiT', 2], ['Frasse', 3], ['alphabravoindia', 4], ['FlukeY', 5]],
      },
      runnerUp: {
        name: 'Midlands Massive',
        logoKey: 'midlandsmassive',
        roster: [['Dara', 1], ['Polltegrais', 2], ['Starzi', 3], ['Lumière', 4], ['Mev', 5]],
      },
      third: 'Golden Retrievers',
      final: { score: '2–1', date: '2026-10-22', format: 'Bo3' },
      path: ['Upper 6 · 2–0 SLOB Team', 'Upper 7 · 2–1 Golden Retrievers', 'Grand Final · 2–1 Midlands Massive'],
    },
    {
      key: 'mid',
      label: 'Middle Division',
      champion: {
        name: 'The Truers',
        logoKey: 'thetruers',
        roster: [['greg', 2], ['Muntacus', 3], ['Mark', 4], ['ruby', 4], ['benj!', 5]],
      },
      runnerUp: {
        name: 'Money Talks',
        logoKey: 'moneytalks',
        roster: [['Lev', 1], ['Harry', 2], ['Andrew', 3], ['Dan', 4], ['Tom', 5]],
      },
      third: 'The Bortymites',
      final: { score: '2–1', date: '2026-10-21', format: 'Bo3' },
      path: [
        'Middle 3 · 2–1 The Dark Side of the Map',
        'Middle 14 · 2–0 Free Bans Gang',
        'Middle 15 · 2–0 The Bortymites',
        'Grand Final · 2–1 Money Talks',
      ],
    },
    {
      key: 'lower',
      label: 'Lower Division',
      champion: {
        name: 'FarmVille',
        logoKey: 'farmville',
        roster: [['EbolaBear', 1], ['Akim', 2], ['Chromozones', 3], ['Luke', 4], ['Karenlyl', 5]],
      },
      runnerUp: {
        name: 'Catwice',
        logoKey: 'catwice',
        roster: [['Quasar', 1], ['Lushless', 2], ['NeverFroget', 3], ['certified turtle', 4], ['Cold Comfort', 5]],
      },
      third: 'Chutney Smugglers',
      final: { score: '2–0', date: '2026-10-24', format: 'Bo3' },
      path: ['Lower 3 · 2–1 No Sweat', 'Lower 5 · 2–0 Catwice', 'Grand Final · 2–0 Catwice'],
    },
  ],
};
