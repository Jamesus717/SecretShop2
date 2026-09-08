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
// Expected columns (matched by header name, so column ORDER can change freely;
// renaming a header is what would break it):
//   Division | Week | Date of Game | Time | # | Elimination? | Caster Name
//   Analyst Name | Observer | Format | Team 1 Name | Team 2 Name | Score
//   Winner | Stream Link | Notes
//
// A row becomes a bracket match once it has a match number and both team
// cells. Rows without those are drawn as reserved slots for that week, which
// is how a caster assigned to a not-yet-seeded game still shows up. The
// highest-week row in each division is that division's final and is drawn in
// the middle of the wheel rather than on it.

import { initTeamModal, openTeamModal, initials } from './teammodal.js';
import { fetchTeamLogoMap, logoKey } from './teamlogo.js';

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
  { div: 'mid',   week: 1, date: '2026-09-07', n: 1,  a: 'The Bortymites',       b: 'Ctrl Alt Defeat' },
  { div: 'mid',   week: 1, date: '2026-09-14', n: 2,  a: 'Winner of Match #1',   b: '5 Stuns No Brains' },
  { div: 'mid',   week: 1, date: '2026-09-14', n: 3,  a: 'The Truers',           b: 'The Dark side of the map' },
  { div: 'mid',   week: 1, date: '2026-09-14', n: 4,  a: 'Tailungs Accountants', b: 'Money Talks' },
  { div: 'mid',   week: 1, date: '2026-09-14', n: 5,  a: 'Imprint Esports',      b: 'Free Bans Gang' },
  { div: 'upper', week: 1, date: '2026-09-15', n: 6,  a: 'Glizzy Gladiators',    b: 'Midland Massive' },
  { div: 'lower', week: 1, date: '2026-09-15', n: 7,  a: 'No Sweat',             b: 'Chutney Smugglers' },
  { div: 'lower', week: 1, date: '2026-09-16', n: 8,  a: 'D2Ire Rejects',        b: 'Herald Royale' },
  { div: 'mid',   week: 2, date: '2026-09-21', n: 9,  elim: true, a: 'Loser of Match #1',  b: 'Loser of Match #3' },
  { div: 'mid',   week: 2, date: '2026-09-21', n: 10, elim: true, a: 'Winner of Match #9', b: 'Loser of Match #5' },
  { div: 'mid',   week: 2, date: '2026-09-21', n: 11, elim: true, a: 'Loser of Match #2',  b: 'Loser of Match #4' },
  { div: 'mid',   week: 2, date: '2026-09-21', n: 12, a: 'Winner of Match #2', b: 'Winner of Match #3' },
  { div: 'mid',   week: 2, date: '2026-09-21', n: 13, a: 'Winner of Match #4', b: 'Winner of Match #5' },
  { div: 'upper', week: 2, date: '2026-09-22', n: 14, a: 'N-Sitution',         b: 'Winner of Match #6' },
  { div: 'upper', week: 2, date: '2026-09-22', n: 15, a: 'Slob Team',          b: 'Golden Retrievers' },
  { div: 'lower', week: 2, date: '2026-09-22', n: 16, a: 'Farmville',          b: 'Winner of Match #7' },
  { div: 'lower', week: 2, date: '2026-09-23', n: 17, a: 'Catwice',            b: 'Winner of Match #8' },
  { div: 'mid',   week: 5, bo: 5 },
  { div: 'upper', week: 5, bo: 5 },
  { div: 'lower', week: 5, bo: 5 }
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
  'n-sitution': 'N-stitution'
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

/** CSV rows -> objects keyed by trimmed header name. */
function toRecords(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
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

  const ref = /^(winner|loser)\s+of\s+match\s*#?\s*(\d+)$/i.exec(t);
  if (ref) {
    const n = Number(ref[2]);
    return ref[1].toLowerCase() === 'winner' ? { winnerOf: n } : { loserOf: n };
  }
  return { team: t };
}

