import type { LogoMap } from '../teamlogo';
import { buildTeams } from './buildTeams';
import { buildHeroList } from './heroes';
import { buildPlayoffView, type PlayoffView } from './playoffs';
import type {
  ComputedHeroes, ComputedPlayers, ComputedTeams, Division, Forfeit, HeroRow, HeroesPayload, ImprintPlayer,
  ImprintTeam, PlayoffResult, SeriesData, Team,
} from './types';

/** Everything read from the cache / Supabase, before it is merged into standings. */
export interface RawStandings {
  imprintTeams: ImprintTeam[];
  imprintPlayers: ImprintPlayer[];
  heroesPayload: HeroesPayload;
  computedTeams: ComputedTeams;
  computedPlayers: ComputedPlayers;
  computedHeroes: ComputedHeroes | null;
  playoffSeries: Record<string, SeriesData>;
  divisionOverrides: Record<string, Division>;
  forfeits: Forfeit[];
  logos: LogoMap;
  playerNames: Map<string, string[]>;
  playoffResults?: PlayoffResult[] | null;
  lastSyncedAt: string | null;
  mock: boolean;
}

export interface Standings {
  teams: Map<string, Team>;
  playoff: PlayoffView;
  heroes: HeroRow[];
  /** Matches played in the group stage plus playoff games. */
  totalMatches: number;
}

/** Pure: merge raw inputs into the three views. Re-run after an admin edit. */
export function deriveStandings(raw: RawStandings): Standings {
  const teams = buildTeams(
    raw.imprintTeams, raw.imprintPlayers, raw.computedTeams, raw.computedPlayers,
    raw.divisionOverrides, raw.forfeits, raw.logos, raw.playerNames,
  );
  const playoff = buildPlayoffView(
    raw.imprintTeams, raw.playoffSeries, raw.divisionOverrides, raw.logos, raw.playerNames, raw.playoffResults,
  );
  const heroes = buildHeroList(raw.heroesPayload, raw.computedHeroes, playoff.heroes);
  const totalMatches = Math.round([...teams.values()].reduce((s, T) => s + T.matchCount, 0) / 2) + playoff.gameCount;
  return { teams, playoff, heroes, totalMatches };
}
