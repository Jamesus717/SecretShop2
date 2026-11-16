import { logoKey, type LogoMap } from '../teamlogo';
import { buildTeams } from './buildTeams';
import { mergeSeriesIntoComputedPlayers } from './series';
import type {
  ComputedPlayers, ComputedTeams, Division, Game, H2HRecord, HeroRow, ImprintTeam, PlayoffResult, SeriesData, Team,
} from './types';

/**
 * Dota match ids climb about 70k an hour, so games of one Bo3/Bo5 sit well inside this gap and
 * a rematch on a later night sits well outside it.
 */
export const PLAYOFF_MEETING_GAP = 800000;

export interface PlayoffStats {
  computedTeams: ComputedTeams;
  computedPlayers: ComputedPlayers;
  heroes: HeroRow[];
  seriesCount: number;
  gameCount: number;
}

/**
 * Sum every playoff game from scratch (no running totals, so a half-played Bo3 or a rematch
 * never double-counts). A series is decided once someone has two game wins.
 */
export function computePlayoffStats(playoffSeries: Record<string, SeriesData> | null | undefined): PlayoffStats {
  const seen = new Set<number>();
  const games: Game[] = [];
  for (const s of Object.values(playoffSeries || {})) {
    for (const g of (s && s.matches) || []) {
      if ((g.teams || []).length !== 2 || seen.has(g.match_id)) continue;
      seen.add(g.match_id);
      games.push(g);
    }
  }
  games.sort((a, b) => a.match_id - b.match_id);

  const computedPlayers: ComputedPlayers = {};
  mergeSeriesIntoComputedPlayers(computedPlayers, { matches: games });

  const meetings: { games: Game[]; lastId: number }[] = [];
  const lastByPair = new Map<string, { games: Game[]; lastId: number }>();
  for (const g of games) {
    const pair = (g.teams || []).map((t) => Number(t.team_id)).sort((a, b) => a - b).join('-');
    let m = lastByPair.get(pair);
    if (!m || g.match_id - m.lastId > PLAYOFF_MEETING_GAP) {
      m = { games: [], lastId: 0 };
      meetings.push(m);
      lastByPair.set(pair, m);
    }
    m.games.push(g);
    m.lastId = g.match_id;
  }

  const computedTeams: ComputedTeams = {};
  const ensure = (id: number | string, name: string) =>
    (computedTeams[id] || (computedTeams[id] = { teamName: name, wins: 0, ties: 0, losses: 0, games: 0, h2h: {} }));
  let decided = 0;
  for (const m of meetings) {
    const wins = new Map<number | string, number>();
    for (const g of m.games) {
      for (const t of g.teams || []) {
        const T = ensure(t.team_id, t.team_name || '');
        T.teamName = t.team_name || T.teamName; // latest name wins
        T.games++;
        if (t.win) wins.set(t.team_id, (wins.get(t.team_id) || 0) + 1);
      }
    }
    const [a, b] = (m.games[0].teams || []).map((t) => t.team_id);
    const aw = wins.get(a) || 0, bw = wins.get(b) || 0;
    if (Math.max(aw, bw) < 2 || aw === bw) continue;
    decided++;
    const [w, l] = aw > bw ? [a, b] : [b, a];
    computedTeams[w].wins++;
    computedTeams[l].losses++;
    const book = (T: (typeof computedTeams)[string], opp: number | string): H2HRecord => {
      T.h2h = T.h2h || {};
      return T.h2h[opp] || (T.h2h[opp] = { wins: 0, ties: 0, losses: 0 });
    };
    book(computedTeams[w], l).wins++;
    book(computedTeams[l], w).losses++;
  }

  const heroes = new Map<string, { name: string; icon: string | null; picks: number; wins: number; losses: number; k: number; d: number; a: number; ratingSum: number; ratingCount: number }>();
  for (const g of games) {
    for (const t of g.teams || []) {
      for (const p of t.players || []) {
        if (!p.hero || !p.hero.name) continue;
        const h = heroes.get(p.hero.name) || { name: p.hero.name, icon: p.hero.icon_src || null, picks: 0, wins: 0, losses: 0, k: 0, d: 0, a: 0, ratingSum: 0, ratingCount: 0 };
        h.picks++;
        if (t.win) h.wins++; else h.losses++;
        h.k += Number(p.kills) || 0;
        h.d += Number(p.deaths) || 0;
        h.a += Number(p.assists) || 0;
        if (Number.isFinite(p.imprint_rating)) { h.ratingSum += p.imprint_rating as number; h.ratingCount++; }
        heroes.set(p.hero.name, h);
      }
    }
  }
  const heroList: HeroRow[] = [...heroes.values()].map((h) => ({
    sums: { k: h.k, d: h.d, a: h.a, ratingSum: h.ratingSum, ratingCount: h.ratingCount },
    name: h.name, icon: h.icon, picks: h.picks, bans: 0, wins: h.wins, losses: h.losses,
    wr: (h.wins / h.picks) * 100,
    rating: h.ratingCount ? h.ratingSum / h.ratingCount : null,
    k: h.k / h.picks, d: h.d / h.picks, a: h.a / h.picks,
  })).sort((x, y) => y.picks - x.picks || y.wr - x.wr || x.name.localeCompare(y.name));

  return { computedTeams, computedPlayers, heroes: heroList, seriesCount: decided, gameCount: games.length };
}

export interface PlayoffView {
  teams: Map<string, Team>;
  heroes: HeroRow[];
  seriesCount: number;
  gameCount: number;
}

/**
 * Playoff team cards. Imprint's /players ratings are season-long, so they are left out and
 * every rating is the player's average over playoff games. When `results` (decided series off
 * the scheduling sheet, which includes forfeits and games Imprint missed) is given, those
 * replace the game-derived records.
 */
export function buildPlayoffView(
  imprintTeams: ImprintTeam[],
  playoffSeries: Record<string, SeriesData> | null | undefined,
  divisionOverrides: Record<string, Division>,
  logos: LogoMap,
  playerNames?: Map<string, string[]>,
  results?: PlayoffResult[] | null,
): PlayoffView {
  const po = computePlayoffStats(playoffSeries);
  const all = buildTeams(imprintTeams, [], po.computedTeams, po.computedPlayers, divisionOverrides, [], logos, playerNames);

  let decided = po.seriesCount;
  if (results) {
    const byKey = new Map<string, Team>();
    for (const T of all.values()) { byKey.set(logoKey(T.name), T); byKey.set(T.key, T); }
    for (const T of all.values()) { T.wins = 0; T.ties = 0; T.losses = 0; T.h2h = {}; }
    decided = 0;
    for (const r of results) {
      const W = byKey.get(logoKey(r.winner));
      const L = byKey.get(logoKey(r.loser));
      if (!W || !L) continue;
      decided++;
      W.wins++; L.losses++;
      W.statsSynced = true; L.statsSynced = true;
      (W.h2h[L.key] || (W.h2h[L.key] = { wins: 0, ties: 0, losses: 0 })).wins++;
      (L.h2h[W.key] || (L.h2h[W.key] = { wins: 0, ties: 0, losses: 0 })).losses++;
    }
  }

  return {
    teams: new Map([...all].filter(([, T]) => T.statsSynced)),
    heroes: po.heroes,
    seriesCount: decided,
    gameCount: po.gameCount,
  };
}