function parseRow(rec) {
  const div = DIVISION_KEYS[(rec['Division'] || '').trim().toLowerCase()];
  if (!div) return null;

  const n = /^\d+$/.test(rec['#'] || '') ? Number(rec['#']) : null;
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
function slotText(slot) {
  if (!slot) return 'TBD';
  if (slot.team) return resolveTeamName(slot.team);
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
    + `\n${slotText(m.a)} vs ${slotText(m.b)}`
    + (m.elim ? '\nElimination match — the loser is out.' : '')
    + (hasCrew(m) ? `\n${crewText(m)}` : '');
}

// ── Bracket tree ─────────────────────────────────────────────────
// The winners' path for one division, as a tree rooted at the matches nothing
// else feeds from. Those are the innermost ring; the rounds between them and
// the division final aren't seeded yet, so they reach the hub on a dashed
// spoke rather than through drawn matches.

function bracketMatches(divKey) {
  const final = finalRow(divKey);
  return ROWS.filter((m) => m.div === divKey && m.n != null && m.a && m.b && m !== final);
}

/** The last round on the sheet for a division — its final. Drawn in the hub. */
function finalRow(divKey) {
  const div = ROWS.filter((m) => m.div === divKey && m.week != null);
  if (!div.length) return null;
  const maxWeek = Math.max(...div.map((m) => m.week));
  const last = div.filter((m) => m.week === maxWeek);
  return last[last.length - 1];
}

function buildWheel(divKey) {
  const all = bracketMatches(divKey);
  const byNum = new Map(all.map((m) => [m.n, m]));
  const winners = all.filter((m) => !m.elim);
  const inWheel = new Set(winners.map((m) => m.n));

  const feedsAnother = new Set();
  for (const m of winners) {
    for (const slot of [m.a, m.b]) {
      if (slot.winnerOf != null && inWheel.has(slot.winnerOf)) feedsAnother.add(slot.winnerOf);
    }
  }
  const roots = winners.filter((m) => !feedsAnother.has(m.n)).sort((x, y) => x.n - y.n);

  const matchNodes = [];
  const leaves = [];

  function walk(m, ring) {
    const node = { kind: 'match', match: m, ring, children: [] };
    matchNodes.push(node);
    for (const slot of [m.a, m.b]) {
      if (slot.winnerOf != null && inWheel.has(slot.winnerOf)) {
        node.children.push(walk(byNum.get(slot.winnerOf), ring + 1));
      } else {
        const name = slot.team ? resolveTeamName(slot.team) : null;
        const leaf = { kind: 'leaf', name, label: slotText(slot), slot: leaves.length };
        leaves.push(leaf);
        node.children.push(leaf);
      }
    }
    // Sits at the angular midpoint of whatever feeds it, so branches never cross.
    node.slot = node.children.reduce((sum, c) => sum + c.slot, 0) / node.children.length;
    return node;
  }

  const rootNodes = roots.map((m) => walk(m, 1));
  const maxRing = matchNodes.reduce((mx, n) => Math.max(mx, n.ring), 1);

  // Rotate the wheel so the seam between the two halves lands at 12 o'clock,
  // the way a printed bracket splits left from right.
  const n = leaves.length || 1;
  const step = 360 / n;
  const split = rootNodes.length > 1 ? countLeaves(rootNodes[0]) : n / 2;
  const base = -90 - (split - 0.5) * step;
  const angleOf = (slot) => base + slot * step;

  // Ring 1 is nearest the hub; the outermost ring of matches stops short of the
  // crests so the spokes into them stay visible.
  const ringR = (ring) => R_HUB + (R_RINGS_OUTER - R_HUB) * (ring / (maxRing + 1));

  return { rootNodes, matchNodes, leaves, angleOf, ringR };
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

function crestMarkup(leaf, angle) {
  const [x, y] = pt(R_TEAM, angle);
  const cx = x.toFixed(1);
  const cy = y.toFixed(1);
  const logo = leaf.name ? LOGOS.get(logoKey(leaf.name)) : null;
  const clipId = `po-clip-${leaf.slot}`;
  const clickable = Boolean(leaf.name && ROSTERS.has(normName(leaf.name)));

  const face = logo
    ? `<clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${CREST_R}"/></clipPath>
       <image href="${esc(logo)}" x="${(x - CREST_R).toFixed(1)}" y="${(y - CREST_R).toFixed(1)}"
              width="${CREST_R * 2}" height="${CREST_R * 2}"
              preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`
    : `<circle class="po-wheel__crest-fill" cx="${cx}" cy="${cy}" r="${CREST_R}"/>
       <text class="po-wheel__initials" x="${cx}" y="${cy}">${esc(initials(leaf.label))}</text>`;

  const label = shortName(leaf.label);
  const [lx, ly] = pt(labelRadius(angle, label), angle);

  return `<g class="po-wheel__team${clickable ? ' po-wheel__team--link' : ''}${leaf.name ? '' : ' po-wheel__team--tbd'}"
             ${clickable ? `data-team="${esc(leaf.name)}" tabindex="0" role="button"` : ''}>
    <title>${esc(leaf.label)}${clickable ? ' — open the roster' : ''}</title>
    ${face}
    <circle class="po-wheel__crest-ring" cx="${cx}" cy="${cy}" r="${CREST_R}"/>
    <text class="po-wheel__team-name" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${esc(label)}</text>
  </g>`;
}

function hubMarkup(divKey, label) {
  const f = finalRow(divKey);
  const when = f && f.date ? fmtDate(f.date) : 'TBD';
  const bo = f ? `Bo${f.bo}` : `Bo${DEFAULT_BO}`;
  const caster = f && f.caster ? f.caster : '';

  return `<g class="po-wheel__hub-group">
    <title>${esc(label)} division final · ${esc(bo)} · ${esc(when)}${caster ? ` · Cast: ${esc(caster)}` : ''}</title>
    <circle class="po-wheel__hub" cx="${C}" cy="${C}" r="${R_HUB}"/>
    <text class="po-wheel__hub-label" x="${C}" y="${C - 36}">${esc(label)}</text>
    <text class="po-wheel__hub-sub" x="${C}" y="${C + 4}">DIVISION FINAL</text>
    <text class="po-wheel__hub-sub po-wheel__hub-sub--strong" x="${C}" y="${C + 34}">${esc(bo)} · ${esc(when)}</text>
    ${caster ? `<text class="po-wheel__hub-cast" x="${C}" y="${C + 62}">CAST ${esc(caster)}</text>` : ''}
  </g>`;
}

function renderWheel(divKey, label) {
  const { rootNodes, matchNodes, leaves, angleOf, ringR } = buildWheel(divKey);
  if (!matchNodes.length) {
    return `<div class="po-wheel-wrap"><p class="po-wheel__empty">
      No seeded matches in this division yet — the fixture list below shows the reserved slots.
    </p></div>`;
  }

  const angle = (node) => angleOf(node.slot);
  const radius = (node) => (node.kind === 'leaf' ? R_TEAM - CREST_R - 5 : ringR(node.ring));

  const edges = matchNodes.flatMap((parent) =>
    parent.children.map((child) =>
      `<path class="po-wheel__edge" d="${edgePath(angle(child), radius(child), angle(parent), ringR(parent.ring))}"/>`)
  ).join('');

  // Dashed, because the rounds between these matches and the final aren't
  // seeded — the line means "this leads to the final", not "this IS the final".
  const toHub = rootNodes.map((r) =>
    `<path class="po-wheel__edge po-wheel__edge--tbd" d="M${xy(ringR(r.ring), angle(r))} L${xy(R_HUB, angle(r))}"/>`
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

  const crests = leaves.map((leaf) => crestMarkup(leaf, angleOf(leaf.slot))).join('');

  return `<div class="po-wheel-wrap">
    <svg class="po-wheel po-wheel--${divKey}" viewBox="0 0 ${VB} ${VB}" role="img"
         aria-label="${esc(label)} division playoff bracket. The full fixture list follows below.">
      <circle class="po-wheel__guide po-wheel__guide--rim" cx="${C}" cy="${C}" r="${R_TEAM}"/>
      ${rings}
      ${edges}
      ${toHub}
      ${hubMarkup(divKey, label)}
      ${nodes}
      ${crests}
    </svg>
    <p class="po-wheel__note">
      <span class="po-wheel__note-narrow">The bracket wheel needs a wider screen — the week-by-week list
      below carries every fixture.</span>
    </p>
  </div>`;
}

// ── Fixture list ─────────────────────────────────────────────────

function slotMarkup(slot) {
  const name = slot && slot.team ? resolveTeamName(slot.team) : null;
  if (name && ROSTERS.has(normName(name))) {
    return `<button type="button" class="po-match__team po-match__team--link" data-team="${esc(name)}"
              title="View ${esc(name)}'s roster">${esc(name)}</button>`;
  }
  return `<span class="po-match__team${name ? '' : ' po-match__team--tbd'}">${esc(slotText(slot))}</span>`;
}

function crewMarkup(m) {
  const chips = [
    m.caster ? `<span class="po-crew__chip po-crew__chip--cast"><b>CAST</b> ${esc(m.caster)}</span>` : '',
    m.analyst ? `<span class="po-crew__chip"><b>ANALYST</b> ${esc(m.analyst)}</span>` : '',
    m.observer ? `<span class="po-crew__chip"><b>OBS</b> ${esc(m.observer)}</span>` : ''
  ].filter(Boolean).join('');
  if (!chips) return '';

  // Stream links come from the sheet, so treat them as untrusted: only http(s)
  // is allowed through, and the link opens without passing the referrer.
  let link = '';
  if (/^https?:\/\//i.test(m.stream)) {
    link = `<a class="po-crew__chip po-crew__chip--link" href="${esc(m.stream)}"
              target="_blank" rel="noopener noreferrer">WATCH</a>`;
  }
  return `<span class="po-crew">${chips}${link}</span>`;
}

function renderMatchRow(m) {
  const played = Array.isArray(m.score);
  const tie = played && m.score[0] === m.score[1];
  const outcome = (i) => (!played || tie ? '' : (m.score[i] > m.score[1 - i] ? ' po-match__team--win' : ' po-match__team--loss'));

  return `<div class="po-match po-match--${m.div}${m.elim ? ' po-match--elim' : ''}${hasCrew(m) ? ' po-match--cast' : ''}">
    <span class="po-match__num">${m.n != null ? `#${m.n}` : '—'}</span>
    <span class="po-match__teams">
      <span class="po-match__side${outcome(0)}">${slotMarkup(m.a)}</span>
      ${played
        ? `<span class="po-score">${m.score[0]}<span class="po-score__sep">–</span>${m.score[1]}</span>`
        : '<span class="po-match__vs">vs</span>'}
      <span class="po-match__side${outcome(1)}">${slotMarkup(m.b)}</span>
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
        <span class="po-round__name">${isFinalWeek ? 'Division Final' : `Week ${w}`}</span>
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
let LOGOS = new Map();
let ACTIVE = 'upper';
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
  host.innerHTML = `
    <div class="po-stats">${renderStats(div.key)}</div>
    ${renderWheel(div.key, div.label)}
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
  openTeamModal(team, LOGOS.get(logoKey(team.teamName)) || null);
}

// One delegated listener for the whole panel — it is re-rendered on every tab
// switch and again when the sheet and rosters land.
function bindPanel() {
  const panel = document.getElementById('poPanel');
  if (!panel) return;

  panel.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-team]');
    if (el) openRosterFor(el.getAttribute('data-team'));
  });

  // The wheel's crests are SVG groups, so they need the keyboard equivalent.
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest?.('.po-wheel__team--link');
    if (!el) return;
    e.preventDefault();
    openRosterFor(el.getAttribute('data-team'));
  });
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
  return rows;
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
  renderTabs();
  renderPanel();          // draw the seed immediately, then swap in live data
  renderStatus();
  bindTabs();
  bindPanel();

  const logoPromise = fetchTeamLogoMap();
  const rosterPromise = loadRosters();

  try {
    ROWS = await loadSchedule();
    LIVE = true;
  } catch (e) {
    // The bracket is the point of this page — it stays up on the seed rows.
    console.error('Could not load the live playoff schedule:', e);
  } finally {
    SETTLED = true;
  }

  try {
    const teams = await rosterPromise;
    ROSTERS = new Map(teams.map((t) => [normName(t.teamName), t]));
    ROSTER_NAMES = new Map(teams.map((t) => [normName(t.teamName), t.teamName]));
    LOGOS = (await logoPromise) || new Map();
  } catch (e) {
    // Names stay as plain text and crests fall back to initials.
    console.error('Could not load rosters for the playoffs:', e);
  }

  renderTabs();
  renderStatus();
  renderPanel();
}

document.addEventListener('DOMContentLoaded', init);

// Exposed for the console — lets the parsed sheet be checked without reading
// the CSV by hand.
window.SecretLeaguePlayoffs = { rows: () => ROWS, buildWheel, finalRow, parseCSV };
