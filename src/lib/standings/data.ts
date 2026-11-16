import { supabase } from '../supabase';
import { fetchTeamLogoMap } from '../teamlogo';
import { fetchPlayoffResults } from '../playoffs/fetch';
import type { RawStandings } from './derive';
import { rebuildFromBundle } from './series';
import type { Division, Forfeit, HeroesPayload, ImprintPlayer, ImprintTeam, SeriesData } from './types';

/** `?mock=1` reads static fixtures from /mock-data instead of Supabase / the Imprint proxy. */
export function isMockMode(search: string = typeof window !== 'undefined' ? window.location.search : ''): boolean {
  return new URLSearchParams(search).has('mock');
}

async function fetchMock<T>(name: string): Promise<T> {
  const res = await fetch(`/mock-data/imprint-${name}.json`);
  if (!res.ok) throw new Error(`Missing mock-data/imprint-${name}.json`);
  const body = await res.json();
  return (body.data || {}) as T;
}

async function fetchImprint<T>(endpoint: string): Promise<T> {
  const res = await fetch(`/api/imprint/${endpoint}`);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) {
    throw new Error((body && body.error) || `Imprint "${endpoint}" request failed (HTTP ${res.status})`);
  }
  return (body.data || {}) as T;
}

interface CacheRow {
  teams: { teams?: ImprintTeam[] } | null;
  players: { players?: ImprintPlayer[] } | null;
  heroes: HeroesPayload | null;
  computed_teams: RawStandings['computedTeams'] | null;
  computed_players: RawStandings['computedPlayers'] | null;
  computed_heroes?: RawStandings['computedHeroes'];
  playoff_series: Record<string, SeriesData> | null;
  updated_at: string | null;
}

/** The single `league_data_cache` row. computed_heroes needs trends-heroes-migration.sql; read without it if absent. */
export async function fetchCacheSnapshot(): Promise<CacheRow | null> {
  const cols = 'teams, players, heroes, match_count, computed_teams, computed_players, playoff_series, updated_at';
  const read = (select: string) => supabase.from('league_data_cache').select(select).eq('id', 'snapshot').maybeSingle();
  try {
    let { data, error } = await read(`${cols}, computed_heroes`);
    if (error) ({ data, error } = await read(cols));
    if (error) throw error;
    return (data as unknown as CacheRow) || null;
  } catch (e) {
    console.error('Could not read league data cache:', e);
    return null;
  }
}

/** account_id -> past display names. */
async function fetchPlayerNames(): Promise<Map<string, string[]>> {
  try {
    const { data, error } = await supabase.from('player_names').select('account_id, aka');
    if (error) throw error;
    const map = new Map<string, string[]>();
    (data || []).forEach((r: { account_id: number | string; aka: string[] | null }) => map.set(String(r.account_id), r.aka || []));
    return map;
  } catch (e) {
    console.error('Could not load player name history:', e);
    return new Map();
  }
}

export async function loadDivisionOverrides(): Promise<Record<string, Division>> {
  try {
    const { data, error } = await supabase.from('team_divisions').select('team_key, division');
    if (error) throw error;
    const map: Record<string, Division> = {};
    (data || []).forEach((r: { team_key: string; division: Division }) => { map[r.team_key] = r.division; });
    return map;
  } catch (e) {
    console.error('Could not load division overrides:', e);
    return {};
  }
}

export async function loadForfeits(): Promise<Forfeit[]> {
  try {
    const { data, error } = await supabase.from('forfeit_matches').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as Forfeit[];
  } catch (e) {
    console.error('Could not load forfeits:', e);
    return [];
  }
}

