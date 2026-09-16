// Playoff brackets.
//
// The schedule is NOT stored here — it is read live from the playoff scheduling
// spreadsheet on every page load, so casters, times, scores and new pairings
// appear on the site as soon as they're typed into the sheet. The sheet is the
// single source of truth; this file only knows how to read and draw it.
//
// The sheet is fetched as CSV straight from Google. That endpoint sends
// `Access-Control-Allow-Origin: *`, so no proxy or Apps Script is needed and
// this keeps working on a purely static deploy. It does require the sheet to
// stay shared as "anyone with the link can view" — if that's ever turned off,
// the fetch 401s and the page falls back to FALLBACK_ROWS below.
//
// Expected columns (matched by header name, case-insensitively, so column ORDER
// can change freely; renaming a header is what would break it — HEADER_ALIASES
// covers the renames that have actually happened, e.g. "#" -> "Match #"):
//   Division | Week | Date of Game | Time | # | Elimination? | Caster Name
//   Analyst Name | Observer | Format | Team 1 Name | Team 2 Name | Score
//   Winner | Stream Link | Notes
//
// Once a match is played, the sheet's "Winner of Match #N" cells get
// overwritten with the team's name. linkResults() recovers those links from
// the Winner/Score columns so the bracket keeps its lines.
//
// Match numbers restart per division ("Middle 1", "Upper 1"), and "Winner of
// match 2" always means match 2 of the same division. Elimination? is Yes for
// the elimination bracket; the highest-week row in a division is its grand
// final and is drawn in the middle of the winners wheel.
//
// A row becomes a bracket match once it has a match number and both team
// cells. Rows without those are drawn as reserved slots for that week, which
// is how a caster assigned to a not-yet-seeded game still shows up.

import { initTeamModal, openTeamModal, initials } from './teammodal.js';
import { fetchTeamLogoMap, resolveTeamImage } from './teamlogo.js';

const SHEET_ID = '1SHBOPLHbh4FURE-EdRUmbrsTk0WTdT-dwVpvZpSpON4';
const SHEET_CSV = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

// Rosters and crests still come from the registration sheet via Apps Script.
const ROSTER_URL = 'https://script.google.com/macros/s/AKfycby727bbYh0mTv8sWjyHe9DJVp5YTkZnTNyAzcxfWJPNXcnbJ32xbyX_QM7CQwlQ5Pie1Q/exec';

const DEFAULT_TIME = '19:00';
const DEFAULT_BO = 3;

// Last known good schedule, used only when the live sheet can't be reached so
// the page isn't blank mid-tournament. Deliberately minimal — the banner tells
// visitors it may be stale rather than passing it off as current.
const FALLBACK_ROWS = [
  { div: 'mid', week: 1, date: '2026-09-14', n: 1, a: 'The Bortymites', b: 'Ctrl Alt Defeat' },
  { div: 'mid', week: 1, date: '2026-09-17', n: 2, a: 'Winner of match 1', b: '5 Stuns No Brains' },
  { div: 'mid', week: 1, date: '2026-09-15', n: 3, a: 'The Truers', b: 'The Dark side of the map' },
  { div: 'mid', week: 1, date: '2026-09-14', n: 4, a: 'Tailungs Accountants', b: 'Money Talks' },
  { div: 'mid', week: 1, date: '2026-09-14', n: 5, a: 'Imprint Esports', b: 'Free Bans Gang' },
  { div: 'mid', week: 2, date: '2026-09-21', n: 6, elim: true, a: 'Loser of match 1', b: 'Loser of match 5' },
  { div: 'mid', week: 2, date: '2026-09-21', n: 7, elim: true, a: 'Winner of match 6', b: 'Loser of match 4' },
  { div: 'mid', week: 2, date: '2026-09-21', n: 8, elim: true, a: 'Loser of match 2', b: 'Loser of match 3' },
  { div: 'mid', week: 2, date: '2026-09-21', n: 9, a: 'Winner of match 2', b: 'Winner of match 3' },
  { div: 'mid', week: 2, date: '2026-09-21', n: 10, a: 'Winner of match 4', b: 'Winner of match 5' },
  { div: 'mid', week: 3, date: '2026-09-28', n: 11, a: 'Winner of match 9', b: 'Winner of match 10' },
  { div: 'mid', week: 3, date: '2026-09-28', n: 12, elim: true, a: 'Winner of match 7', b: 'Loser of match 9' },
  { div: 'mid', week: 3, date: '2026-09-28', n: 13, elim: true, a: 'Winner of match 8', b: 'Loser of match 10' },
  { div: 'mid', week: 4, date: '2026-09-30', n: 14, elim: true, a: 'Winner of match 12', b: 'Winner of match 13' },
  { div: 'mid', week: 5, date: '2026-10-05', n: 15, elim: true, a: 'Winner of match 14', b: 'Loser of match 11' },
  { div: 'mid', week: 6, n: 16, bo: 5, a: 'Winner of match 15', b: 'Winner of match 11' },
  { div: 'upper', week: 1, date: '2026-09-15', n: 1, a: 'Glizzy Gladiators', b: 'Midland Massive' },
  { div: 'upper', week: 2, date: '2026-09-22', n: 2, a: 'N-Sitution', b: 'Winner of match 1' },
  { div: 'upper', week: 2, date: '2026-09-22', n: 3, a: 'Slob Team', b: 'Golden Retrievers' },
  { div: 'upper', week: 3, date: '2026-09-29', n: 4, a: 'Winner of match 2', b: 'Winner of match 3' },
  { div: 'upper', week: 3, date: '2026-09-29', n: 5, elim: true, a: 'Loser of match 1', b: 'Loser of match 3' },
  { div: 'upper', week: 4, date: '2026-09-30', n: 6, elim: true, a: 'Winner of match 5', b: 'Loser of match 2' },
  { div: 'upper', week: 5, date: '2026-10-06', n: 7, elim: true, a: 'Winner of match 6', b: 'Loser of match 4' },
  { div: 'upper', week: 6, n: 8, bo: 5, a: 'Winner of match 7', b: 'Winner of match 4' },
  { div: 'lower', week: 1, date: '2026-09-15', n: 1, a: 'No Sweat', b: 'Chutney Smugglers' },
  { div: 'lower', week: 1, date: '2026-09-15', n: 2, a: 'D2Ire Rejects', b: 'Herald Royale' },
  { div: 'lower', week: 2, date: '2026-09-22', n: 3, a: 'Farmville', b: 'Winner of match 1' },
  { div: 'lower', week: 2, date: '2026-09-23', n: 4, a: 'Catwice', b: 'Winner of match 2' },
  { div: 'lower', week: 3, date: '2026-09-30', n: 5, a: 'Winner of match 3', b: 'Winner of match 4' },
  { div: 'lower', week: 3, date: '2026-09-30', n: 6, elim: true, a: 'Loser of match 1', b: 'Loser of match 3' },
  { div: 'lower', week: 3, date: '2026-09-30', n: 7, elim: true, a: 'Loser of match 2', b: 'Loser of match 4' },
  { div: 'lower', week: 4, date: '2026-10-05', n: 8, elim: true, a: 'Winner of match 6', b: 'Winner of match 7' },
  { div: 'lower', week: 5, date: '2026-10-07', n: 9, elim: true, a: 'Winner of match 8', b: 'Loser of match 5' },
  { div: 'lower', week: 6, n: 10, bo: 5, a: 'Winner of match 9', b: 'Winner of match 5' }
];

