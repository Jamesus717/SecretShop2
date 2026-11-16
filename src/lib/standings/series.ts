// Client-side rebuild of computed_teams / computed_players / computed_heroes from raw series.
// Production reads these from Supabase (imprint-sync.js builds them server-side); ?mock=1 has no
// server, so it rebuilds them here. Mirrors groupMeetingsFromMatches / mergeMeetingIntoComputedTeams /
// mergeSeriesIntoComputedPlayers / mergeSeriesIntoComputedHeroes in functions/api/imprint-sync.js.
// If the real logic changes, mirror the change here.
import type { ComputedHeroRec, ComputedPlayers, ComputedTeams, Game, SeriesData } from './types';

/** First Dota match id of the playoffs (14 Sep 2026). Ids only climb, so an id cutoff is a date cutoff. */
export const PLAYOFFS_FIRST_MATCH_ID = 8995000000;

const ids = (s: SeriesData) => (s.matches || []).map((m) => m.match_id);

export function isGroupStageSeries(s: SeriesData): boolean {
  const i = ids(s);
  return i.length > 0 && i.every((id) => id < PLAYOFFS_FIRST_MATCH_ID);
}

/** series_id 0 is Imprint lumping unrelated games together; it is never a playoff series. */
export function isPlayoffSeries(s: SeriesData): boolean {
  const i = ids(s);
  return Boolean(s.series_id) && i.length > 0 && i.every((id) => id >= PLAYOFFS_FIRST_MATCH_ID);
}

/** One real Bo2 meeting can be split over two series_id fragments, so group fragments by team pair. */
export function groupMeetingsFromBundle(bundle: SeriesData[]): SeriesData[][] {
  const meetings = new Map<string, SeriesData[]>();
  for (const s of bundle) {
    const teamIds = (s.teams || []).map((t) => t.team_id).filter((id) => id != null);
    if (teamIds.length !== 2) continue;
    const pairKey = teamIds.map(Number).sort((a, b) => a - b).join('-');
    const list = meetings.get(pairKey) || [];
    list.push(s);
    meetings.set(pairKey, list);
  }
  return [...meetings.values()];
}

export function mergeMeetingIntoComputedTeams(computed: ComputedTeams, fragments: SeriesData[]): void {
  let aId: number | string | null = null, bId: number | string | null = null;
  let aName = '', bName = '';
  let aWins = 0, bWins = 0, games = 0;
  for (const s of fragments) {
    const sides = s.teams || [];
    if (sides.length !== 2) continue;
    const [a, b] = sides;
    if (aId == null) {
      aId = a.team_id; aName = a.team_name || '';
      bId = b.team_id; bName = b.team_name || '';
    }
    const [thisA, thisB] = a.team_id === aId ? [a, b] : [b, a];
    aWins += Number(thisA.wins) || 0;
    bWins += Number(thisB.wins) || 0;
    games += (s.matches && s.matches.length) || 0;
  }
  if (aId == null || bId == null) return;
  const ensure = (id: number | string, name: string) =>
    (computed[id] || (computed[id] = { teamName: name, wins: 0, ties: 0, losses: 0, games: 0, h2h: {} }));
  const A = ensure(aId, aName), B = ensure(bId, bName);
  A.games += games; B.games += games;
  const h2h = (T: typeof A, oppId: number | string, field: 'wins' | 'ties' | 'losses') => {
    const book = T.h2h || (T.h2h = {});
    const rec = book[oppId] || (book[oppId] = { wins: 0, ties: 0, losses: 0 });
    rec[field]++;
  };
  if (aWins > bWins) { A.wins++; B.losses++; h2h(A, bId, 'wins'); h2h(B, aId, 'losses'); }
  else if (bWins > aWins) { B.wins++; A.losses++; h2h(B, aId, 'wins'); h2h(A, bId, 'losses'); }
  else { A.ties++; B.ties++; h2h(A, bId, 'ties'); h2h(B, aId, 'ties'); }
}

