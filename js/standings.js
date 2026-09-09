// Standings — "Whole League" view, ported from the Secretshop League scouting
// dashboard onto live Imprint data, plus a Trends tab covering the rest of
// that dashboard's "Whole league" scope (stat tiles, trending/struggling
// heroes, and the full hero pick table) — everything from the reference
// dashboard except the manual "paste match text" / "Enrich from OpenDota"
// workflow, which Imprint's own aggregates make unnecessary here.
//
// The dashboard's own version worked by parsing a big block of pasted match
// text into per-match, per-player rows, then aggregating those into team
// win/loss records and "core five by position" rosters, with stand-ins
// detected as whichever name at a position wasn't the one who played it most.
//
// The Imprint API (proxied through functions/api/imprint so the key never
// reaches the browser) provides most of this server-side — a `players`
// endpoint with each player's Imprint rating, and a `heroes` endpoint with
// league-wide pick/ban/win-rate/KDA/rating stats per hero (this is what
// powers the Trends tab — no OpenDota enrichment needed, Imprint already
// tracks bans itself).
//
// Team win/loss and per-player position/win-loss are the one thing NOT taken
// from Imprint's own aggregates (/teams.wins/losses, /players.wins/losses/
// match_count) — those are counted per game rather than per Bo2 series, and
// their per-team/per-position breakdown has real gaps (a registered starter
// with zero games in /players; a team's per-position total exceeding its own
// match count). Instead, functions/api/imprint-sync.js rebuilds both from
// Imprint's /matches and /series/{id} — the same per-match, per-player data
// that feeds Imprint's own Discord match-result bot — and caches the result
// as computed_teams / computed_players. See the big comment at the top of
// that file for the full story, and buildTeams() below for how it's used.
//
// ---------------------------------------------------------------------
// Caching: normal page loads never call Imprint directly any more. They
// read public.league_data_cache in Supabase (see
// league-data-cache-migration.sql) — a single row holding the last-fetched
// teams/players/heroes payloads plus the computed_teams/
// computed_players rebuild. The only thing that writes to that row is
// functions/api/imprint-sync.js, which standings.js pings once per page
// load in the background: that Function checks Imprint's match id list
// (cheap) and only re-pulls the heavier endpoints if a new match id has
// shown up since the last sync, or an admin forced it. A plain refresh with
// no new games played never re-fetches anything, and a series that's
// already been walked for player detail is never re-requested. See
// imprint-sync.js for the full flow.
//
// Division groupings and forfeited matches aren't things Imprint knows about
// (forfeits especially — a match that was never played), so those live in
// Supabase (team_divisions, forfeit_matches — see standings-migration.sql)
// with the same public-read / admin-write shape as tournament_teams.

import { supabaseClient } from './supabase.js';
import { fetchTeamLogoMap, logoKey } from './teamlogo.js';
import { initials } from './teammodal.js';

const DIV_ORDER = ['upper', 'mid', 'lower', 'unassigned'];
const DIV_LABELS = { upper: 'Upper Division', mid: 'Mid Division', lower: 'Lower Division', unassigned: 'Unassigned' };
const POSITIONS = [1, 2, 3, 4, 5];

// Seeded from the current group stage groupings (js/groupstage.js), so this
// page and Group Stage agree on divisions until an admin moves someone.
// Overrides live in team_divisions and win over this seed.
const DIVISION_SEED_NAMES = {
  upper: ['Midlands Massive', 'N-stitution', 'Institutionalized Mentaly Ill Players', 'Glizzy Gladiators',
          'Golden Retrievers', 'SLOB Team', 'Crêpe stack'],
  mid: ['Ctrl Alt Defeat', 'TaiLungs Accountants', 'Money Talks', 'Imprint Esports', 'The Dark Side of the Map',
        'The Bortymites', 'Free Bans Gang', 'The Truers', '5 Stuns No Brains'],
  lower: ['Catwice', 'Chutney Smugglers', 'FarmVille', 'Herald Royale with Cheese', 'No Sweat', 'D2Ire Rejects']
};
const DIVISION_SEED = {};
for (const [div, names] of Object.entries(DIVISION_SEED_NAMES)) {
  for (const n of names) DIVISION_SEED[logoKey(n)] = div;
}

const STATE = {
  teams: new Map(),   // key -> team
  forfeits: [],
  activeDiv: 'upper', // which division tab is open; survives re-renders
  showStandins: false,
  lastSyncedAt: null,
  trends: {
    heroes: [],        // built from the Imprint /heroes cache — see buildHeroList()
    sortKey: 'wr',
    sortAsc: false,
    query: '',
    minPicks: 0,
    includeUnpicked: false,   // "+ Unpicked heroes" — every Dota hero, even ones with 0 picks AND 0 bans
    includeBanned: false      // "+ Banned (unpicked)" — Imprint heroes with 0 picks but 1+ bans
  },
  // Lazily-loaded full Dota hero roster (name -> {icon}), only fetched the
  // first time "+ Unpicked heroes" is switched on — see ensureFullHeroRoster().
  fullHeroRoster: null
};

// Team and player names come from Imprint (ultimately Steam display names),
// so escape before touching innerHTML.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

function dotabuffUrl(accountId) {
  const id = String(accountId ?? '').trim();
  return /^\d+$/.test(id) ? `https://www.dotabuff.com/players/${id}` : '';
}

function ratingClass(label) {
  const l = String(label || '').toLowerCase();
  if (l.includes('high')) return 'good';
  if (l.includes('low')) return 'bad';
  return 'mid';
}

// ---------- Imprint fetch (fallback path only — see the caching note above) ----------
// Local/preview testing without a working Imprint key: append ?mock=1 to the
// page URL and this reads static JSON files from mock-data/ instead of
// calling /api/imprint/*. Populate those files from the site's own public
// proxy output (no key needed client-side — the Function holds it
// server-side), from a machine that can already load the live site — run:
//   node mock-data/fetch-mock-data.mjs
// which writes imprint-teams.json, imprint-players.json, imprint-matches.json
// and imprint-series-bundle.json (every fully-played meeting's series
// fragments, bundled into one file so mock mode doesn't need to hit
// /api/imprint/series/{id} once per series itself). See mock-data/README.md
// for what each file is for and how to fetch just one by hand if you don't
// want to run the script.
// Inert in normal use — only activates when ?mock=1 is explicitly in the URL,
// so it's harmless to leave in even if this ships to production.
const MOCK_MODE = new URLSearchParams(location.search).has('mock');