const DIVISIONS = [
  { key: 'upper', label: 'Upper' },
  { key: 'mid',   label: 'Mid' },
  { key: 'lower', label: 'Lower' }
];

// The sheet writes divisions as Upper / Middle / Lower (sometimes with a
// trailing space); the rest of the site uses upper / mid / lower.
const DIVISION_KEYS = { upper: 'upper', middle: 'mid', mid: 'mid', lower: 'lower' };

// Sheet spellings that don't normalise onto the registered team name. Every
// other difference (case, spacing, "TaiLungs" vs "Tailungs") is handled by
// normName, so only genuine mismatches belong here.
const TEAM_ALIASES = {
  'midland massive': 'Midlands Massive',
  'herald royale': 'Herald Royale with Cheese',
  'n-sitution': 'N-stitution',
  'tailung accountants': 'TaiLungs Accountants'
};

const HEADERS = [
  'Division', 'Week', 'Date of Game', 'Time', '#', 'Elimination?', 'Caster Name', 'Analyst Name',
  'Observer', 'Format', 'Team 1 Name', 'Team 2 Name', 'Score', 'Winner', 'Stream Link', 'Notes'
];

// Header renames seen (or likely) on the sheet, keyed lower-case with spaces collapsed.
const HEADER_ALIASES = {
  'match #': '#', 'match#': '#', 'match no': '#', 'match no.': '#', 'match number': '#', 'match': '#'
};

// The wheel puts a name under every crest, so long registered names get a short
// form. Anything not listed here renders as-is.
const SHORT_NAMES = {
  'Herald Royale with Cheese': 'Herald Royale',
  'The Dark Side of the Map': 'Dark Side',
  'TaiLungs Accountants': 'TaiLungs',
  'Chutney Smugglers': 'Chutney',
  'Golden Retrievers': 'Golden Ret.',
  'Glizzy Gladiators': 'Glizzy Glads',
  'Midlands Massive': 'Midlands',
  'The Bortymites': 'Bortymites',
  'Ctrl Alt Defeat': 'Ctrl Alt Def',
  '5 Stuns No Brains': '5 Stuns',
  'Free Bans Gang': 'Free Bans',
  'Imprint Esports': 'Imprint'
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Wheel geometry ───────────────────────────────────────────────
// One square viewBox with the centre in the middle; everything else is polar.
const VB = 1160;                            // viewBox width and height
const C = VB / 2;                           // centre
const R_TEAM = 372;                         // crest centres sit on this rim
const CREST_R = 40;
const R_HUB = 134;                          // the division final, in the middle
const NODE_R = 21;                          // match junction

// Match rings stop short of the crests rather than running all the way out to
// them — without this the outermost ring collides with the rim once the hub
// grows.
const R_RINGS_OUTER = R_TEAM - CREST_R - 20;

// Team names are centred under their crest, which works at the top and bottom
// of the wheel but would sit on top of the crest at 3 and 9 o'clock. Pushing
// the label out by its own half-width, scaled by how horizontal the spoke is,
// clears it without spacing every other label out to match. Width is estimated
// from the character count rather than measured — a second layout pass to
// measure text isn't worth it for a ±10px nudge.
function labelHalfWidth(text) {
  return Math.max(20, String(text).length * 5.4);
}

function labelRadius(angle, text) {
  const horizontal = Math.abs(Math.cos((angle * Math.PI) / 180));
  return R_TEAM + CREST_R + 16 + labelHalfWidth(text) * horizontal;
}

// Everything below renders into innerHTML and every string on this page comes
// from a spreadsheet strangers can type into, so escape without exception.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function normName(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

// ── CSV ──────────────────────────────────────────────────────────
// Hand-rolled rather than pulled from a CDN: it's ~25 lines, and the Notes
// column already contains commas and will eventually contain quotes.

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }   // escaped quote
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  row.push(field);
  rows.push(row);

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** A sheet header -> the name parseRow reads it by. Unknown headers pass through. */
function canonicalHeader(raw) {
  const key = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  return HEADER_ALIASES[key] || HEADERS.find((h) => h.toLowerCase() === key) || raw.trim();
}

/** CSV rows -> objects keyed by canonical header name. */
function toRecords(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(canonicalHeader);
  return rows.slice(1).map((r) => {
    const rec = {};
    headers.forEach((h, i) => { rec[h] = (r[i] ?? '').trim(); });
    return rec;
  });
}

// ── Field parsing ────────────────────────────────────────────────

