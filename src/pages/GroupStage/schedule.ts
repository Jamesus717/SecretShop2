// Group stage schedule. Fixtures live here as data, not markup, so a time or pairing change is a
// one-line edit. Match numbers are league-wide and grouped by division: Lower 1-15, Mid 16-49, Upper 50-70.
//
// Shape: [matchNumber, teamA, teamB] with an optional 4th slot:
//   'cast'                        streamed
//   { cast: true, time: '19:30', score: [2, 0], forfeit: true }
// `time` overrides the day's default and is shown on the row. `score` is [teamA, teamB] and the
// winner is derived from it rather than stored. Equal scores render as a tie.

export type DivKey = 'upper' | 'mid' | 'lower';
export interface MatchOpts { cast?: boolean; time?: string; score?: [number, number]; forfeit?: boolean }
export type Match = [number, string, string] | [number, string, string, 'cast' | MatchOpts];
export interface Day {
  date: string;
  name: string;
  week: number;
  time?: string;
  divisions: Partial<Record<DivKey, Match[]>>;
}

export const DEFAULT_TIME = '19:00';

export const SCHEDULE: Day[] = [
  { date: '2026-08-17', name: 'Monday', week: 1, divisions: {
    upper: [[50, 'Midlands Massive', 'N-stitution', { score: [0, 2] }],
            [52, 'Institutionalized Mentaly Ill Players', 'Glizzy Gladiators', { score: [1, 1] }]],
    mid:   [[16, 'Ctrl Alt Defeat', 'TaiLungs Accountants', { score: [1, 1] }],
            [17, 'Money Talks', 'Imprint Esports', { time: '19:30', score: [1, 1] }],
            [18, 'The Dark Side of the Map', 'The Bortymites', { score: [2, 0] }]],
    lower: [[1, 'Catwice', 'Chutney Smugglers', { score: [2, 0] }],
            [2, 'FarmVille', 'Herald Royale with Cheese', { score: [2, 0] }],
            [3, 'No Sweat', 'D2Ire Rejects', { cast: true, score: [1, 1] }]]
  }},
  { date: '2026-08-18', name: 'Tuesday', week: 1, divisions: {
    upper: [[53, 'Golden Retrievers', 'N-stitution', { score: [1, 1] }],
            [54, 'SLOB Team', 'Institutionalized Mentaly Ill Players', { score: [0, 2] }]],
    mid:   [[20, 'Free Bans Gang', 'TaiLungs Accountants', { time: '19:30', score: [1, 1] }],
            [21, 'Ctrl Alt Defeat', 'Imprint Esports', { score: [0, 2] }],
            [22, 'The Truers', 'The Bortymites', { time: '18:00', score: [2, 0] }]],
    lower: [[4, 'Catwice', 'Herald Royale with Cheese', { cast: true, score: [2, 0] }],
            [5, 'Chutney Smugglers', 'D2Ire Rejects', { score: [2, 0] }],
            [6, 'FarmVille', 'No Sweat', { score: [2, 0] }]] 
  }},
  { date: '2026-08-19', name: 'Wednesday', week: 1, divisions: {
    upper: [[55, 'Midlands Massive', 'Glizzy Gladiators'],
            [56, 'Golden Retrievers', 'Crêpe stack', { score: [1, 1] }]],
    mid:   [[23, 'TaiLungs Accountants', 'Imprint Esports', { cast: true, score: [1, 1] }],
            [24, 'Ctrl Alt Defeat', 'The Dark Side of the Map', { score: [1, 1] }]]
  }},
  { date: '2026-08-20', name: 'Thursday', week: 1, divisions: {
    upper: [[62, 'Crêpe stack', 'Midlands Massive', { score: [2, 0], forfeit: true }]],
    mid:   [[25, 'Money Talks', 'The Dark Side of the Map', { cast: true, score: [1, 1] }], 
            [26, '5 Stuns No Brains', 'The Bortymites', { score: [2, 0] }]]
  }},
  { date: '2026-08-21', name: 'Friday', week: 1, divisions: {
    upper: [[51, 'SLOB Team', 'Crêpe stack', { score: [2, 0] }]]
  }},
  { date: '2026-08-23', name: 'Sunday', week: 1, divisions: {
    mid: [[27, 'Free Bans Gang', '5 Stuns No Brains', { cast: true, score: [1, 1] }]]
  }},
  { date: '2026-08-24', name: 'Monday', week: 2, divisions: {
    upper: [[57, 'N-stitution', 'Glizzy Gladiators'], 
            [58, 'Midlands Massive', 'SLOB Team', { score: [0, 2] }]],
    mid:   [[28, 'TaiLungs Accountants', 'The Dark Side of the Map', { score: [2, 0] }], 
            [29, '5 Stuns No Brains', 'Money Talks', { score: [1, 1] }], 
            [30, 'The Bortymites', 'Ctrl Alt Defeat']],
    lower: [[7, 'Catwice', 'D2Ire Rejects', { score: [2, 0] }], 
            [8, 'Herald Royale with Cheese', 'No Sweat', { score: [0, 2] }], 
            [9, 'Chutney Smugglers', 'FarmVille', { cast: true, score: [0, 1], forfeit: true }]]
  }},
  { date: '2026-08-25', name: 'Tuesday', week: 2, divisions: {
    upper: [[60, 'N-stitution', 'SLOB Team', 'cast'], 
            [61, 'Golden Retrievers', 'Institutionalized Mentaly Ill Players', { time: '17:00', score: [2, 0] }]],
    mid:   [[31, 'The Truers', 'Money Talks', { score: [1, 1] }], 
            [32, 'Free Bans Gang', 'Imprint Esports', { score: [0, 2] }], 
            [33, '5 Stuns No Brains', 'Ctrl Alt Defeat']],
    lower: [[10, 'Catwice', 'No Sweat', { score: [2, 0] }], 
            [11, 'D2Ire Rejects', 'FarmVille', { time: '18:00', score: [0, 2] }], 
            [12, 'Herald Royale with Cheese', 'Chutney Smugglers']]
  }},
  { date: '2026-08-26', name: 'Wednesday', week: 2, divisions: {
    upper: [[63, 'Golden Retrievers', 'Glizzy Gladiators', { score: [2, 0], forfeit: true }]],
    mid:   [[34, 'Ctrl Alt Defeat', 'The Truers', 'cast'], 
            [35, 'Imprint Esports', 'The Dark Side of the Map', { score: [0, 2] }]]
  }},
  { date: '2026-08-27', name: 'Thursday', week: 2, divisions: {
    mid: [[36, 'TaiLungs Accountants', 'The Truers', { cast: true, score: [0, 2] }], 
          [37, 'The Bortymites', 'Money Talks']]
  }},
  { date: '2026-08-28', name: 'Friday', week: 2, divisions: {
    mid: [[38, '5 Stuns No Brains', 'TaiLungs Accountants']]
  }},
  { date: '2026-08-30', name: 'Sunday', week: 2, divisions: {
    upper: [[59, 'Crêpe stack', 'Institutionalized Mentaly Ill Players']],
    mid: [[39, 'Free Bans Gang', 'The Bortymites', 'cast']]
  }},
  { date: '2026-08-31', name: 'Monday', week: 3, divisions: {
    upper: [[64, 'Glizzy Gladiators', 'SLOB Team', { score: [0, 2] }], 
            [65, 'Institutionalized Mentaly Ill Players', 'Midlands Massive', 'cast'], 
            [66, 'Crêpe stack', 'N-stitution']],
    mid:   [[40, 'Money Talks', 'Ctrl Alt Defeat'], 
            [41, 'The Bortymites', 'TaiLungs Accountants'], 
            [42, 'Imprint Esports', '5 Stuns No Brains']],
    lower: [[13, 'Catwice', 'FarmVille'], 
            [14, 'No Sweat', 'Chutney Smugglers'], 
            [15, 'D2Ire Rejects', 'Herald Royale with Cheese']]
  }},
  { date: '2026-09-01', name: 'Tuesday', week: 3, divisions: {
    upper: [[67, 'Golden Retrievers', 'SLOB Team', { cast: true, score: [1, 1] }], 
            [68, 'Institutionalized Mentaly Ill Players', 'N-stitution']],
    mid:   [[43, 'Imprint Esports', 'The Truers'], 
            [44, 'Free Bans Gang', 'Money Talks']]
  }},
  { date: '2026-09-02', name: 'Wednesday', week: 3, divisions: {
    upper: [[69, 'Golden Retrievers', 'Midlands Massive'], 
            [70, 'Glizzy Gladiators', 'Crêpe stack', 'cast']],
    mid:   [[45, 'The Dark Side of the Map', 'The Truers'], 
            [46, 'The Bortymites', 'Imprint Esports']]
  }},
  { date: '2026-09-03', name: 'Thursday', week: 3, divisions: {
    mid: [[47, 'Money Talks', 'TaiLungs Accountants'], 
          [48, 'The Dark Side of the Map', '5 Stuns No Brains']]
  }},
  // Placeholder date — The Truers and 5 Stuns are still arranging a reschedule.
  { date: '2026-09-05', name: 'Saturday', week: 3, divisions: {
    mid: [[19, 'The Truers', '5 Stuns No Brains']]
  }},
  { date: '2026-09-06', name: 'Sunday', week: 3, divisions: {
    mid: [[49, 'Free Bans Gang', 'The Dark Side of the Map']]
  }}
];