/** Accepts a series or any `{matches}` bag of games. */
export function mergeSeriesIntoComputedPlayers(computed: ComputedPlayers, series: { matches?: Game[] }): void {
  for (const m of series.matches || []) {
    for (const t of m.teams || []) {
      const teamId = t.team_id;
      if (teamId == null) continue;
      const won = !!t.win;
      for (const p of t.players || []) {
        if (p.account_id == null) continue;
        const pos = [1, 2, 3, 4, 5].includes(Number(p.position)) ? Number(p.position) : 0;
        const teamBucket = computed[teamId] || (computed[teamId] = {});
        const posBucket = teamBucket[pos] || (teamBucket[pos] = {});
        const rec = posBucket[p.account_id] || (posBucket[p.account_id] = {
          name: p.account_name || 'Unknown', wins: 0, losses: 0, matchCount: 0,
        });
        rec.name = p.account_name || rec.name;
        rec.matchCount++;
        if (won) rec.wins++; else rec.losses++;
        // A stand-in has recorded games but no entry in /players: keep their per-match ratings.
        if (Number.isFinite(p.imprint_rating)) {
          rec.ratingSum = (rec.ratingSum || 0) + (p.imprint_rating as number);
          rec.ratingCount = (rec.ratingCount || 0) + 1;
          if (p.rating_label) rec.ratingLabel = p.rating_label;
        }
      }
    }
  }
}

export function mergeSeriesIntoComputedHeroes(heroes: Record<string, ComputedHeroRec>, series: SeriesData): void {
  for (const m of series.matches || []) {
    for (const t of m.teams || []) {
      const won = !!t.win;
      for (const p of t.players || []) {
        const name = p.hero && p.hero.name;
        if (!name) continue;
        const rec = heroes[name] || (heroes[name] = {
          name, icon: p.hero?.icon_src || null,
          picks: 0, wins: 0, losses: 0, killSum: 0, deathSum: 0, assistSum: 0, ratingSum: 0, ratingCount: 0,
        });
        rec.icon = rec.icon || p.hero?.icon_src || null;
        rec.picks++;
        if (won) rec.wins++; else rec.losses++;
        rec.killSum += Number(p.kills) || 0;
        rec.deathSum += Number(p.deaths) || 0;
        rec.assistSum += Number(p.assists) || 0;
        if (Number.isFinite(p.imprint_rating)) {
          rec.ratingSum += p.imprint_rating as number;
          rec.ratingCount++;
        }
      }
    }
  }
}

export interface RebuiltFromBundle {
  computedTeams: ComputedTeams;
  computedPlayers: ComputedPlayers;
  computedHeroes: { complete: true; heroes: Record<string, ComputedHeroRec> };
  playoffSeries: Record<string, SeriesData>;
}

/**
 * Split a bundle of series by Dota match id: group-stage series feed the computed_* tables,
 * playoff series are kept raw (as league_data_cache.playoff_series is) and summed on read.
 */
export function rebuildFromBundle(bundle: SeriesData[]): RebuiltFromBundle {
  const group = bundle.filter(isGroupStageSeries);
  const playoffSeries: Record<string, SeriesData> = {};
  for (const s of bundle) if (isPlayoffSeries(s)) playoffSeries[String(s.series_id)] = s;

  const computedTeams: ComputedTeams = {};
  for (const meeting of groupMeetingsFromBundle(group)) mergeMeetingIntoComputedTeams(computedTeams, meeting);
  const computedPlayers: ComputedPlayers = {};
  const heroes: Record<string, ComputedHeroRec> = {};
  for (const s of group) {
    mergeSeriesIntoComputedPlayers(computedPlayers, s);
    mergeSeriesIntoComputedHeroes(heroes, s);
  }
  return { computedTeams, computedPlayers, computedHeroes: { complete: true, heroes }, playoffSeries };
}