async function fetchImprint(endpoint) {
  if (MOCK_MODE) {
    const res = await fetch(`mock-data/imprint-${endpoint}.json`);
    if (!res.ok) {
      throw new Error(`Missing mock-data/imprint-${endpoint}.json — see the comment above fetchImprint() for how to generate it.`);
    }
    const body = await res.json();
    return body.data || {};
  }
  const res = await fetch(`/api/imprint/${endpoint}`);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) {
    throw new Error((body && body.error) || `Imprint "${endpoint}" request failed (HTTP ${res.status})`);
  }
  return body.data || {};
}

// ---------- mock-mode only: computed_teams / computed_players, client-side ----------
// A real page load gets these from Supabase — imprint-sync.js builds them
// server-side from Imprint's /matches + /series/{id} (see the big comment at
// the top of that file). ?mock=1 has no server sync to ask, so it rebuilds
// the same thing itself from imprint-series-bundle.json, the one mock file
// fetch-mock-data.mjs has to hit /series/{id} for (imprint-matches.json is
// only used by fetch-mock-data.mjs itself, to decide which series to bundle
// — standings.js never reads it).
//
// These three functions are intentionally a straight copy of
// groupMeetingsFromMatches() / mergeMeetingIntoComputedTeams() /
// mergeSeriesIntoComputedPlayers() in functions/api/imprint-sync.js, adapted
// to start from an already-fetched bundle of series fragments instead of a
// live /matches + /series/{id} walk, and trimmed of the incremental-merge/
// Supabase bits that only make sense server-side. If the real logic changes,
// mirror the change here too — nothing enforces that automatically, so mock
// mode can drift from production behaviour if this is forgotten (as it did
// once already: this used to read a /fixtures endpoint that 404s for this
// league — see functions/api/imprint-sync.js's header comment for the full
// fixtures -> matches+meetings story).
//
// One real Bo2 meeting between two teams can be split across two separate
// series_id fragments in the bundle (Valve/Imprint quirk, confirmed on this
// league's data), so fragments are grouped by team-pair before their
// wins/losses are summed into one meeting's result.
function mockGroupMeetingsFromBundle(seriesBundle) {
  const meetings = new Map(); // pairKey ("loId-hiId") -> array of seriesData fragments
  for (const seriesData of seriesBundle) {
    const teamIds = ((seriesData && seriesData.teams) || []).map((t) => t.team_id).filter((id) => id != null);
    if (teamIds.length !== 2) continue;
    const pairKey = [...teamIds].sort((a, b) => a - b).join('-');
    const list = meetings.get(pairKey) || [];
    list.push(seriesData);
    meetings.set(pairKey, list);
  }
  return [...meetings.values()];
}

function mockMergeMeetingIntoComputedTeams(computedTeams, seriesDatas) {
  let teamAId = null, teamBId = null, teamAName = null, teamBName = null;
  let aWins = 0, bWins = 0, games = 0;
  for (const seriesData of seriesDatas) {
    const sides = (seriesData && seriesData.teams) || [];
    if (sides.length !== 2) continue;
    const [a, b] = sides;
    if (teamAId == null) {
      teamAId = a.team_id; teamAName = a.team_name;
      teamBId = b.team_id; teamBName = b.team_name;
    }
    const [thisA, thisB] = a.team_id === teamAId ? [a, b] : [b, a];
    aWins += Number(thisA.wins) || 0;
    bWins += Number(thisB.wins) || 0;
    games += (seriesData.matches && seriesData.matches.length) || 0;
  }
  if (teamAId == null) return;
  const ensure = (id, name) => (computedTeams[id] || (computedTeams[id] = { teamName: name, wins: 0, ties: 0, losses: 0, games: 0 }));
  const A = ensure(teamAId, teamAName), B = ensure(teamBId, teamBName);
  A.games += games; B.games += games;
  if (aWins > bWins) { A.wins++; B.losses++; }
  else if (bWins > aWins) { B.wins++; A.losses++; }
  else { A.ties++; B.ties++; }
}

function mockMergeSeriesIntoComputedPlayers(computedPlayers, seriesData) {
  const matches = (seriesData && seriesData.matches) || [];
  for (const m of matches) {
    for (const t of (m.teams || [])) {
      const teamId = t.team_id;
      if (teamId == null) continue;
      const won = !!t.win;
      for (const p of (t.players || [])) {
        if (p.account_id == null) continue;
        const pos = [1, 2, 3, 4, 5].includes(Number(p.position)) ? Number(p.position) : 0;
        const teamBucket = computedPlayers[teamId] || (computedPlayers[teamId] = {});
        const posBucket = teamBucket[pos] || (teamBucket[pos] = {});
        const rec = posBucket[p.account_id] || (posBucket[p.account_id] = {
          name: p.account_name || 'Unknown', wins: 0, losses: 0, matchCount: 0
        });
        rec.name = p.account_name || rec.name;
        rec.matchCount++;
        if (won) rec.wins++; else rec.losses++;

        // Mirrors mergeSeriesIntoComputedPlayers() in imprint-sync.js — see
        // its comment for why this exists (a stand-in or off-roster player
        // has recorded games but no entry in /players at all).
        if (Number.isFinite(p.imprint_rating)) {
          rec.ratingSum = (rec.ratingSum || 0) + p.imprint_rating;
          rec.ratingCount = (rec.ratingCount || 0) + 1;
          if (p.rating_label) rec.ratingLabel = p.rating_label;
        }
      }
    }
  }
}

