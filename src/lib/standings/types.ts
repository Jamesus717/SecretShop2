// Shapes for the standings logic. Imprint payloads are loose, so inputs are typed
// only as far as the code reads them.

export type Division = 'upper' | 'mid' | 'lower' | 'unassigned';

export interface H2HRecord { wins: number; ties: number; losses: number }

export interface ImprintRosterPlayer { account_id: number | string; account_name: string; position?: number }

export interface ImprintTeam {
  team_id: number | string;
  team_name: string;
  team_logo_src?: string | null;
  players?: ImprintRosterPlayer[];
  average_team_imprint_rating?: number | null;
  rating_label?: string | null;
}

export interface ImprintPlayer {
  account_id: number | string;
  average_imprint_rating?: number | null;
  rating_label?: string | null;
}

export interface ImprintHero {
  name?: string;
  icon_src?: string;
  static_portrait_src?: string;
  picks?: number;
  bans?: number;
  wins?: number;
  losses?: number;
  win_rate?: string;
  average_imprint_rating?: number;
  average_kills?: number;
  average_deaths?: number;
  average_assists?: number;
}

export interface HeroesPayload { hero_statistics?: { heroes?: ImprintHero[] } }

/** One game inside a series fragment. */
export interface GamePlayer {
  account_id?: number | string | null;
  account_name?: string;
  position?: number;
  hero?: { name?: string; icon_src?: string } | null;
  kills?: number;
  deaths?: number;
  assists?: number;
  imprint_rating?: number;
  rating_label?: string;
}
export interface GameTeam {
  team_id: number | string;
  team_name?: string;
  win?: boolean;
  wins?: number;
  players?: GamePlayer[];
}
export interface Game { match_id: number; teams?: GameTeam[] }
export interface SeriesData {
  series_id?: number;
  teams?: GameTeam[];
  matches?: Game[];
}

/** computed_teams[team_id] as stored by imprint-sync. */
export interface ComputedTeam {
  teamName: string;
  wins: number;
  ties: number;
  losses: number;
  games: number;
  h2h?: Record<string, H2HRecord>;
}
export type ComputedTeams = Record<string, ComputedTeam>;

export interface ComputedPlayerRec {
  name: string;
  wins: number;
  losses: number;
  matchCount: number;
  ratingSum?: number;
  ratingCount?: number;
  ratingLabel?: string;
}
/** team id -> position -> account id -> record */
export type ComputedPlayers = Record<string, Record<string, Record<string, ComputedPlayerRec>>>;

export interface ComputedHeroRec {
  name: string;
  icon: string | null;
  picks: number;
  wins: number;
  losses: number;
  killSum: number;
  deathSum: number;
  assistSum: number;
  ratingSum: number;
  ratingCount: number;
}
export interface ComputedHeroes { complete?: boolean; heroes?: Record<string, ComputedHeroRec> }

export interface Forfeit {
  id: string;
  winner_key: string;
  winner_name: string;
  loser_key: string;
  loser_name: string;
  note?: string | null;
}

export interface RosterPlayer {
  accountId: number | string;
  name: string;
  position: number;
  wins: number;
  losses: number;
  matchCount: number;
  noGamesRecorded?: boolean;
  rating: number | null;
  ratingLabel: string | null;
  aka: string[];
  isCore?: boolean;
}

export interface Team {
  key: string;
  id: number | string;
  name: string;
  logo: string | null;
  logoUrl: string | null;
  registeredRoster: ImprintRosterPlayer[];
  wins: number;
  ties: number;
  losses: number;
  matchCount: number;
  statsSynced: boolean;
  rating: number | null;
  ratingLabel: string | null;
  forfeitWins: number;
  forfeitLosses: number;
  roster: Record<number, RosterPlayer[]>;
  h2h: Record<string, H2HRecord>;
  h2hRaw?: Record<string, H2HRecord>;
  division: Division;
  statsGap: number;
  statsIncomplete: boolean;
  /** Playoffs view only: 1 champion, 2 runner-up (set once the grand final is decided). */
  place?: 1 | 2;
  /** Playoffs view only: sheet order (week, match) of the last series played; later = went further. */
  lastSeries?: number;
}

export interface HeroRow {
  name: string;
  icon: string | null;
  picks: number;
  bans: number;
  wins: number;
  losses: number;
  wr: number;
  rating: number | null;
  k: number;
  d: number;
  a: number;
  sums?: { k: number; d: number; a: number; ratingSum: number; ratingCount: number };
}

/** A decided series off the scheduling sheet (Playoffs workstream owns the fetch). */
export interface PlayoffResult {
  winner: string;
  loser: string;
  /** Sheet division / week / match number, used to order a finished bracket. */
  div?: Division;
  week?: number | null;
  n?: number | null;
  /** True for a division's grand final. */
  final?: boolean;
}