/** Read everything the page needs. Throws when no source can supply teams. */
export async function loadRawStandings(mock: boolean = isMockMode()): Promise<RawStandings> {
  const [divisionOverrides, forfeits, logos, playerNames, playoffResults] = await Promise.all([
    loadDivisionOverrides(), loadForfeits(), fetchTeamLogoMap(), fetchPlayerNames(),
    // Mock fixtures predate the sheet, so mock mode keeps game-derived playoff records.
    mock ? Promise.resolve(null) : fetchPlayoffResults(),
  ]);

  if (mock) {
    const [teams, players, heroes, bundle] = await Promise.all([
      fetchMock<{ teams?: ImprintTeam[] }>('teams'),
      fetchMock<{ players?: ImprintPlayer[] }>('players'),
      fetchMock<HeroesPayload>('heroes').catch(() => ({} as HeroesPayload)),
      fetchMock<{ series?: SeriesData[] }>('series-bundle').catch((e) => { console.error('mock series-bundle:', e); return { series: [] }; }),
    ]);
    const rebuilt = rebuildFromBundle(bundle.series || []);
    return {
      imprintTeams: teams.teams || [], imprintPlayers: players.players || [], heroesPayload: heroes,
      computedTeams: rebuilt.computedTeams, computedPlayers: rebuilt.computedPlayers,
      computedHeroes: rebuilt.computedHeroes, playoffSeries: rebuilt.playoffSeries,
      divisionOverrides, forfeits, logos, playerNames, lastSyncedAt: null, mock: true,
    };
  }

  const cache = await fetchCacheSnapshot();
  if (cache && cache.teams && cache.players) {
    return {
      imprintTeams: cache.teams.teams || [], imprintPlayers: cache.players.players || [],
      heroesPayload: cache.heroes || {},
      computedTeams: cache.computed_teams || {}, computedPlayers: cache.computed_players || {},
      computedHeroes: cache.computed_heroes || null, playoffSeries: cache.playoff_series || {},
      divisionOverrides, forfeits, logos, playerNames, playoffResults, lastSyncedAt: cache.updated_at || null, mock: false,
    };
  }

  // No cache row yet: fall back to Imprint's own aggregates (no computed records, so teams read "not synced yet").
  const [teams, players, heroes] = await Promise.all([
    fetchImprint<{ teams?: ImprintTeam[] }>('teams'),
    fetchImprint<{ players?: ImprintPlayer[] }>('players'),
    fetchImprint<HeroesPayload>('heroes').catch(() => ({} as HeroesPayload)),
  ]);
  return {
    imprintTeams: teams.teams || [], imprintPlayers: players.players || [], heroesPayload: heroes,
    computedTeams: {}, computedPlayers: {}, computedHeroes: null, playoffSeries: {},
    divisionOverrides, forfeits, logos, playerNames, playoffResults, lastSyncedAt: null, mock: false,
  };
}

/** Admin: upsert a team's division override. RLS is the real gate. */
export async function saveDivision(teamKey: string, teamName: string, division: Division): Promise<void> {
  const { error } = await supabase.from('team_divisions').upsert(
    { team_key: teamKey, team_name: teamName, division, updated_at: new Date().toISOString() },
    { onConflict: 'team_key' },
  );
  if (error) throw error;
}

/** Admin: record a forfeit; resolves to the stored row. */
export async function insertForfeit(w: { key: string; name: string }, l: { key: string; name: string }, note: string): Promise<Forfeit> {
  const { data, error } = await supabase.from('forfeit_matches').insert({
    winner_key: w.key, winner_name: w.name, loser_key: l.key, loser_name: l.name, note: note || null,
  }).select().single();
  if (error) throw error;
  return data as Forfeit;
}

export async function removeForfeit(id: string): Promise<void> {
  const { error } = await supabase.from('forfeit_matches').delete().eq('id', id);
  if (error) throw error;
}

export interface SyncResult { updated?: boolean; newMatches?: number }

/**
 * Pings /api/imprint-sync. force=1 is verified server-side against admin_users, so the caller's
 * access token goes with it. Resolves to null on any failure.
 */
export async function triggerSync(force: boolean): Promise<SyncResult | null> {
  try {
    const headers: Record<string, string> = {};
    if (force) {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('you are not signed in');
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(`/api/imprint-sync${force ? '?force=1' : ''}`, { headers });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) throw new Error((body && body.error) || `sync failed (HTTP ${res.status})`);
    return body as SyncResult;
  } catch (e) {
    // The background (unforced) sync is best-effort: a failure must not look like a page error.
    (force ? console.error : console.warn)('League data sync failed:', e);
    return null;
  }
}