// ---------- league_data_cache (Supabase) — the normal read path ----------
async function fetchCacheSnapshot() {
  try {
    const { data, error } = await supabaseClient
      .from('league_data_cache')
      .select('teams, players, heroes, match_count, computed_teams, computed_players, updated_at')
      .eq('id', 'snapshot')
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (e) {
    console.error('Could not read league data cache:', e);
    return null;
  }
}

// account_id -> array of past display names ("aka"), built by
// imprint-sync.js from per-match player data. See player_names in
// league-data-cache-migration.sql for why Imprint's /players endpoint alone
// can't tell us this (it only ever reports the CURRENT name).
async function fetchPlayerNames() {
  try {
    const { data, error } = await supabaseClient.from('player_names').select('account_id, aka');
    if (error) throw error;
    const map = new Map();
    (data || []).forEach((r) => map.set(String(r.account_id), r.aka || []));
    return map;
  } catch (e) {
    console.error('Could not load player name history:', e);
    return new Map();
  }
}

// Pings functions/api/imprint-sync.js. Cheap when nothing's changed (one
// small Imprint call, no write); only pulls the full teams/players/heroes
// payloads when a new match id has appeared since the last sync, or force
// is set. See that file for the full flow.
async function triggerSync(force) {
  try {
    // force=1 is verified server-side against admin_users, so send the caller's
    // Supabase access token with it. The plain (unforced) sync needs no auth.
    const headers = {};
    if (force) {
      const { data } = await supabaseClient.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('you are not signed in');
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(`/api/imprint-sync${force ? '?force=1' : ''}`, { headers });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) {
      throw new Error((body && body.error) || `sync failed (HTTP ${res.status})`);
    }
    return body;
  } catch (e) {
    console.error('League data sync failed:', e);
    return null;
  }
}

// ---------- Supabase: division overrides + forfeits ----------
async function loadDivisionOverrides() {
  try {
    const { data, error } = await supabaseClient.from('team_divisions').select('team_key, division');
    if (error) throw error;
    const map = {};
    (data || []).forEach((r) => { map[r.team_key] = r.division; });
    return map;
  } catch (e) {
    console.error('Could not load division overrides:', e);
    return {};
  }
}

async function loadForfeits() {
  try {
    const { data, error } = await supabaseClient.from('forfeit_matches').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.error('Could not load forfeits:', e);
    return [];
  }
}

// ---------- merge Imprint teams + players + our own computed stats into standings ----------
//
// Win/tie/loss and per-player win/loss/game-counts come from computedTeams /
// computedPlayers (built server-side by imprint-sync.js from Imprint's
// /matches + /series/{id} — see the big comment at the top of that file for
// why Imprint's own /teams.wins/losses and /players.wins/losses/match_count
// aren't used directly: they're per-GAME not per-series, and their per-team
// breakdown has real gaps — e.g. a registered starter with zero games in
// /players, or a team's own per-position total exceeding its match count).
// imprintTeams / imprintPlayers now only supply identity (logo, registered
// roster names) and Imprint's own Imprint-rating, which there's no reason to
// recompute.
function buildTeams(imprintTeams, imprintPlayers, computedTeams, computedPlayers, divisionOverrides, forfeits, logos, playerNames) {
  const teams = new Map();
  const teamKeyById = new Map(); // Imprint team_id -> our logoKey, for joining computed*/registered-roster data
  const ratingByAccount = new Map(imprintPlayers.map((p) => [String(p.account_id), p]));

  for (const t of imprintTeams) {
    const key = logoKey(t.team_name);
    teamKeyById.set(String(t.team_id), key);
    teams.set(key, {
      key,
      id: t.team_id,
      name: t.team_name,
      logo: t.team_logo_src || null,
      registeredRoster: t.players || [], // [{account_id, account_name, position}] — the current 5-man roster Imprint has on file, used to fill in a slot even when nobody there has recorded games yet
      wins: 0,
      ties: 0,
      losses: 0,
      matchCount: 0,
      statsSynced: false, // true once computedTeams has this team's series record
      rating: t.average_team_imprint_rating,
      ratingLabel: t.rating_label,
      forfeitWins: 0,
      forfeitLosses: 0,
      roster: {}
    });
  }

  // Win/tie/loss + total games, straight from the server-computed series
  // records (see computeTeamRecords() in imprint-sync.js).
  //
  // A team can appear under more than one Imprint team_id here — confirmed
  // on real data: a team re-registers mid-season (roster/captain changes)
  // and Imprint gives the new registration a fresh team_id, but /teams only
  // ever returns the CURRENT one. The old team_id's completed series still
  // show up in computedTeams, and its name still normalizes to the same
  // logoKey, so it resolves to the SAME team T below — just via the
  // logoKey(rec.teamName) fallback instead of teamKeyById, since /teams
  // doesn't have that old id anymore. So this loop sums into T rather than
  // overwriting it once T already has synced stats, or a team's earlier
  // games (and wins/ties/losses) get silently dropped — exactly what made
  // "matches played" undercount by one re-registered team's older games.
  for (const [teamId, rec] of Object.entries(computedTeams || {})) {
    const key = teamKeyById.get(String(teamId)) || logoKey(rec.teamName);
    // Always register, even when key already existed — so a re-registered
    // team's OLD team_id (absent from /teams) still resolves to T for the
    // computedPlayers merge below, instead of being skipped there too.
    teamKeyById.set(String(teamId), key);
    let T = teams.get(key);
    if (!T) {
      // A team with a completed series that /teams didn't return — keep it
      // visible rather than silently dropping it.
      T = {
        key, id: Number(teamId) || teamId, name: rec.teamName, logo: null, registeredRoster: [],
        wins: 0, ties: 0, losses: 0, matchCount: 0, statsSynced: false, rating: null, ratingLabel: null,
        forfeitWins: 0, forfeitLosses: 0, roster: {}
      };
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
  }

  // Per-player position/win/loss, straight from the server-computed,
  // per-team-per-position rebuild (see mergeSeriesIntoComputedPlayers() in
  // imprint-sync.js). Keyed by team -> position -> account, so a player who
  // transferred teams or covered more than one position gets separate,
  // correctly-scoped rows instead of one account-wide total.
  const seenAccountsByTeam = new Map(); // team key -> Set(account_id) already placed, so the registered-roster fallback below doesn't duplicate them
  for (const [teamId, byPos] of Object.entries(computedPlayers || {})) {
    const key = teamKeyById.get(String(teamId));
    const T = key ? teams.get(key) : null;
    if (!T) continue; // stats for a team we have no other record of at all — nothing sane to attach them to
    const seen = seenAccountsByTeam.get(T.key) || (seenAccountsByTeam.set(T.key, new Set()), seenAccountsByTeam.get(T.key));
    for (const [pos, byAccount] of Object.entries(byPos)) {
      const posNum = Number(pos);
      for (const [accountId, rec] of Object.entries(byAccount)) {
        const ratingInfo = ratingByAccount.get(String(accountId));
        // /players doesn't list every account that's recorded games (a
        // stand-in, or a player who's left every current registered roster —
        // confirmed on real data) — for those, fall back to the average of
        // their own per-match ratings, captured alongside win/loss above
        // (see mergeSeriesIntoComputedPlayers() in imprint-sync.js).
        const computedRating = rec.ratingCount ? rec.ratingSum / rec.ratingCount : null;
        seen.add(String(accountId));
        (T.roster[posNum] || (T.roster[posNum] = [])).push({
          accountId,
          name: rec.name,
          position: posNum,
          wins: Number(rec.wins) || 0,
          losses: Number(rec.losses) || 0,
          matchCount: Number(rec.matchCount) || 0,
          rating: ratingInfo ? ratingInfo.average_imprint_rating : computedRating,
          ratingLabel: ratingInfo ? ratingInfo.rating_label : (rec.ratingLabel || null),
          aka: (playerNames && playerNames.get(String(accountId))) || []
        });
      }
    }
  }

  // Registered starters with zero recorded games (e.g. a player Imprint has
  // on the team's roster but whose games never made it into /series data —
  // confirmed to happen) still get a visible slot instead of the position
  // just reading "no player on record yet".
  for (const T of teams.values()) {
    const seen = seenAccountsByTeam.get(T.key) || new Set();
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
        rating: ratingInfo ? ratingInfo.average_imprint_rating : null,
        ratingLabel: ratingInfo ? ratingInfo.rating_label : null,
        aka: (playerNames && playerNames.get(String(rp.account_id))) || []
      });
      seen.add(String(rp.account_id));
    }
  }

  // Forfeits layer on top as decisive series (never a tie — a no-show has a
  // winner and a loser by definition).
  for (const f of forfeits) {
    const w = teams.get(f.winner_key);
    const l = teams.get(f.loser_key);
    if (w) { w.wins += 1; w.forfeitWins += 1; }
    if (l) { l.losses += 1; l.forfeitLosses += 1; }
  }

  // Core vs. stand-in per position: most games at that slot wins it (ties ->
  // higher rating, then name) — everyone else there is flagged a stand-in.
  // Position 0 = Imprint reported a position outside 1-5 for this game;
  // still rendered (as a stand-in, never core) rather than silently dropped.
  for (const T of teams.values()) {
    for (const pos of [0, ...POSITIONS]) {
      const slot = T.roster[pos];
      if (!slot || !slot.length) continue;
      slot.sort((a, b) => b.matchCount - a.matchCount || (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name));
      slot.forEach((p, i) => { p.isCore = pos !== 0 && i === 0; });
    }
    // A team's games-per-position should always sum to its series-implied
    // game total, now that both come from the same per-match data — a gap
    // just means the per-series backlog (see series_synced_ids in
    // imprint-sync.js) hasn't fully drained yet, which self-heals over the
    // next few page loads.
    const maxPosGames = POSITIONS.reduce((m, pos) => Math.max(m, (T.roster[pos] || []).reduce((s, p) => s + p.matchCount, 0)), 0);
    T.statsGap = Math.max(0, T.matchCount - maxPosGames);
    T.statsIncomplete = T.statsSynced && T.statsGap > 0;
    T.division = divisionOverrides[T.key] || DIVISION_SEED[T.key] || 'unassigned';
    T.logoUrl = logos.get(T.key) || T.logo || null;
  }

  return teams;
}