/** Rendered top to bottom in this order. */
export const DIVISIONS: { key: DivKey; label: string }[] = [
  { key: 'upper', label: 'Upper' },
  { key: 'mid', label: 'Mid' },
  { key: 'lower', label: 'Lower' },
];

/** Normalises the optional 4th slot, which may be the 'cast' shorthand or an object. */
export function matchOpts(m: Match): MatchOpts {
  const o = m[3];
  if (!o) return {};
  if (typeof o === 'string') return { cast: o === 'cast' };
  return o;
}

export function matchesOf(day: Day): Match[] {
  return DIVISIONS.flatMap(({ key }) => day.divisions[key] || []);
}

export function totals(schedule: Day[] = SCHEDULE) {
  const all = schedule.flatMap(matchesOf);
  return {
    matches: all.length,
    days: schedule.length,
    casts: all.filter((m) => matchOpts(m).cast).length,
    played: all.filter((m) => Array.isArray(matchOpts(m).score)).length,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dateParts(day: Day) {
  const [y, m, d] = day.date.split('-').map(Number);
  return { y, m, d, dd: String(d).padStart(2, '0'), mon: MONTHS[m - 1] };
}

export function dayId(day: Day): string {
  const { dd, m, y } = dateParts(day);
  return `day-${dd}-${String(m).padStart(2, '0')}-${y}`;
}