/** "07-09-2026" -> "2026-09-07". Blank or "TBD" -> null. */
function parseDate(raw) {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec((raw || '').trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** "19:00 BST" -> "19:00". Blank or "TBD" -> null. */
function parseTime(raw) {
  const m = /^(\d{1,2}:\d{2})/.exec((raw || '').trim());
  return m ? m[1] : null;
}

/** "Bo3" -> 3. */
function parseBo(raw) {
  const m = /(\d+)/.exec(raw || '');
  return m ? Number(m[1]) : DEFAULT_BO;
}

/** "2-0" / "2 – 1" -> [2, 0]. Anything else -> null. */
function parseScore(raw) {
  const m = /^(\d+)\s*[-–—:]\s*(\d+)$/.exec((raw || '').trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * A team cell: a name, or a pointer at another match. The sheet writes those
 * pointers inconsistently ("Winner of Match #1", "Loser of Match # 3",
 * "Winner of Match 8"), so the number is pulled out loosely.
 */
function parseSlot(raw) {
  const t = (raw || '').trim();
  if (!t) return null;

  // "Winner of match 2", "Winner of Match # 2", "Winner of match11", "Winner of 14".
  const ref = /^(winner|loser)\s+of\s+(?:match\s*)?#?\s*(\d+)$/i.exec(t);
  if (ref) {
    const n = Number(ref[2]);
    return ref[1].toLowerCase() === 'winner' ? { winnerOf: n } : { loserOf: n };
  }
  return { team: t };
}

function parseRow(rec) {
  const div = DIVISION_KEYS[(rec['Division'] || '').trim().toLowerCase()];
  if (!div) return null;

  // Numbers restart in each division and are written "Middle 1" / "Upper 3",
  // so only the trailing number counts. "Winner of match 2" means match 2 of
  // the same division.
  const num = /(\d+)\s*$/.exec(rec['#'] || '');
  const n = num ? Number(num[1]) : null;
  const week = /^\d+$/.test(rec['Week'] || '') ? Number(rec['Week']) : null;

  return {
    div,
    week,
    n,
    date: parseDate(rec['Date of Game']),
    time: parseTime(rec['Time']),
    bo: parseBo(rec['Format']),
    elim: /^y/i.test(rec['Elimination?'] || ''),
    a: parseSlot(rec['Team 1 Name']),
    b: parseSlot(rec['Team 2 Name']),
    caster: (rec['Caster Name'] || '').trim(),
    analyst: (rec['Analyst Name'] || '').trim(),
    observer: (rec['Observer'] || '').trim(),
    stream: (rec['Stream Link'] || '').trim(),
    score: parseScore(rec['Score']),
    winner: (rec['Winner'] || '').trim(),
    notes: (rec['Notes'] || '').trim()
  };
}

/** The offline seed uses the same shape as a parsed sheet row. */
function fallbackRows() {
  return FALLBACK_ROWS.map((r) => ({
    div: r.div,
    week: r.week,
    n: r.n ?? null,
    date: r.date ?? null,
    time: null,
    bo: r.bo ?? DEFAULT_BO,
    elim: Boolean(r.elim),
    a: parseSlot(r.a),
    b: parseSlot(r.b),
    caster: '', analyst: '', observer: '', stream: '',
    score: null, winner: '', notes: ''
  }));
}

// ── Team name resolution ─────────────────────────────────────────
// The scheduling sheet and the registration sheet are typed by different
// people, so a name from one has to be matched back to the other before a
// crest or roster will resolve.

function resolveTeamName(raw) {
  const name = (raw || '').trim();
  if (!name) return name;

  const alias = TEAM_ALIASES[name.toLowerCase()];
  if (alias) return alias;

  const key = normName(name);
  if (ROSTER_NAMES.has(key)) return ROSTER_NAMES.get(key);

  // "Herald Royale" for "Herald Royale with Cheese" — captains shorten names in
  // the scheduling sheet, so accept an unambiguous prefix.
  const prefixed = [...ROSTER_NAMES.keys()].filter((k) => k.startsWith(key) && key.length >= 5);
  if (prefixed.length === 1) return ROSTER_NAMES.get(prefixed[0]);

  return name;
}

function sameTeam(x, y) {
  return Boolean(x && y) && normName(resolveTeamName(x)) === normName(resolveTeamName(y));
}

function findMatch(div, n) {
  return ROWS.find((m) => m.div === div && m.n === n && m.a && m.b) || null;
}

/**
 * The team in a slot, if known: its name, or for "Winner/Loser of match N" the
 * team that match's result puts there. Null while still undecided. `depth`
 * only guards against a sheet typo that makes a match point at itself.
 */
function slotTeam(slot, div, depth = 0) {
  if (!slot || depth > 20) return null;
  if (slot.team) return resolveTeamName(slot.team);
  const ref = slot.winnerOf ?? slot.loserOf;
  const m = ref != null ? findMatch(div, ref) : null;
  if (!m) return null;
  const won = matchWinner(m, depth + 1);
  if (!won) return null;
  const side = slot.winnerOf != null ? won : (won === 'a' ? 'b' : 'a');
  return slotTeam(m[side], div, depth + 1);
}

/** 'a' or 'b' for a decided match, from the Winner column or failing that the score. */
function matchWinner(m, depth = 0) {
  if (m.winner) {
    for (const side of ['a', 'b']) {
      if (sameTeam(m.winner, slotTeam(m[side], m.div, depth + 1))) return side;
    }
  }
  if (Array.isArray(m.score) && m.score[0] !== m.score[1]) return m.score[0] > m.score[1] ? 'a' : 'b';
  return null;
}

/**
 * Put back the bracket links the sheet loses when "Winner of Match #N" is
 * overwritten with a team name. A named team is linked to its own most recent
 * earlier match in the division: winnerOf if it won that, loserOf if it
 * dropped from it. Derived links sit alongside `team`, so the name still
 * displays. Re-runnable — rosters can change how names resolve.
 */
function linkResults(rows) {
  const matches = rows.filter((m) => m.n != null && m.a && m.b).sort((x, y) => x.n - y.n);

  for (const m of matches) {
    for (const slot of [m.a, m.b]) {
      if (slot.derived) { delete slot.winnerOf; delete slot.loserOf; delete slot.derived; }
    }
  }

  // A match still named by a pointer somewhere is already linked; don't claim it twice.
  const pointed = new Set();
  for (const m of matches) {
    for (const slot of [m.a, m.b]) {
      if (!slot.team) pointed.add(`${m.div}|${slot.winnerOf ?? ''}|${slot.loserOf ?? ''}`);
    }
  }

  for (const m of matches) {
    for (const slot of [m.a, m.b]) {
      if (!slot.team) continue;
      const prev = matches
        .filter((p) => p.div === m.div && p.n < m.n
          && [p.a, p.b].some((s) => sameTeam(slotTeam(s, p.div), slot.team)))
        .pop();
      if (!prev) continue;
      const won = matchWinner(prev);
      if (!won) continue;
      const wonIt = sameTeam(slotTeam(prev[won], prev.div), slot.team);
      const key = wonIt ? `${m.div}|${prev.n}|` : `${m.div}||${prev.n}`;
      if (pointed.has(key)) continue;
      if (wonIt) slot.winnerOf = prev.n; else slot.loserOf = prev.n;
      slot.derived = true;
    }
  }
  return rows;
}

function shortName(name) {
  return SHORT_NAMES[name] || name;
}

function hasCrew(m) {
  return Boolean(m.caster || m.analyst || m.observer);
}

function fmtDate(iso) {
  if (!iso) return 'TBD';
  const [y, m, d] = iso.split('-').map(Number);
  const dow = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dow} ${d} ${MONTHS[m - 1]}`;
}

/** Human text for a match slot: a team name, or where its occupant comes from. */
function slotText(slot, div) {
  if (!slot) return 'TBD';
  const team = slotTeam(slot, div);
  if (team) return team;
  if (slot.winnerOf != null) return `Winner of #${slot.winnerOf}`;
  if (slot.loserOf != null) return `Loser of #${slot.loserOf}`;
  return 'TBD';
}

function crewText(m) {
  return [
    m.caster ? `Cast: ${m.caster}` : '',
    m.analyst ? `Analyst: ${m.analyst}` : '',
    m.observer ? `Observer: ${m.observer}` : ''
  ].filter(Boolean).join(' · ');
}

function matchSummary(m) {
  const when = `${fmtDate(m.date)}${m.time ? `, ${m.time} BST` : ''}`;
  return `Match #${m.n} · Bo${m.bo} · ${when}`
    + `\n${slotText(m.a, m.div)} vs ${slotText(m.b, m.div)}`
    + (m.elim ? '\nElimination bracket — the loser is out.' : '')
    + (hasCrew(m) ? `\n${crewText(m)}` : '');
}

// ── Bracket tree ─────────────────────────────────────────────────
// Each division has two wheels: the winners bracket and the elimination
// bracket, toggled with a button. Both are trees read straight off the sheet's
// "Winner of match N" links, rooted at the match drawn in the hub:
//   winners — the grand final. Its slot fed from the elimination side is a
//             single "Winner of Elim Bracket" crest on the rim.
//   elim    — the elimination final, the elim match the grand final points at.
// Teams dropping in from the winners bracket ("Loser of match 3") are crests
// on the rim of the elimination wheel.

function bracketMatches(divKey) {
  const final = finalRow(divKey);
  return ROWS.filter((m) => m.div === divKey && m.n != null && m.a && m.b && m !== final);
}

/** The last round on the sheet for a division — its grand final. */
function finalRow(divKey) {
  const div = ROWS.filter((m) => m.div === divKey && m.week != null);
  if (!div.length) return null;
  const maxWeek = Math.max(...div.map((m) => m.week));
  const last = div.filter((m) => m.week === maxWeek);
  return last[last.length - 1];
}

function hasElim(divKey) {
  return bracketMatches(divKey).some((m) => m.elim);
}

function viewPool(divKey, view) {
  return bracketMatches(divKey).filter((m) => (view === 'elim' ? m.elim : !m.elim));
}

/** The match drawn in the middle of a wheel. */
function hubMatch(divKey, view) {
  const final = finalRow(divKey);
  if (view !== 'elim') return final;

  const pool = viewPool(divKey, 'elim');
  const pointedAt = final && [final.a, final.b].map((s) => s && s.winnerOf).find((n) => pool.some((m) => m.n === n));
  if (pointedAt != null) return pool.find((m) => m.n === pointedAt);

  // Grand final not seeded yet: the last elim match nothing else feeds from.
  const fed = new Set(pool.flatMap((m) => [m.a.winnerOf, m.b.winnerOf]));
  return pool.filter((m) => !fed.has(m.n)).sort((x, y) => y.n - x.n)[0] || null;
}

function buildWheel(divKey, view = 'winners') {
  const hub = hubMatch(divKey, view);
  const pool = viewPool(divKey, view).filter((m) => m !== hub);
  const byNum = new Map(pool.map((m) => [m.n, m]));
  const elimNums = new Set(viewPool(divKey, 'elim').map((m) => m.n));
  const seen = new Set();
  const matchNodes = [];
  const leaves = [];

  function leafFor(slot) {
    const name = slotTeam(slot, divKey);
    const elimWinner = !name && view !== 'elim' && slot && elimNums.has(slot.winnerOf);
    const leaf = {
      kind: 'leaf',
      name,
      elimWinner,
      ref: slot && !name ? (slot.winnerOf != null ? `W${slot.winnerOf}` : slot.loserOf != null ? `L${slot.loserOf}` : null) : null,
      label: elimWinner ? 'Winner of Elim Bracket' : slotText(slot, divKey),
      slot: leaves.length
    };
    leaves.push(leaf);
    return leaf;
  }

  function childFor(slot, ring) {
    const n = slot && slot.winnerOf;
    return n != null && byNum.has(n) && !seen.has(n) ? walk(byNum.get(n), ring) : leafFor(slot);
  }

  function walk(m, ring) {
    seen.add(m.n);
    const node = { kind: 'match', match: m, ring, children: [] };
    matchNodes.push(node);
    node.children = [childFor(m.a, ring + 1), childFor(m.b, ring + 1)];
    // Sits at the angular midpoint of whatever feeds it, so branches never cross.
    node.slot = (node.children[0].slot + node.children[1].slot) / 2;
    return node;
  }

  // Solid spokes for what the hub match actually names; dashed for anything
  // it doesn't reach (hub not seeded yet, or a typo breaking a chain), so no
  // match silently drops off the wheel.
  const hubChildren = [];
  if (hub && hub.a && hub.b) {
    if (hub.n != null) seen.add(hub.n);
    hubChildren.push({ node: childFor(hub.a, 1), dashed: false }, { node: childFor(hub.b, 1), dashed: false });
  }
  const fed = new Set(pool.flatMap((m) => [m.a.winnerOf, m.b.winnerOf]));
  pool.filter((m) => !seen.has(m.n) && !fed.has(m.n)).sort((x, y) => x.n - y.n)
    .forEach((m) => { if (!seen.has(m.n)) hubChildren.push({ node: walk(m, 1), dashed: true }); });

  const maxRing = matchNodes.reduce((mx, n) => Math.max(mx, n.ring), 1);

  // Rotate so the biggest branch into the hub splits at 12 o'clock, the way a
  // printed bracket splits left from right. Whatever else feeds the hub (the
  // elim winner's crest, say) then lands towards the bottom.
  const total = leaves.length || 1;
  const step = 360 / total;
  let split = total / 2;
  const primary = hubChildren.reduce((best, c) => (!best || countLeaves(c.node) > countLeaves(best.node) ? c : best), null);
  if (hubChildren.every((c) => c.dashed) && hubChildren.length > 1) {
    split = countLeaves(hubChildren[0].node);
  } else if (primary && primary.node.kind === 'match') {
    const before = hubChildren.slice(0, hubChildren.indexOf(primary)).reduce((s, c) => s + countLeaves(c.node), 0);
    split = before + countLeaves(primary.node.children[0]);
  }
  const base = -90 - (split - 0.5) * step;
  const angleOf = (slot) => base + slot * step;

  // Ring 1 is nearest the hub; the outermost ring of matches stops short of the
  // crests so the spokes into them stay visible.
  const ringR = (ring) => R_HUB + (R_RINGS_OUTER - R_HUB) * (ring / (maxRing + 1));

  return { hub, hubChildren, matchNodes, leaves, angleOf, ringR };
}

function countLeaves(node) {
  if (node.kind === 'leaf') return 1;
  return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

// ── Wheel rendering ──────────────────────────────────────────────

function pt(r, deg) {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function xy(r, deg) {
  const [x, y] = pt(r, deg);
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

/** Radial-then-arc connector: straight in to the parent's ring, then round to it. */
function edgePath(childAngle, childR, parentAngle, parentR) {
  const sweep = parentAngle > childAngle ? 1 : 0;
  return `M${xy(childR, childAngle)} L${xy(parentR, childAngle)}`
    + ` A${parentR.toFixed(1)} ${parentR.toFixed(1)} 0 0 ${sweep} ${xy(parentR, parentAngle)}`;
}

function crestMarkup(leaf, angle, view) {
  const [x, y] = pt(R_TEAM, angle);
  const cx = x.toFixed(1);
  const cy = y.toFixed(1);
  const logo = leaf.name ? CRESTS.get(normName(leaf.name)) : null;
  const clipId = `po-clip-${view}-${leaf.slot}`;
  const roster = Boolean(leaf.name && ROSTERS.has(normName(leaf.name)));

  // Undecided slots show where they come from ("L3" = loser of match 3); the
  // elim-winner crest is a shortcut across to the other wheel.
  const text = leaf.elimWinner ? 'ELIM' : leaf.name ? initials(leaf.label) : (leaf.ref || '?');
  const face = logo
    ? `<clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${CREST_R}"/></clipPath>
       <image href="${esc(logo)}" x="${(x - CREST_R).toFixed(1)}" y="${(y - CREST_R).toFixed(1)}"
              width="${CREST_R * 2}" height="${CREST_R * 2}"
              preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`
    : `<circle class="po-wheel__crest-fill" cx="${cx}" cy="${cy}" r="${CREST_R}"/>
       <text class="po-wheel__initials${leaf.name ? '' : ' po-wheel__initials--small'}" x="${cx}" y="${cy}">${esc(text)}</text>`;

  const label = leaf.elimWinner ? 'Elim Winner' : shortName(leaf.label);
  const [lx, ly] = pt(labelRadius(angle, label), angle);

  let attrs = '';
  let title = esc(leaf.label);
  if (leaf.elimWinner) {
    attrs = 'data-view="elim" tabindex="0" role="button"';
    title += ' — show the elimination bracket';
  } else if (roster) {
    attrs = `data-team="${esc(leaf.name)}" tabindex="0" role="button"`;
    title += ' — open the roster';
  }
  const cls = ['po-wheel__team',
    attrs ? 'po-wheel__team--link' : '',
    leaf.name ? '' : 'po-wheel__team--tbd',
    leaf.elimWinner ? 'po-wheel__team--elim' : ''].filter(Boolean).join(' ');

  return `<g class="${cls}" ${attrs}>
    <title>${title}</title>
    ${face}
    <circle class="po-wheel__crest-ring" cx="${cx}" cy="${cy}" r="${CREST_R}"/>
    <text class="po-wheel__team-name" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${esc(label)}</text>
  </g>`;
}

function hubMarkup(f, label, view) {
  const heading = view === 'elim' ? 'ELIM FINAL' : 'GRAND FINAL';
  const when = f && f.date ? fmtDate(f.date) : 'TBD';
  const bo = f ? `Bo${f.bo}` : `Bo${DEFAULT_BO}`;
  const caster = f && f.caster ? f.caster : '';
  const tip = view === 'elim'
    ? `${label} elimination final — the winner goes to the grand final`
    : `${label} grand final`;

  return `<g class="po-wheel__hub-group">
    <title>${esc(tip)} · ${esc(bo)} · ${esc(when)}${caster ? ` · Cast: ${esc(caster)}` : ''}</title>
    <circle class="po-wheel__hub" cx="${C}" cy="${C}" r="${R_HUB}"/>
    <text class="po-wheel__hub-label" x="${C}" y="${C - 36}">${esc(label)}</text>
    <text class="po-wheel__hub-sub" x="${C}" y="${C + 4}">${heading}</text>
    <text class="po-wheel__hub-sub po-wheel__hub-sub--strong" x="${C}" y="${C + 34}">${esc(bo)} · ${esc(when)}</text>
    ${caster ? `<text class="po-wheel__hub-cast" x="${C}" y="${C + 62}">CAST ${esc(caster)}</text>` : ''}
  </g>`;
}

function renderWheel(divKey, label, view) {
  const { hub, hubChildren, matchNodes, leaves, angleOf, ringR } = buildWheel(divKey, view);
  if (!leaves.length) {
    return `<div class="po-wheel-wrap"><p class="po-wheel__empty">
      No seeded matches in this bracket yet — the fixture list below shows the reserved slots.
    </p></div>`;
  }

  const angle = (node) => angleOf(node.slot);
  const radius = (node) => (node.kind === 'leaf' ? R_TEAM - CREST_R - 5 : ringR(node.ring));

  const edges = matchNodes.flatMap((parent) =>
    parent.children.map((child) =>
      `<path class="po-wheel__edge" d="${edgePath(angle(child), radius(child), angle(parent), ringR(parent.ring))}"/>`)
  ).join('');

  // Straight in to the hub. Dashed only for matches the hub match doesn't name.
  const toHub = hubChildren.map(({ node, dashed }) =>
    `<path class="po-wheel__edge${dashed ? ' po-wheel__edge--tbd' : ''}" d="M${xy(radius(node), angle(node))} L${xy(R_HUB, angle(node))}"/>`
  ).join('');

  const rings = [...new Set(matchNodes.map((n) => n.ring))].map((ring) =>
    `<circle class="po-wheel__guide" cx="${C}" cy="${C}" r="${ringR(ring).toFixed(1)}"/>`
  ).join('');

  const nodes = matchNodes.map((n) => {
    const [x, y] = pt(ringR(n.ring), angle(n));
    const cast = hasCrew(n.match);
    return `<g class="po-wheel__node${cast ? ' po-wheel__node--cast' : ''}">
      <title>${esc(matchSummary(n.match))}</title>
      <circle class="po-wheel__node-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${NODE_R}"/>
      <text class="po-wheel__node-num" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${n.match.n}</text>
    </g>`;
  }).join('');

  const crests = leaves.map((leaf) => crestMarkup(leaf, angleOf(leaf.slot), view)).join('');
  const which = view === 'elim' ? 'elimination' : 'winners';

  return `<div class="po-wheel-wrap">
    <svg class="po-wheel po-wheel--${divKey} po-wheel--${view}" viewBox="0 0 ${VB} ${VB}" role="img"
         aria-label="${esc(label)} division ${which} bracket. The full fixture list follows below.">
      <circle class="po-wheel__guide po-wheel__guide--rim" cx="${C}" cy="${C}" r="${R_TEAM}"/>
      ${rings}
      ${edges}
      ${toHub}
      ${hubMarkup(hub, label, view)}
      ${nodes}
      ${crests}
    </svg>
    <p class="po-wheel__note">
      <span class="po-wheel__note-narrow">The bracket wheel needs a wider screen — the week-by-week list
      below carries every fixture.</span>
    </p>
  </div>`;
}

/** Top-right switch between the two wheels. Only divisions with elim matches get one. */
function renderViewToggle(divKey) {
  if (!hasElim(divKey)) return '';
  return `<div class="po-view-toggle" role="group" aria-label="Bracket">
    ${[['winners', 'Winners bracket'], ['elim', 'Elimination bracket']].map(([key, text]) =>
      `<button type="button" class="po-view-toggle__btn${VIEW === key ? ' active' : ''}"
               data-view="${key}" aria-pressed="${VIEW === key}">${text}</button>`).join('')}
  </div>`;
}

// ── Fixture list ─────────────────────────────────────────────────

function slotMarkup(slot, div) {
  const name = slotTeam(slot, div);
  if (name && ROSTERS.has(normName(name))) {
    return `<button type="button" class="po-match__team po-match__team--link" data-team="${esc(name)}"
              title="View ${esc(name)}'s roster">${esc(name)}</button>`;
  }
  return `<span class="po-match__team${name ? '' : ' po-match__team--tbd'}">${esc(slotText(slot, div))}</span>`;
}

function crewMarkup(m) {
  const chips = [
    m.caster ? `<span class="po-crew__chip po-crew__chip--cast"><b>CAST</b> ${esc(m.caster)}</span>` : '',
    m.analyst ? `<span class="po-crew__chip"><b>ANALYST</b> ${esc(m.analyst)}</span>` : '',
    m.observer ? `<span class="po-crew__chip"><b>OBS</b> ${esc(m.observer)}</span>` : ''
  ].filter(Boolean).join('');

  // Stream links come from the sheet, so treat them as untrusted: only http(s)
  // is allowed through, and the link opens without passing the referrer. One
  // cell can hold several links (a Twitch VOD and a YouTube upload, say).
  const urls = m.stream.split(/\s+/).filter((u) => /^https?:\/\/\S+$/i.test(u));
  const links = urls.map((u) =>
    `<a class="po-crew__chip po-crew__chip--link" href="${esc(u)}"
        target="_blank" rel="noopener noreferrer">${esc(streamLabel(u, urls.length))}</a>`
  ).join('');

  if (!chips && !links) return '';
  return `<span class="po-crew">${chips}${links}</span>`;
}

/** "WATCH" for a lone link; the site's name when there's more than one to tell apart. */
function streamLabel(url, count) {
  if (count < 2) return 'WATCH';
  if (/twitch\.tv/i.test(url)) return 'TWITCH';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YOUTUBE';
  return 'WATCH';
}

function renderMatchRow(m) {
  const played = Array.isArray(m.score);
  const tie = played && m.score[0] === m.score[1];
  const outcome = (i) => (!played || tie ? '' : (m.score[i] > m.score[1 - i] ? ' po-match__team--win' : ' po-match__team--loss'));

  return `<div class="po-match po-match--${m.div}${m.elim ? ' po-match--elim' : ''}${hasCrew(m) ? ' po-match--cast' : ''}">
    <span class="po-match__num">${m.n != null ? `#${m.n}` : '—'}</span>
    <span class="po-match__teams">
      <span class="po-match__side${outcome(0)}">${slotMarkup(m.a, m.div)}</span>
      ${played
        ? `<span class="po-score">${m.score[0]}<span class="po-score__sep">–</span>${m.score[1]}</span>`
        : '<span class="po-match__vs">vs</span>'}
      <span class="po-match__side${outcome(1)}">${slotMarkup(m.b, m.div)}</span>
    </span>
    ${m.elim ? '<span class="po-tag po-tag--elim" title="The loser is knocked out">ELIMINATION</span>' : ''}
    ${crewMarkup(m)}
    <span class="po-match__meta">
      <span class="po-match__date">${esc(fmtDate(m.date))}</span>
      <span class="po-match__time">${m.time ? `${esc(m.time)} BST` : 'TBD'}</span>
      <span class="po-match__bo">Bo${m.bo}</span>
    </span>
    ${m.notes ? `<span class="po-match__notes">${esc(m.notes)}</span>` : ''}
  </div>`;
}

/** A week's reserved-but-unseeded slots, so an assigned caster still shows. */
function renderSlotRow(m) {
  return `<div class="po-match po-match--${m.div} po-match--slot">
    <span class="po-match__num">—</span>
    <span class="po-match__teams">
      <span class="po-match__team po-match__team--tbd">Teams to be decided</span>
    </span>
    ${crewMarkup(m)}
    <span class="po-match__meta">
      <span class="po-match__date">${esc(fmtDate(m.date))}</span>
      <span class="po-match__time">${m.time ? `${esc(m.time)} BST` : 'TBD'}</span>
      <span class="po-match__bo">Bo${m.bo}</span>
    </span>
  </div>`;
}

function renderFixtures(divKey) {
  const final = finalRow(divKey);
  const div = ROWS.filter((m) => m.div === divKey && m.week != null);
  const weeks = [...new Set(div.map((m) => m.week))].sort((a, b) => a - b);

  return weeks.map((w) => {
    const inWeek = div.filter((m) => m.week === w);
    const seeded = inWeek.filter((m) => m.n != null && m.a && m.b && !m.elim).sort((a, b) => a.n - b.n);
    const knockout = inWeek.filter((m) => m.n != null && m.a && m.b && m.elim).sort((a, b) => a.n - b.n);
    const slots = inWeek.filter((m) => !(m.n != null && m.a && m.b));
    const isFinalWeek = final && final.week === w;

    return `<section class="po-round">
      <div class="po-round__head">
        <span class="po-round__name">${isFinalWeek ? 'Grand Final' : `Week ${w}`}</span>
        <span class="po-round__count">${inWeek.length} ${inWeek.length === 1 ? 'match' : 'matches'}</span>
      </div>
      ${seeded.map(renderMatchRow).join('')}
      ${knockout.length ? '<div class="po-round__sub">Elimination bracket &mdash; lose here and the run is over.</div>' : ''}
      ${knockout.map(renderMatchRow).join('')}
      ${slots.length && !isFinalWeek ? '<div class="po-round__sub">Reserved slots &mdash; pairings not seeded yet.</div>' : ''}
      ${slots.map(renderSlotRow).join('')}
    </section>`;
  }).join('');
}

function renderStats(divKey) {
  const div = ROWS.filter((m) => m.div === divKey);
  const teams = new Set();
  for (const m of div) for (const s of [m.a, m.b]) if (s && s.team) teams.add(resolveTeamName(s.team));
  const dates = div.map((m) => m.date).filter(Boolean).sort();

  return [
    [teams.size, 'teams in'],
    [div.filter((m) => m.n != null).length, 'matches seeded'],
    [div.filter(hasCrew).length, 'with casters'],
    [fmtDate(dates[0] || null), 'first match']
  ].map(([n, label]) => `<span class="po-stat"><b>${esc(n)}</b> ${label}</span>`).join('');
}

// ── Page wiring ──────────────────────────────────────────────────

let ROWS = fallbackRows();
let ROSTERS = new Map();      // normalised name -> registration record
let ROSTER_NAMES = new Map(); // normalised name -> the name as registered
let LOGOS = new Map();        // uploaded logos, one of two crest sources
let CRESTS = new Map();       // normalised name -> resolved crest URL (or absent)
let ACTIVE = 'upper';
let VIEW = 'winners';         // 'winners' | 'elim' — kept across division tabs
let LIVE = false;             // did the sheet fetch succeed?
let SETTLED = false;          // has it finished trying? (no banner before then)

function renderStatus() {
  const host = document.getElementById('poStatus');
  if (!host) return;
  // Silent until the fetch settles — otherwise every load flashes a red
  // "can't reach the sheet" banner for as long as Google takes to answer.
  host.innerHTML = (!SETTLED || LIVE)
    ? ''
    : `<p class="po-status po-status--stale">
         Couldn't reach the live scheduling sheet, so these are the last known fixtures and may be
         out of date. Check the sheet or ask an admin before travelling on this.
       </p>`;
}

function renderPanel() {
  const host = document.getElementById('poPanel');
  if (!host) return;
  const div = DIVISIONS.find((d) => d.key === ACTIVE);
  const view = hasElim(div.key) ? VIEW : 'winners';
  host.innerHTML = `
    <div class="po-panel-head">
      <div class="po-stats">${renderStats(div.key)}</div>
      ${renderViewToggle(div.key)}
    </div>
    ${renderWheel(div.key, div.label, view)}
    <div class="po-fixtures">${renderFixtures(div.key)}</div>
  `;
}

function renderTabs() {
  const host = document.getElementById('poTabs');
  if (!host) return;
  host.innerHTML = DIVISIONS.map((d) => {
    const n = ROWS.filter((m) => m.div === d.key && m.n != null).length;
    return `<button type="button" class="po-div-tab${d.key === ACTIVE ? ' active' : ''}"
              data-div-tab="${d.key}" role="tab" aria-selected="${d.key === ACTIVE}">
      ${esc(d.label)}<span class="po-div-tab__n">${n}</span>
    </button>`;
  }).join('');
}

function openRosterFor(name) {
  const team = ROSTERS.get(normName(name));
  if (!team) return;
  openTeamModal(team, CRESTS.get(normName(team.teamName)) || null);
}

// One delegated listener for the whole panel — it is re-rendered on every tab
// switch and again when the sheet and rosters land.
function bindPanel() {
  const panel = document.getElementById('poPanel');
  if (!panel) return;

  panel.addEventListener('click', (e) => {
    if (switchView(e.target)) return;
    const el = e.target.closest?.('[data-team]');
    if (el) openRosterFor(el.getAttribute('data-team'));
  });

  // The wheel's crests are SVG groups, so they need the keyboard equivalent.
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest?.('.po-wheel__team--link');
    if (!el) return;
    e.preventDefault();
    if (!switchView(el)) openRosterFor(el.getAttribute('data-team'));
  });
}

/** The toggle buttons and the "Winner of Elim Bracket" crest both carry data-view. */
function switchView(target) {
  const el = target.closest?.('[data-view]');
  if (!el) return false;
  VIEW = el.getAttribute('data-view') === 'elim' ? 'elim' : 'winners';
  renderPanel();
  document.querySelector(`.po-view-toggle__btn[data-view="${VIEW}"]`)?.focus();
  return true;
}

function bindTabs() {
  document.getElementById('poTabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-div-tab]');
    if (!btn) return;
    ACTIVE = btn.dataset.divTab;
    renderTabs();
    renderPanel();
  });
}

async function loadSchedule() {
  // Cache-busted on both sides: the sheet is edited during match nights and a
  // stale caster name is exactly the thing this page exists to avoid.
  const res = await fetch(`${SHEET_CSV}&_=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = toRecords(parseCSV(await res.text())).map(parseRow).filter(Boolean);
  if (!rows.length) throw new Error('sheet returned no usable rows');
  // The sheet loading fine but no match numbers parsing means a header has
  // been renamed. Fail loudly onto the fallback + banner rather than drawing an
  // empty bracket with no hint anything is wrong.
  if (!rows.some((r) => r.n != null)) {
    throw new Error('sheet has no match numbers — has the "#" / "Match #" header been renamed?');
  }
  return rows;
}

// A crest is either an uploaded logo or a file in assets/teaminfoimgs/, and
// telling which needs an actual load attempt — so resolve every team once here
// rather than inside the render, which runs again on every tab switch.
async function loadCrests() {
  const names = new Set();
  for (const m of ROWS) {
    for (const slot of [m.a, m.b]) {
      if (slot && slot.team) names.add(resolveTeamName(slot.team));
    }
  }
  const resolved = await Promise.all(
    [...names].map(async (name) => [normName(name), await resolveTeamImage(name, LOGOS)])
  );
  CRESTS = new Map(resolved.filter(([, src]) => src));
}

async function loadRosters() {
  const res = await fetch(ROSTER_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.teams || []).filter((t) => t && t.teamName);
}

async function init() {
  if (!document.getElementById('poPanel')) return;
  initTeamModal();
  linkResults(ROWS);
  renderTabs();
  renderPanel();          // draw the seed immediately, then swap in live data
  renderStatus();
  bindTabs();
  bindPanel();

  const logoPromise = fetchTeamLogoMap();
  const rosterPromise = loadRosters();

  try {
    // Set before linking: resolving "Winner of match N" looks matches up in ROWS.
    ROWS = await loadSchedule();
    linkResults(ROWS);
    LIVE = true;
  } catch (e) {
    // The bracket is the point of this page — it stays up on the seed rows.
    console.error('Could not load the live playoff schedule:', e);
  } finally {
    SETTLED = true;
  }

  // Crests need only the schedule and the uploads map, and both land in well
  // under a second. Deliberately NOT waiting on the rosters here: those come
  // from a Google Apps Script that can take fifteen seconds on a cold start,
  // and the bracket shouldn't sit there showing initials that long.
  LOGOS = (await logoPromise) || new Map();
  renderTabs();
  renderStatus();
  renderPanel();
  await loadCrests();
  renderPanel();

  try {
    const teams = await rosterPromise;
    ROSTERS = new Map(teams.map((t) => [normName(t.teamName), t]));
    ROSTER_NAMES = new Map(teams.map((t) => [normName(t.teamName), t.teamName]));
  } catch (e) {
    // Names stay as plain text rather than becoming roster buttons.
    console.error('Could not load rosters for the playoffs:', e);
    return;
  }

  // Rosters make names clickable, and they can also resolve a sheet spelling
  // that the alias map doesn't cover — so re-run the links and crests. Anything
  // already resolved is served from the cache in teamlogo.js and costs nothing.
  linkResults(ROWS);
  renderPanel();
  await loadCrests();
  renderPanel();
}

document.addEventListener('DOMContentLoaded', init);

// Exposed for the console — lets the parsed sheet be checked without reading
// the CSV by hand.
window.SecretLeaguePlayoffs = { rows: () => ROWS, buildWheel, finalRow, parseCSV, slotTeam, canonicalHeader };