// ---------- Trends: build a normalized hero list from the Imprint /heroes cache ----------
function buildHeroList(heroesPayload) {
  const heroes = (heroesPayload && heroesPayload.hero_statistics && heroesPayload.hero_statistics.heroes) || [];
  return heroes.map((h) => ({
    name: h.name || 'Unknown hero',
    icon: h.icon_src || h.static_portrait_src || null,
    picks: Number(h.picks) || 0,
    bans: Number(h.bans) || 0,
    wins: Number(h.wins) || 0,
    losses: Number(h.losses) || 0,
    wr: parseFloat(h.win_rate) || 0,
    rating: Number(h.average_imprint_rating) || 0,
    k: Number(h.average_kills) || 0,
    d: Number(h.average_deaths) || 0,
    a: Number(h.average_assists) || 0
  }));
}

// Fuzzy hero-name key, same idea as the reference dashboard's hkey(): strips
// everything but letters/digits and lowercases, so "Anti-Mage" from Imprint
// matches "Antimage" from OpenDota's constants without a maintained mapping.
function hkey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// The full Dota hero roster (every hero in the game, not just ones Imprint
// has picks/bans for) — used only by the "+ Unpicked heroes" toggle, to
// reveal heroes nobody in the league has touched at all. This is OpenDota's
// public, keyless hero-constants endpoint — a static reference list, not
// match data, so it's unrelated to the "no OpenDota enrichment" call made
// for Trends generally. Fetched once and cached for the rest of the session.
async function ensureFullHeroRoster() {
  if (STATE.fullHeroRoster) return STATE.fullHeroRoster;
  try {
    const res = await fetch('https://api.opendota.com/api/constants/heroes');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const constants = await res.json();
    const roster = {};
    for (const id in constants) {
      const h = constants[id];
      if (h && h.localized_name) {
        roster[hkey(h.localized_name)] = {
          name: h.localized_name,
          icon: h.icon ? `https://cdn.cloudflare.steamstatic.com${h.icon}` : null
        };
      }
    }
    STATE.fullHeroRoster = roster;
  } catch (e) {
    console.error('Could not load the full hero list from OpenDota:', e);
    showToast("Couldn't load the full hero list — try again.");
  }
  return STATE.fullHeroRoster;
}

function sortedKeys(teams) {
  return [...teams.keys()].sort((a, b) => {
    const A = teams.get(a), B = teams.get(b);
    // Series win-loss differential, same idea as before just in series units
    // (a tie nets to zero, same as sitting out — it doesn't move this).
    return (B.wins - B.losses) - (A.wins - A.losses) || B.wins - A.wins || A.name.localeCompare(B.name);
  });
}

function groupByDivision(teams, keys) {
  const groups = { upper: [], mid: [], lower: [], unassigned: [] };
  for (const k of keys) (groups[teams.get(k).division] || groups.unassigned).push(k);
  return groups;
}

// ---------- rendering: Group Stage ----------
function renderPlayerRow(p) {
  const url = dotabuffUrl(p.accountId);
  const nameHtml = url
    ? `<a href="${esc(url)}" target="_blank" rel="noopener" title="Dotabuff profile">${esc(p.name)}</a>`
    : esc(p.name);
  const ratingHtml = (p.rating != null)
    ? `<span class="st-rating ${ratingClass(p.ratingLabel)}" title="${esc(p.ratingLabel || '')} Imprint rating">${Number(p.rating).toFixed(1)}</span>`
    : '';
  // "aka" = other display names Imprint has seen this account_id play under,
  // built from per-match data by imprint-sync.js (see player_names in the
  // migration) — Imprint's own /players endpoint only reports the current name.
  const akaHtml = (p.aka && p.aka.length)
    ? `<span class="st-aka" tabindex="0">aka +${p.aka.length}<span class="st-aka-pop"><span class="st-aka-pop__h">Also played as</span>${p.aka.map((n) => `<span class="st-aka-name">${esc(n)}</span>`).join('')}</span></span>`
    : '';
  const wlHtml = p.noGamesRecorded
    ? `<span class="st-player__wl st-player__wl--none" title="Registered on this team's roster, but no games have been recorded for them yet">no games yet</span>`
    : `<span class="st-player__wl">${p.wins}-${p.losses}</span>`;
  return `
    <div class="st-player">
      <span class="st-pos-tag">POS ${p.position || '?'}</span>
      <span class="st-player__name">${nameHtml}${p.isCore ? '' : ' <span class="st-sub-tag">SUB</span>'}</span>
      ${akaHtml}
      ${ratingHtml}
      ${wlHtml}
    </div>`;
}

