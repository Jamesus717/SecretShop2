import { logoKey, type LogoMap } from '../teamlogo';
import { POSITIONS, displayName, seededDivision } from './aliases';
import type {
  ComputedPlayers, ComputedTeams, Division, Forfeit, H2HRecord, ImprintPlayer, ImprintTeam, RosterPlayer, Team,
} from './types';

/**
 * Merge Imprint teams + players + the server-computed series records into standings teams.
 * Win/tie/loss and per-player W/L come from computedTeams / computedPlayers (per series, not
 * per game, see imprint-sync.js); imprintTeams / imprintPlayers only supply identity and ratings.
 */
export function buildTeams(
  imprintTeams: ImprintTeam[],
  imprintPlayers: ImprintPlayer[],
  computedTeams: ComputedTeams,
  computedPlayers: ComputedPlayers,
  divisionOverrides: Record<string, Division>,
  forfeits: Forfeit[],
  logos: LogoMap,
  playerNames?: Map<string, string[]>,
  warn: (msg: string) => void = (m) => console.warn(m),
): Map<string, Team> {
  const teams = new Map<string, Team>();
  const teamKeyById = new Map<string, string>(); // Imprint team_id -> our logoKey
  const ratingByAccount = new Map(imprintPlayers.map((p) => [String(p.account_id), p]));

  const blank = (key: string, id: number | string, name: string): Team => ({
    key, id, name: displayName(key, name), logo: null, logoUrl: null, registeredRoster: [],
    wins: 0, ties: 0, losses: 0, matchCount: 0, statsSynced: false, rating: null, ratingLabel: null,
    forfeitWins: 0, forfeitLosses: 0, roster: {}, h2h: {}, division: 'unassigned', statsGap: 0, statsIncomplete: false,
  });

  for (const t of imprintTeams) {
    const key = logoKey(t.team_name);
    teamKeyById.set(String(t.team_id), key);
    const T = blank(key, t.team_id, t.team_name);
    T.logo = t.team_logo_src || null;
    T.registeredRoster = t.players || [];
    T.rating = t.average_team_imprint_rating ?? null;
    T.ratingLabel = t.rating_label ?? null;
    teams.set(key, T);
  }

  // A team can appear under more than one Imprint team_id (re-registered mid-season). The old id
  // resolves to the same team via logoKey(rec.teamName), so records are summed, not overwritten.
  for (const [teamId, rec] of Object.entries(computedTeams || {})) {
    const key = teamKeyById.get(String(teamId)) || logoKey(rec.teamName);
    teamKeyById.set(String(teamId), key);
    let T = teams.get(key);
    if (!T) {
      T = blank(key, Number(teamId) || teamId, rec.teamName);
      teams.set(key, T);
    }
    if (T.statsSynced) {
      T.wins += Number(rec.wins) || 0;
      T.ties += Number(rec.ties) || 0;
      T.losses += Number(rec.losses) || 0;
      T.matchCount += Number(rec.games) || 0;
    } else {
      T.wins = Number(rec.wins) || 0;
      T.ties = Number(rec.ties) || 0;
      T.losses = Number(rec.losses) || 0;
      T.matchCount = Number(rec.games) || 0;
      T.statsSynced = true;
    }
    // Keyed by Imprint team_id for now; translated to our keys once every id is known.
    for (const [oppId, r] of Object.entries(rec.h2h || {})) {
      const book = T.h2hRaw || (T.h2hRaw = {});
      const cur = book[String(oppId)] || (book[String(oppId)] = { wins: 0, ties: 0, losses: 0 });
      cur.wins += Number(r.wins) || 0;
      cur.ties += Number(r.ties) || 0;
      cur.losses += Number(r.losses) || 0;
    }
  }

  for (const T of teams.values()) {
    if (!T.h2hRaw) continue;
    T.h2h = {};
    for (const [oppId, r] of Object.entries(T.h2hRaw)) {
      const oppKey = teamKeyById.get(String(oppId));
      if (!oppKey || oppKey === T.key) continue;
      const cur: H2HRecord = T.h2h[oppKey] || (T.h2h[oppKey] = { wins: 0, ties: 0, losses: 0 });
      cur.wins += r.wins; cur.ties += r.ties; cur.losses += r.losses;
    }
    delete T.h2hRaw;
  }

  const seenAccountsByTeam = new Map<string, Set<string>>();
  for (const [teamId, byPos] of Object.entries(computedPlayers || {})) {
    const key = teamKeyById.get(String(teamId));
    const T = key ? teams.get(key) : null;
    if (!T) continue;
    let seen = seenAccountsByTeam.get(T.key);
    if (!seen) { seen = new Set(); seenAccountsByTeam.set(T.key, seen); }
    for (const [pos, byAccount] of Object.entries(byPos)) {
      const posNum = Number(pos);
      for (const [accountId, rec] of Object.entries(byAccount)) {
        const ratingInfo = ratingByAccount.get(String(accountId));
        const computedRating = rec.ratingCount ? (rec.ratingSum || 0) / rec.ratingCount : null;
        seen.add(String(accountId));
        const p: RosterPlayer = {
          accountId,
          name: rec.name,
          position: posNum,
          wins: Number(rec.wins) || 0,
          losses: Number(rec.losses) || 0,
          matchCount: Number(rec.matchCount) || 0,
          rating: ratingInfo ? (ratingInfo.average_imprint_rating ?? null) : computedRating,
          ratingLabel: ratingInfo ? (ratingInfo.rating_label ?? null) : (rec.ratingLabel || null),
          aka: (playerNames && playerNames.get(String(accountId))) || [],
        };
        (T.roster[posNum] || (T.roster[posNum] = [])).push(p);
      }
    }
  }

  // Registered starters with no recorded games still get a visible slot.
  for (const T of teams.values()) {
    const seen = seenAccountsByTeam.get(T.key) || new Set<string>();
    for (const rp of T.registeredRoster) {
      if (seen.has(String(rp.account_id))) continue;
      const pos = POSITIONS.includes(Number(rp.position)) ? Number(rp.position) : 0;
      const ratingInfo = ratingByAccount.get(String(rp.account_id));
      (T.roster[pos] || (T.roster[pos] = [])).push({
        accountId: rp.account_id,
        name: rp.account_name,
        position: pos,
        wins: 0,
        losses: 0,
        matchCount: 0,
        noGamesRecorded: true,
        rating: ratingInfo ? (ratingInfo.average_imprint_rating ?? null) : null,
        ratingLabel: ratingInfo ? (ratingInfo.rating_label ?? null) : null,
        aka: (playerNames && playerNames.get(String(rp.account_id))) || [],
      });
      seen.add(String(rp.account_id));
    }
  }

  // Forfeits layer on top as decisive series (never a tie).
  for (const f of forfeits) {
    const w = teams.get(f.winner_key);
    const l = teams.get(f.loser_key);
    if (!w || !l) {
      warn(`Forfeit ${f.winner_name} over ${f.loser_name} was not applied: ${!w ? `no team matches winner_key "${f.winner_key}"` : ''} ${!l ? `no team matches loser_key "${f.loser_key}"` : ''}`);
    }
    if (w) { w.wins += 1; w.forfeitWins += 1; }
    if (l) { l.losses += 1; l.forfeitLosses += 1; }
  }

  // Core vs stand-in: most games at the slot wins it (ties -> rating, then name).
  // Position 0 (outside 1-5) is rendered as a stand-in, never core.
  for (const T of teams.values()) {
    for (const pos of [0, ...POSITIONS]) {
      const slot = T.roster[pos];
      if (!slot || !slot.length) continue;
      slot.sort((a, b) => b.matchCount - a.matchCount || (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name));
      slot.forEach((p, i) => { p.isCore = pos !== 0 && i === 0; });
    }
    const maxPosGames = POSITIONS.reduce((m, pos) => Math.max(m, (T.roster[pos] || []).reduce((s, p) => s + p.matchCount, 0)), 0);
    T.statsGap = Math.max(0, T.matchCount - maxPosGames);
    T.statsIncomplete = T.statsSynced && T.statsGap > 0;
    T.division = divisionOverrides[T.key] || seededDivision(T.key) || 'unassigned';
    T.logoUrl = logos.get(T.key) || T.logo || null;
  }

  return teams;
}
