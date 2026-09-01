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
// reaches the browser) already returns that aggregation server-side — team
// win/loss, a `players` endpoint with each player's own position, win/loss
// and Imprint rating, and a `heroes` endpoint with league-wide pick/ban/
// win-rate/KDA/rating stats per hero (this is what powers the Trends tab —
// no OpenDota enrichment needed, Imprint already tracks bans itself).
//
// ---------------------------------------------------------------------
// Caching: normal page loads never call Imprint directly any more. They
// read public.league_data_cache in Supabase (see
// league-data-cache-migration.sql) — a single row holding the last-fetched
// teams/players/heroes payloads. The only thing that writes to that row is
// functions/api/imprint-sync.js, which standings.js pings once per page
// load in the background: that Function checks Imprint's match id list
// (cheap) and only re-pulls the heavier endpoints if a new match id has
// shown up since the last sync, or an admin forced it. A plain refresh with
// no new games played never re-fetches anything, and a match that's already
// finished is never re-requested. See imprint-sync.js for the full flow.
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
// server-side), from a machine that can already load the live site:
//   curl https://secretshopdota.co.uk/api/imprint/teams   -o mock-data/imprint-teams.json
//   curl https://secretshopdota.co.uk/api/imprint/players -o mock-data/imprint-players.json
//   curl https://secretshopdota.co.uk/api/imprint/heroes  -o mock-data/imprint-heroes.json
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

// ---------- league_data_cache (Supabase) — the normal read path ----------
async function fetchCacheSnapshot() {
  try {
    const { data, error } = await supabaseClient
      .from('league_data_cache')
      .select('teams, players, heroes, match_count, updated_at')
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
    const res = await fetch(`/api/imprint-sync${force ? '?force=1' : ''}`);
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

// ---------- merge Imprint teams + players into standings ----------
function buildTeams(imprintTeams, imprintPlayers, divisionOverrides, forfeits, logos, playerNames) {
  const teams = new Map();

  for (const t of imprintTeams) {
    const key = logoKey(t.team_name);
    teams.set(key, {
      key,
      id: t.team_id,
      name: t.team_name,
      logo: t.team_logo_src || null,
      wins: Number(t.wins) || 0,
      losses: Number(t.losses) || 0,
      matchCount: Number(t.match_count) || 0,
      rating: t.average_team_imprint_rating,
      ratingLabel: t.rating_label,
      forfeitWins: 0,
      forfeitLosses: 0,
      roster: {}
    });
  }

  for (const p of imprintPlayers) {
    const teamName = p.team && p.team.team_name;
    if (!teamName) continue;
    const key = logoKey(teamName);
    let T = teams.get(key);
    if (!T) {
      // A player referencing a team /teams didn't return — keep them visible
      // rather than silently dropping the team.
      T = {
        key, id: p.team.team_id, name: teamName, logo: p.team.team_logo_src || null,
        wins: 0, losses: 0, matchCount: 0, rating: null, ratingLabel: null,
        forfeitWins: 0, forfeitLosses: 0, roster: {}
      };
      teams.set(key, T);
    }
    const pos = POSITIONS.includes(Number(p.position)) ? Number(p.position) : 0;
    (T.roster[pos] || (T.roster[pos] = [])).push({
      accountId: p.account_id,
      name: p.account_name,
      position: pos,
      wins: Number(p.wins) || 0,
      losses: Number(p.losses) || 0,
      matchCount: Number(p.match_count) || 0,
      rating: p.average_imprint_rating,
      ratingLabel: p.rating_label,
      aka: (playerNames && playerNames.get(String(p.account_id))) || []
    });
  }

  // Forfeits layer on top of Imprint's own win/loss counts.
  for (const f of forfeits) {
    const w = teams.get(f.winner_key);
    const l = teams.get(f.loser_key);
    if (w) { w.wins += 1; w.forfeitWins += 1; }
    if (l) { l.losses += 1; l.forfeitLosses += 1; }
  }

  // Core vs. stand-in per position: most games at that slot wins it (ties ->
  // higher rating, then name) — everyone else there is flagged a stand-in.
  for (const T of teams.values()) {
    for (const pos of POSITIONS) {
      const slot = T.roster[pos];
      if (!slot || !slot.length) continue;
      slot.sort((a, b) => b.matchCount - a.matchCount || (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name));
      slot.forEach((p, i) => { p.isCore = i === 0; });
    }
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
  return `
    <div class="st-player">
      <span class="st-pos-tag">POS ${p.position || '?'}</span>
      <span class="st-player__name">${nameHtml}${p.isCore ? '' : ' <span class="st-sub-tag">SUB</span>'}</span>
      ${akaHtml}
      ${ratingHtml}
      <span class="st-player__wl">${p.wins}-${p.losses}</span>
    </div>`;
}

function renderTeamCard(T) {
  const cores = POSITIONS.map((pos) => (T.roster[pos] || []).find((p) => p.isCore) || null);
  const subs = POSITIONS.flatMap((pos) => (T.roster[pos] || []).filter((p) => !p.isCore));

  const crest = T.logoUrl
    ? `<img src="${esc(T.logoUrl)}" alt="${esc(T.name)}" loading="lazy">`
    : esc(initials(T.name));

  const forfeitNote = (T.forfeitWins || T.forfeitLosses)
    ? `<span class="st-team__forfeit-flag" title="Includes ${T.forfeitWins} forfeit win(s) and ${T.forfeitLosses} forfeit loss(es)">F</span>`
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
        <div class="st-team__record"><span class="w">${T.wins}W</span>–<span class="l">${T.losses}L</span>${forfeitNote}</div>
      </div>
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

  let html = '';
  for (const div of DIV_ORDER) {
    const gks = groups[div];
    if (!gks.length) continue;
    html += `<div class="st-div-head st-div-head--${div}"><span class="st-div-title">${DIV_LABELS[div]}</span><span class="st-div-count">${gks.length} team${gks.length > 1 ? 's' : ''}</span></div>`;
    html += `<div class="st-grid">${gks.map((k) => renderTeamCard(teams.get(k))).join('')}</div>`;
  }
  box.innerHTML = html;

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
  STATE.teams = buildTeams(cache.teams.teams || [], cache.players.players || [], divisionOverrides, STATE.forfeits, logos, playerNames);
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

    if (MOCK_MODE) {
      [teamsPayload, playersPayload, heroesPayload] = await Promise.all([
        fetchImprint('teams'),
        fetchImprint('players'),
        fetchImprint('heroes').catch(() => ({}))
      ]);
    } else {
      const cache = await fetchCacheSnapshot();
      if (cache && cache.teams && cache.players) {
        teamsPayload = cache.teams;
        playersPayload = cache.players;
        heroesPayload = cache.heroes || {};
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

    STATE.teams = buildTeams(teamsPayload.teams || [], playersPayload.players || [], divisionOverrides, forfeits, logos, playerNames);
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