function renderTeamCard(T) {
  const cores = POSITIONS.map((pos) => (T.roster[pos] || []).find((p) => p.isCore) || null);
  // Position 0 = Imprint reported something outside 1-5 for that game (or a
  // registered player with no position on file) — still shown, just always
  // as a stand-in since there's no slot to call them "core" of.
  const subs = [0, ...POSITIONS].flatMap((pos) => (T.roster[pos] || []).filter((p) => !p.isCore));

  const crest = T.logoUrl
    ? `<img src="${esc(T.logoUrl)}" alt="${esc(T.name)}" loading="lazy">`
    : esc(initials(T.name));

  const forfeitNote = (T.forfeitWins || T.forfeitLosses)
    ? `<span class="st-team__forfeit-flag" title="Includes ${T.forfeitWins} forfeit win(s) and ${T.forfeitLosses} forfeit loss(es)">F</span>`
    : '';

  const recordHtml = T.statsSynced
    ? `<span class="w">${T.wins}W</span>–<span class="t">${T.ties}T</span>–<span class="l">${T.losses}L</span>${forfeitNote}`
    : `<span class="st-team__record--pending" title="This team hasn't had any completed series synced yet">not synced yet</span>`;

  const syncNote = T.statsIncomplete
    ? `<div class="st-sync-note" title="Some of this team's series haven't had their per-player detail pulled from Imprint yet — this fills in automatically over the next few page loads">Player stats still syncing for ${T.statsGap} game(s)</div>`
    : '';

  const rosterHtml = cores.map((p, i) => (
    p ? renderPlayerRow(p) : `<div class="st-empty-slot">Pos ${i + 1} — no player on record yet</div>`
  )).join('');

  const standinsHtml = (STATE.showStandins && subs.length)
    ? `<div class="st-standin-head">Stand-ins (${subs.length})</div>${subs.map(renderPlayerRow).join('')}`
    : '';

  const divOpts = DIV_ORDER.map((d) => (
    `<option value="${d}"${d === T.division ? ' selected' : ''}>${DIV_LABELS[d].replace(' Division', '')}</option>`
  )).join('');

  return `
    <div class="st-team" data-team="${esc(T.key)}">
      <div class="st-team__head">
        <div class="st-team__crest">${crest}</div>
        <div class="st-team__name" title="${esc(T.name)}">${esc(T.name)}</div>
        <div class="st-team__record">${recordHtml}</div>
      </div>
      ${syncNote}
      <div class="st-div-ctrl st-admin-only" data-team="${esc(T.key)}">
        <span class="div-lbl">Div</span>
        <button type="button" class="st-div-move" data-dir="up" data-team="${esc(T.key)}" title="Move up a division">▲</button>
        <select class="st-div-sel" data-team="${esc(T.key)}">${divOpts}</select>
        <button type="button" class="st-div-move" data-dir="down" data-team="${esc(T.key)}" title="Move down a division">▼</button>
      </div>
      <div class="st-roster">${rosterHtml}${standinsHtml}</div>
    </div>`;
}

function render() {
  const box = document.getElementById('stGrid');
  if (!box) return;
  const teams = STATE.teams;
  if (!teams || !teams.size) {
    box.innerHTML = '<div class="st-loading">No standings data yet.</div>';
    return;
  }

  const keys = sortedKeys(teams);
  const groups = groupByDivision(teams, keys);

  // Divisions are tabs rather than one long scroll. Unassigned is always
  // rendered even at zero, so a newly-added team that hasn't been placed yet
  // can't quietly disappear off the page.
  if (!DIV_ORDER.includes(STATE.activeDiv)) STATE.activeDiv = 'upper';

  const tabs = DIV_ORDER.map((div) => {
    const n = groups[div].length;
    const on = div === STATE.activeDiv;
    return `<button type="button" class="st-div-tab${on ? ' active' : ''}${n ? '' : ' st-div-tab--empty'}"
              data-div-tab="${div}" role="tab" aria-selected="${on}">
              ${DIV_LABELS[div].replace(' Division', '')}<span class="st-div-tab__n">${n}</span>
            </button>`;
  }).join('');

  const panels = DIV_ORDER.map((div) => {
    const gks = groups[div];
    const body = gks.length
      ? `<div class="st-grid">${gks.map((k) => renderTeamCard(teams.get(k))).join('')}</div>`
      : `<div class="st-div-empty">${div === 'unassigned'
          ? 'Every team is assigned to a division. Any new team shows up here until an admin places it.'
          : 'No teams in this division yet.'}</div>`;
    return `<div class="st-div-panel" data-div-panel="${div}"${div === STATE.activeDiv ? '' : ' hidden'}>${body}</div>`;
  }).join('');

  box.innerHTML = `<div class="st-div-tabs" role="tablist" aria-label="Division">${tabs}</div>${panels}`;

  box.querySelectorAll('[data-div-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      STATE.activeDiv = btn.dataset.divTab;
      box.querySelectorAll('[data-div-tab]').forEach((b) => {
        const on = b.dataset.divTab === STATE.activeDiv;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      box.querySelectorAll('[data-div-panel]').forEach((p) => {
        p.hidden = p.dataset.divPanel !== STATE.activeDiv;
      });
    });
  });

  const totalMatches = Math.round([...teams.values()].reduce((s, T) => s + T.matchCount, 0) / 2);
  const summaryEl = document.getElementById('stSummary');
  if (summaryEl) summaryEl.textContent = `${teams.size} teams · ${totalMatches} matches played${MOCK_MODE ? ' · MOCK DATA (?mock=1)' : ''}`;

  bindDivisionControls();
}

function bindDivisionControls() {
  document.querySelectorAll('.st-div-sel').forEach((sel) => {
    sel.addEventListener('change', () => setDivision(sel.dataset.team, sel.value));
  });
  document.querySelectorAll('.st-div-move').forEach((btn) => {
    btn.addEventListener('click', () => {
      const T = STATE.teams.get(btn.dataset.team);
      if (!T) return;
      const idx = DIV_ORDER.indexOf(T.division);
      const next = btn.dataset.dir === 'up' ? DIV_ORDER[Math.max(0, idx - 1)] : DIV_ORDER[Math.min(DIV_ORDER.length - 1, idx + 1)];
      if (next !== T.division) setDivision(T.key, next);
    });
  });
}

async function setDivision(key, division) {
  if (!window.__isAdmin) { showToast('Admins only.'); return; }
  const T = STATE.teams.get(key);
  if (!T) return;
  const prev = T.division;
  T.division = division; // optimistic — RLS is the real gate, this just feels instant
  render();
  try {
    const { error } = await supabaseClient.from('team_divisions').upsert({
      team_key: key, team_name: T.name, division, updated_at: new Date().toISOString()
    }, { onConflict: 'team_key' });
    if (error) throw error;
  } catch (e) {
    console.error('Could not save division change:', e);
    T.division = prev;
    render();
    showToast('Could not save — try again.');
  }
}

// ---------- forfeit modal (admin) ----------
function teamOptionsHtml() {
  const keys = [...STATE.teams.keys()].sort((a, b) => STATE.teams.get(a).name.localeCompare(STATE.teams.get(b).name));
  return keys.map((k) => `<option value="${esc(k)}">${esc(STATE.teams.get(k).name)}</option>`).join('');
}

function renderForfeitList() {
  const box = document.getElementById('smList');
  if (!box) return;
  if (!STATE.forfeits.length) {
    box.innerHTML = '<div class="sm-list-empty">No forfeits recorded yet.</div>';
    return;
  }
  box.innerHTML = STATE.forfeits.map((f) => `
    <div class="sm-list-row">
      <div class="sm-list-row__text"><b>${esc(f.winner_name)}</b> beat ${esc(f.loser_name)} by forfeit
        ${f.note ? `<span class="sm-list-row__note">${esc(f.note)}</span>` : ''}
      </div>
      <button type="button" class="sm-list-del" data-id="${esc(f.id)}" title="Remove this forfeit">✕</button>
    </div>`).join('');
  box.querySelectorAll('.sm-list-del').forEach((btn) => btn.addEventListener('click', () => deleteForfeit(btn.dataset.id)));
}

function openForfeitModal() {
  if (!window.__isAdmin) return;
  const overlay = document.getElementById('smOverlay');
  if (!overlay) return;
  const opts = teamOptionsHtml();
  document.getElementById('smWinner').innerHTML = opts;
  document.getElementById('smLoser').innerHTML = opts;
  document.getElementById('smNote').value = '';
  document.getElementById('smErr').style.display = 'none';
  renderForfeitList();
  overlay.classList.add('show');
}

function closeForfeitModal() {
  document.getElementById('smOverlay')?.classList.remove('show');
}

async function submitForfeit() {
  const winnerKey = document.getElementById('smWinner').value;
  const loserKey = document.getElementById('smLoser').value;
  const note = document.getElementById('smNote').value.trim();
  const errEl = document.getElementById('smErr');
  errEl.style.display = 'none';

  if (!winnerKey || !loserKey || winnerKey === loserKey) {
    errEl.textContent = 'Pick two different teams.';
    errEl.style.display = 'block';
    return;
  }

  const winner = STATE.teams.get(winnerKey);
  const loser = STATE.teams.get(loserKey);
  const btn = document.getElementById('smSubmit');
  btn.disabled = true;
  try {
    const { data, error } = await supabaseClient.from('forfeit_matches').insert({
      winner_key: winnerKey, winner_name: winner.name,
      loser_key: loserKey, loser_name: loser.name,
      note: note || null
    }).select().single();
    if (error) throw error;

    STATE.forfeits.unshift(data);
    winner.wins += 1; winner.forfeitWins += 1;
    loser.losses += 1; loser.forfeitLosses += 1;
    document.getElementById('smNote').value = '';
    renderForfeitList();
    render();
    showToast('Forfeit recorded.');
  } catch (e) {
    console.error('Could not record forfeit:', e);
    errEl.textContent = 'Could not save — try again.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
}

async function deleteForfeit(id) {
  if (!confirm("Remove this forfeit? Both teams' records will update.")) return;
  const f = STATE.forfeits.find((x) => x.id === id);
  try {
    const { error } = await supabaseClient.from('forfeit_matches').delete().eq('id', id);
    if (error) throw error;
    STATE.forfeits = STATE.forfeits.filter((x) => x.id !== id);
    if (f) {
      const w = STATE.teams.get(f.winner_key);
      const l = STATE.teams.get(f.loser_key);
      if (w) { w.wins -= 1; w.forfeitWins -= 1; }
      if (l) { l.losses -= 1; l.forfeitLosses -= 1; }
    }
    renderForfeitList();
    render();
    showToast('Forfeit removed.');
  } catch (e) {
    console.error('Could not remove forfeit:', e);
    showToast('Could not remove — try again.');
  }
}

// ---------- rendering: Trends ----------
function heroIconHtml(h) {
  return h.icon ? `<img class="tr-hicon" src="${esc(h.icon)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
}

function renderTrendsTiles() {
  const box = document.getElementById('trTiles');
  if (!box) return;
  const heroes = STATE.trends.heroes;
  const totalPicks = heroes.reduce((s, h) => s + h.picks, 0);
  const totalMatches = Math.round([...STATE.teams.values()].reduce((s, T) => s + T.matchCount, 0) / 2);
  const tiles = [
    [totalMatches, 'matches played'],
    [STATE.teams.size, 'teams tracked'],
    [heroes.length, 'unique heroes'],
    [totalPicks, 'hero picks (league)']
  ];
  box.innerHTML = tiles.map(([v, k]) => (
    `<div class="tr-tile"><div class="tr-tile__v">${v}</div><div class="tr-tile__k">${esc(k)}</div></div>`
  )).join('');
}

function trendsBarColor(wr) {
  if (wr >= 60) return 'var(--accent2)';
  if (wr <= 40) return 'var(--red)';
  return 'var(--st-blue)';
}

function renderTrendsHeroLists() {
  const heroes = STATE.trends.heroes.filter((h) => h.picks >= 2);
  const trending = heroes.filter((h) => h.wr >= 60).sort((a, b) => b.wr - a.wr || b.picks - a.picks).slice(0, 8);
  const struggling = heroes.filter((h) => h.wr <= 40).sort((a, b) => a.wr - b.wr || b.picks - a.picks).slice(0, 8);

  const rowHtml = (h) => `
    <div class="tr-hero-row">
      <div class="tr-hero-row__name">${heroIconHtml(h)}${esc(h.name)}</div>
      <div class="tr-bar-track"><div class="tr-bar-fill" style="width:${Math.max(4, h.wr).toFixed(0)}%;background:${trendsBarColor(h.wr)}"></div></div>
      <div class="tr-hero-row__meta">${h.wr.toFixed(0)}% · ${h.wins}-${h.losses}</div>
    </div>`;

  const trendingEl = document.getElementById('trTrending');
  if (trendingEl) {
    trendingEl.innerHTML = trending.length
      ? trending.map(rowHtml).join('')
      : '<div class="tr-empty">No hero has 2+ games at ≥60% yet.</div>';
  }
  const strugglingEl = document.getElementById('trStruggling');
  if (strugglingEl) {
    strugglingEl.innerHTML = struggling.length
      ? struggling.map(rowHtml).join('')
      : '<div class="tr-empty">No hero has 2+ games at ≤40% yet.</div>';
  }
}

function renderTrendsHeroTable() {
  const state = STATE.trends;

  // Base set: heroes Imprint has picks for. The two toggles below add rows
  // on top of this, same layering as the reference dashboard — a hero that
  // was picked at least once is always shown; the toggles only reveal ones
  // that weren't.
  const pickedHeroes = state.heroes.filter((h) => h.picks > 0);
  let heroes = pickedHeroes.slice();
  const present = new Set(heroes.map((h) => hkey(h.name)));

  // "+ Banned (unpicked)": Imprint already tracks bans per hero even when
  // picks is 0, so this needs no extra fetch — just reveal the rows that
  // are already sitting in state.heroes unfiltered.
  if (state.includeBanned) {
    for (const h of state.heroes) {
      const key = hkey(h.name);
      if (h.picks === 0 && h.bans > 0 && !present.has(key)) {
        heroes.push(h);
        present.add(key);
      }
    }
  }

  // "+ Unpicked heroes": every hero in the game, including ones with zero
  // picks AND zero bans — needs the full roster (see ensureFullHeroRoster).
  if (state.includeUnpicked && STATE.fullHeroRoster) {
    for (const key in STATE.fullHeroRoster) {
      if (present.has(key)) continue;
      const ref = STATE.fullHeroRoster[key];
      heroes.push({
        name: ref.name, icon: ref.icon, picks: 0, bans: 0,
        wins: 0, losses: 0, wr: 0, rating: 0, k: 0, d: 0, a: 0
      });
      present.add(key);
    }
  }

  const maxPicks = heroes.reduce((m, h) => Math.max(m, h.picks), 0);
  const slider = document.getElementById('trMinPicks');
  if (slider) {
    slider.max = Math.max(1, maxPicks);
    if (state.minPicks > maxPicks) state.minPicks = maxPicks;
    slider.value = state.minPicks;
  }
  const sliderVal = document.getElementById('trMinPicksVal');
  if (sliderVal) sliderVal.textContent = state.minPicks > 0 ? `≥${state.minPicks}` : 'any';

  const total = heroes.length;
  const q = state.query.trim().toLowerCase();
  if (q) heroes = heroes.filter((h) => h.name.toLowerCase().includes(q));
  if (state.minPicks > 0) heroes = heroes.filter((h) => h.picks >= state.minPicks);

  const k = state.sortKey, asc = state.sortAsc;
  heroes.sort((a, b) => {
    let av = a[k], bv = b[k];
    if (k === 'name') return asc ? String(av).localeCompare(bv) : String(bv).localeCompare(av);
    if (k === 'kda') { av = a.k + a.a - a.d; bv = b.k + b.a - b.d; }
    return (asc ? av - bv : bv - av) || a.name.localeCompare(b.name);
  });

  const countEl = document.getElementById('trHeroCount');
  if (countEl) {
    countEl.textContent = (q || state.minPicks > 0)
      ? `${heroes.length} shown${state.minPicks > 0 ? ` · ≥${state.minPicks} picks` : ''}`
      : total > pickedHeroes.length ? `${total} shown · ${pickedHeroes.length} picked` : `${pickedHeroes.length} heroes`;
  }

  const tbody = document.getElementById('trHeroTableBody');
  if (tbody) {
    if (!heroes.length) {
      const why = q ? `No hero matches “${esc(q)}”.` : state.minPicks > 0 ? `No hero has been picked ${state.minPicks}+ times.` : 'No hero data yet.';
      tbody.innerHTML = `<tr><td colspan="8" class="tr-empty-cell">${why}</td></tr>`;
    } else {
      tbody.innerHTML = heroes.map((h) => {
        const unpicked = h.picks === 0;
        return `
        <tr class="${unpicked ? 'tr-unpicked' : ''}">
          <td>${heroIconHtml(h)}${esc(h.name)}</td>
          <td class="num">${h.picks}</td>
          <td class="num">${h.bans > 0 ? `<span class="tr-pill bad">${h.bans}</span>` : '0'}</td>
          <td class="num">${h.wins}</td>
          <td class="num">${h.losses}</td>
          <td class="num">${unpicked ? '<span class="tr-pill mid">—</span>' : `<span class="tr-pill ${h.wr >= 60 ? 'good' : h.wr <= 40 ? 'bad' : 'mid'}">${h.wr.toFixed(0)}%</span>`}</td>
          <td class="num">${unpicked ? '—' : h.rating.toFixed(1)}</td>
          <td class="num">${unpicked ? '—' : `${h.k.toFixed(1)}/${h.d.toFixed(1)}/${h.a.toFixed(1)}`}</td>
        </tr>`;
      }).join('');
    }
  }

  document.querySelectorAll('#trHeroTable th[data-k]').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.k === k);
    th.classList.toggle('asc', th.dataset.k === k && asc);
  });

  const noteEl = document.getElementById('trSyncNote');
  if (noteEl) {
    noteEl.textContent = STATE.lastSyncedAt
      ? `Data as of ${new Date(STATE.lastSyncedAt).toLocaleString()}`
      : 'Data as of this page load (live).';
  }
}

function renderTrends() {
  renderTrendsTiles();
  renderTrendsHeroLists();
  renderTrendsHeroTable();
}

async function refreshFromCache() {
  const cache = await fetchCacheSnapshot();
  if (!cache || !cache.teams || !cache.players) return;
  STATE.lastSyncedAt = cache.updated_at || null;
  const [divisionOverrides, logos, playerNames] = await Promise.all([
    loadDivisionOverrides(), fetchTeamLogoMap(), fetchPlayerNames()
  ]);
  STATE.teams = buildTeams(
    cache.teams.teams || [], cache.players.players || [],
    cache.computed_teams || {}, cache.computed_players || {},
    divisionOverrides, STATE.forfeits, logos, playerNames
  );
  STATE.trends.heroes = buildHeroList(cache.heroes || {});
  render();
  renderTrends();
}

// ---------- tabs ----------
function bindTabs() {
  document.querySelectorAll('.st-tab[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const tab = btn.dataset.tab;
      document.querySelectorAll('.st-tab[data-tab]').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      document.querySelectorAll('.st-tabpanel').forEach((panel) => {
        panel.hidden = panel.dataset.tabpanel !== tab;
      });
    });
  });
}

// ---------- toolbar ----------
function bindToolbar() {
  const standinBtn = document.getElementById('stStandinBtn');
  standinBtn?.addEventListener('click', () => {
    STATE.showStandins = !STATE.showStandins;
    standinBtn.textContent = `Stand-ins: ${STATE.showStandins ? 'on' : 'off'}`;
    standinBtn.classList.toggle('on', STATE.showStandins);
    render();
  });

  document.getElementById('stForfeitBtn')?.addEventListener('click', openForfeitModal);
  document.getElementById('smClose')?.addEventListener('click', closeForfeitModal);
  document.getElementById('smOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'smOverlay') closeForfeitModal();
  });
  document.getElementById('smSubmit')?.addEventListener('click', submitForfeit);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeForfeitModal(); });
}

function bindTrendsControls() {
  document.getElementById('trHeroSearch')?.addEventListener('input', (e) => {
    STATE.trends.query = e.target.value;
    renderTrendsHeroTable();
  });
  document.getElementById('trMinPicks')?.addEventListener('input', (e) => {
    STATE.trends.minPicks = +e.target.value;
    renderTrendsHeroTable();
  });
  document.getElementById('trUnpickedBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    STATE.trends.includeUnpicked = !STATE.trends.includeUnpicked;
    btn.classList.toggle('on', STATE.trends.includeUnpicked);
    if (STATE.trends.includeUnpicked && !STATE.fullHeroRoster) {
      const prevText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Loading…';
      await ensureFullHeroRoster();
      btn.disabled = false;
      btn.textContent = prevText;
    }
    renderTrendsHeroTable();
  });
  document.getElementById('trBannedBtn')?.addEventListener('click', (e) => {
    STATE.trends.includeBanned = !STATE.trends.includeBanned;
    e.currentTarget.classList.toggle('on', STATE.trends.includeBanned);
    renderTrendsHeroTable();
  });
  document.querySelectorAll('#trHeroTable th[data-k]').forEach((th) => {
    th.addEventListener('click', () => {
      const k = th.dataset.k;
      if (STATE.trends.sortKey === k) STATE.trends.sortAsc = !STATE.trends.sortAsc;
      else { STATE.trends.sortKey = k; STATE.trends.sortAsc = (k === 'name'); }
      renderTrendsHeroTable();
    });
  });
  document.getElementById('stSyncBtn')?.addEventListener('click', async () => {
    if (!window.__isAdmin) { showToast('Admins only.'); return; }
    const btn = document.getElementById('stSyncBtn');
    const prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Refreshing…';
    const result = await triggerSync(true);
    btn.disabled = false;
    btn.textContent = prevText;
    if (!result) { showToast('Refresh failed — try again.'); return; }
    await refreshFromCache();
    showToast(result.updated ? `Refreshed — ${result.newMatches || 0} new match(es).` : 'Already up to date.');
  });
}

// ---------- boot ----------
async function boot() {
  const grid = document.getElementById('stGrid');
  if (!grid) return;
  bindToolbar();
  bindTabs();
  bindTrendsControls();
  grid.innerHTML = '<div class="st-loading">Loading standings…</div>';

  // auth.js (loaded by js/nav.js) sets window.__isAdmin asynchronously —
  // give it a moment so admin controls aren't hidden on first paint for an
  // admin who just logged in. Same pattern as js/tournament.js.
  let waited = 0;
  while (window.__isAdmin === undefined && waited < 3000) {
    await new Promise((r) => setTimeout(r, 100));
    waited += 100;
  }

  try {
    const [divisionOverrides, forfeits, logos, playerNames] = await Promise.all([
      loadDivisionOverrides(),
      loadForfeits(),
      fetchTeamLogoMap(),
      fetchPlayerNames()
    ]);
    STATE.forfeits = forfeits;

    let teamsPayload, playersPayload, heroesPayload;
    // Win/tie/loss + per-player position stats. On a real page load these
    // only ever come from the Supabase cache (built server-side by
    // imprint-sync.js from Imprint's /matches + /series/{id}, which need the
    // private API key). Mock mode has no Supabase to read, so it rebuilds the
    // same thing client-side from imprint-series-bundle.json (see
    // fetch-mock-data.mjs) using mockGroupMeetingsFromBundle()/
    // mockMergeMeetingIntoComputedTeams()/mockMergeSeriesIntoComputedPlayers()
    // above. The "cache not populated yet" live-fetch fallback below has no
    // equivalent and just leaves these empty — teams show as "not synced
    // yet" there until a real sync has run — see buildTeams()/renderTeamCard().
    let computedTeamsPayload = {}, computedPlayersPayload = {};

    if (MOCK_MODE) {
      let seriesBundlePayload;
      [teamsPayload, playersPayload, heroesPayload, seriesBundlePayload] = await Promise.all([
        fetchImprint('teams'),
        fetchImprint('players'),
        fetchImprint('heroes').catch(() => ({})),
        fetchImprint('series-bundle').catch((e) => { console.error('mock series-bundle:', e); return { series: [] }; })
      ]);
      const bundleSeries = seriesBundlePayload.series || [];
      computedTeamsPayload = {};
      for (const meetingFragments of mockGroupMeetingsFromBundle(bundleSeries)) {
        mockMergeMeetingIntoComputedTeams(computedTeamsPayload, meetingFragments);
      }
      computedPlayersPayload = {};
      for (const s of bundleSeries) mockMergeSeriesIntoComputedPlayers(computedPlayersPayload, s);
    } else {
      const cache = await fetchCacheSnapshot();
      if (cache && cache.teams && cache.players) {
        teamsPayload = cache.teams;
        playersPayload = cache.players;
        heroesPayload = cache.heroes || {};
        computedTeamsPayload = cache.computed_teams || {};
        computedPlayersPayload = cache.computed_players || {};
        STATE.lastSyncedAt = cache.updated_at || null;
      } else {
        // Cache hasn't been populated yet (e.g. right after this shipped, or
        // SUPABASE_SERVICE_ROLE_KEY isn't configured yet) — fall back to a
        // live fetch so the page still works, then sync below seeds the
        // cache for everyone else.
        [teamsPayload, playersPayload, heroesPayload] = await Promise.all([
          fetchImprint('teams'),
          fetchImprint('players'),
          fetchImprint('heroes').catch(() => ({}))
        ]);
      }
    }

    STATE.teams = buildTeams(
      teamsPayload.teams || [], playersPayload.players || [],
      computedTeamsPayload, computedPlayersPayload,
      divisionOverrides, forfeits, logos, playerNames
    );
    STATE.trends.heroes = buildHeroList(heroesPayload);
    render();
    renderTrends();

    if (!MOCK_MODE) {
      // The only place a normal page load can cause Imprint to be re-hit —
      // and even this is a no-op unless a new match id has actually shown up.
      triggerSync(false).then((result) => {
        if (result && result.updated) {
          refreshFromCache().then(() => showToast('Standings updated with the latest match data.'));
        }
      });
    }
  } catch (e) {
    console.error('Could not load standings:', e);
    grid.innerHTML = `<div class="st-error">Could not load standings (${esc(e.message || 'unknown error')}). Try refreshing in a minute.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', boot);
