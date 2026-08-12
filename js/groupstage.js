// Group stage schedule.
//
// The fixtures live here as data rather than hand-written markup so a time or
// pairing change is a one-line edit. Match numbers are league-wide and grouped
// by division: Lower 1–15, Mid 16–49, Upper 50–70.
//
// Shape: [matchNumber, teamA, teamB] or [matchNumber, teamA, teamB, 'cast'].

import { initTeamModal, openTeamModal } from './teammodal.js';
import { fetchTeamLogoMap, logoKey } from './teamlogo.js';

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycby727bbYh0mTv8sWjyHe9DJVp5YTkZnTNyAzcxfWJPNXcnbJ32xbyX_QM7CQwlQ5Pie1Q/exec';

const DEFAULT_TIME = '19:00';

const SCHEDULE = [
  { date: '2026-08-17', name: 'Monday', week: 1, divisions: {
    upper: [[50, 'Midlands Massive', 'N-stitution'], [51, 'SLOB Team', 'Crêpe stack'], [52, 'Institutionalized Mentaly Ill Players', 'Glizzy Gladiators']],
    mid:   [[16, 'Ctrl Alt Defeat', 'TaiLungs Accountants'], [17, 'Money Talks', 'Imprint Esports'], [18, 'The Dark Side of the Map', 'The Bortymites']],
    lower: [[1, 'Catwice', 'Chutney Smugglers'], [2, 'FarmVille', 'Herald Royale with Cheese'], [3, 'No Sweat', 'D2Ire Rejects', 'cast']]
  }},
  { date: '2026-08-18', name: 'Tuesday', week: 1, divisions: {
    upper: [[53, 'Golden Retrievers', 'N-stitution'], [54, 'SLOB Team', 'Institutionalized Mentaly Ill Players']],
    mid:   [[19, 'The Truers', '5 Stuns No Brains'], [20, 'Free Bans Gang', 'TaiLungs Accountants'], [21, 'Ctrl Alt Defeat', 'Imprint Esports']],
    lower: [[4, 'Catwice', 'Herald Royale with Cheese', 'cast'], [5, 'Chutney Smugglers', 'D2Ire Rejects'], [6, 'FarmVille', 'No Sweat']]
  }},
  { date: '2026-08-19', name: 'Wednesday', week: 1, divisions: {
    upper: [[55, 'Midlands Massive', 'Glizzy Gladiators'], [56, 'Golden Retrievers', 'Crêpe stack']],
    mid:   [[22, 'The Truers', 'The Bortymites'], [23, 'TaiLungs Accountants', 'Imprint Esports', 'cast'], [24, 'Ctrl Alt Defeat', 'The Dark Side of the Map']]
  }},
  { date: '2026-08-20', name: 'Thursday', week: 1, divisions: {
    mid: [[25, 'Money Talks', 'The Dark Side of the Map', 'cast'], [26, '5 Stuns No Brains', 'The Bortymites']]
  }},
  { date: '2026-08-23', name: 'Sunday', week: 1, divisions: {
    mid: [[27, 'Free Bans Gang', '5 Stuns No Brains', 'cast']]
  }},
  { date: '2026-08-24', name: 'Monday', week: 2, divisions: {
    upper: [[57, 'N-stitution', 'Glizzy Gladiators'], [58, 'Midlands Massive', 'SLOB Team'], [59, 'Crêpe stack', 'Institutionalized Mentaly Ill Players']],
    mid:   [[28, 'TaiLungs Accountants', 'The Dark Side of the Map'], [29, '5 Stuns No Brains', 'Money Talks'], [30, 'The Bortymites', 'Ctrl Alt Defeat']],
    lower: [[7, 'Catwice', 'D2Ire Rejects'], [8, 'Herald Royale with Cheese', 'No Sweat'], [9, 'Chutney Smugglers', 'FarmVille', 'cast']]
  }},
  { date: '2026-08-25', name: 'Tuesday', week: 2, divisions: {
    upper: [[60, 'N-stitution', 'SLOB Team', 'cast'], [61, 'Golden Retrievers', 'Institutionalized Mentaly Ill Players'], [62, 'Crêpe stack', 'Midlands Massive']],
    mid:   [[31, 'The Truers', 'Money Talks'], [32, 'Free Bans Gang', 'Imprint Esports'], [33, '5 Stuns No Brains', 'Ctrl Alt Defeat']],
    lower: [[10, 'Catwice', 'No Sweat'], [11, 'D2Ire Rejects', 'FarmVille'], [12, 'Herald Royale with Cheese', 'Chutney Smugglers']]
  }},
  { date: '2026-08-26', name: 'Wednesday', week: 2, divisions: {
    upper: [[63, 'Golden Retrievers', 'Glizzy Gladiators']],
    mid:   [[34, 'Ctrl Alt Defeat', 'The Truers', 'cast'], [35, 'Imprint Esports', 'The Dark Side of the Map']]
  }},
  { date: '2026-08-27', name: 'Thursday', week: 2, divisions: {
    mid: [[36, 'TaiLungs Accountants', 'The Truers', 'cast'], [37, 'The Bortymites', 'Money Talks']]
  }},
  { date: '2026-08-28', name: 'Friday', week: 2, divisions: {
    mid: [[38, '5 Stuns No Brains', 'TaiLungs Accountants']]
  }},
  { date: '2026-08-30', name: 'Sunday', week: 2, divisions: {
    mid: [[39, 'Free Bans Gang', 'The Bortymites', 'cast']]
  }},
  { date: '2026-08-31', name: 'Monday', week: 3, divisions: {
    upper: [[64, 'Glizzy Gladiators', 'SLOB Team'], [65, 'Institutionalized Mentaly Ill Players', 'Midlands Massive', 'cast'], [66, 'Crêpe stack', 'N-stitution']],
    mid:   [[40, 'Money Talks', 'Ctrl Alt Defeat'], [41, 'The Bortymites', 'TaiLungs Accountants'], [42, 'Imprint Esports', '5 Stuns No Brains']],
    lower: [[13, 'Catwice', 'FarmVille'], [14, 'No Sweat', 'Chutney Smugglers'], [15, 'D2Ire Rejects', 'Herald Royale with Cheese']]
  }},
  { date: '2026-09-01', name: 'Tuesday', week: 3, divisions: {
    upper: [[67, 'Golden Retrievers', 'SLOB Team', 'cast'], [68, 'Institutionalized Mentaly Ill Players', 'N-stitution']],
    mid:   [[43, 'Imprint Esports', 'The Truers'], [44, 'Free Bans Gang', 'Money Talks']]
  }},
  { date: '2026-09-02', name: 'Wednesday', week: 3, divisions: {
    upper: [[69, 'Golden Retrievers', 'Midlands Massive'], [70, 'Glizzy Gladiators', 'Crêpe stack', 'cast']],
    mid:   [[45, 'The Dark Side of the Map', 'The Truers'], [46, 'The Bortymites', 'Imprint Esports']]
  }},
  { date: '2026-09-03', name: 'Thursday', week: 3, divisions: {
    mid: [[47, 'Money Talks', 'TaiLungs Accountants'], [48, 'The Dark Side of the Map', '5 Stuns No Brains']]
  }},
  { date: '2026-09-06', name: 'Sunday', week: 3, divisions: {
    mid: [[49, 'Free Bans Gang', 'The Dark Side of the Map']]
  }}
];

// Rendered top to bottom in this order.
const DIVISIONS = [
  { key: 'upper', label: 'Upper' },
  { key: 'mid',   label: 'Mid' },
  { key: 'lower', label: 'Lower' }
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Team names come from captains, so escape before going anywhere near innerHTML.
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function parts(day) {
  const [y, m, d] = day.date.split('-').map(Number);
  return { y, m, d, dd: String(d).padStart(2, '0'), mon: MONTHS[m - 1] };
}

function dayId(day) {
  const { dd, m, y } = parts(day);
  return `day-${dd}-${String(m).padStart(2, '0')}-${y}`;
}

function matchesOf(day) {
  return DIVISIONS.flatMap(({ key }) => day.divisions[key] || []);
}

function totals() {
  const all = SCHEDULE.flatMap(matchesOf);
  return { matches: all.length, days: SCHEDULE.length, casts: all.filter((m) => m[3] === 'cast').length };
}

function buildJumpStrip() {
  const strip = document.getElementById('gsJump');
  if (!strip) return;
  strip.innerHTML = SCHEDULE.map((day) => {
    const { dd, mon } = parts(day);
    return `<a class="gs-pill" href="#${dayId(day)}">
      <span class="gs-pill__day">${esc(day.name.slice(0, 3))}</span>
      <span class="gs-pill__date">${dd} ${mon}</span>
    </a>`;
  }).join('');
}

function buildStats() {
  const el = document.getElementById('gsStats');
  if (!el) return;
  const t = totals();
  el.innerHTML = [
    [t.matches, 'matches'], [t.days, 'match days'], [3, 'weeks'], [t.casts, 'casted picks']
  ].map(([n, label]) => `<span class="gs-stat"><b>${n}</b> ${label}</span>`).join('');
}

// Sheet rosters, keyed by normalised team name. Populated after the fetch;
// until then (or if the fetch fails) names render as plain text.
let ROSTERS = new Map();
let LOGOS = new Map();

function normName(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

function teamMarkup(name) {
  const has = ROSTERS.has(normName(name));
  return has
    ? `<button type="button" class="gs-match__team gs-match__team--link" data-team="${esc(name)}"
         title="View ${esc(name)}'s roster">${esc(name)}</button>`
    : `<span class="gs-match__team">${esc(name)}</span>`;
}

function renderMatch(m, divKey) {
  const [num, a, b, flag] = m;
  return `<div class="gs-match gs-match--${divKey}">
    <span class="gs-match__num">#${num}</span>
    <span class="gs-match__teams">
      ${teamMarkup(a)}
      <span class="gs-match__vs">vs</span>
      ${teamMarkup(b)}
    </span>
    ${flag === 'cast' ? '<span class="gs-cast" title="Being streamed">CAST · SL</span>' : ''}
  </div>`;
}

function renderDay(day) {
  const { dd, mon } = parts(day);
  const blocks = DIVISIONS.map(({ key, label }) => {
    const list = day.divisions[key];
    if (!list || !list.length) return '';
    return `<div class="gs-div">
      <div class="gs-div__label gs-div__label--${key}">${label}</div>
      ${list.map((m) => renderMatch(m, key)).join('')}
    </div>`;
  }).join('');

  return `<section class="gs-day" id="${dayId(day)}">
    <div class="gs-day__head">
      <div class="gs-day__date">
        <span class="gs-day__num">${dd}</span>
        <span class="gs-day__meta">
          <span class="gs-day__name">${esc(day.name)}</span>
          <span class="gs-day__month">${mon} · Week ${day.week}</span>
        </span>
      </div>
      <div class="gs-day__time">${day.time || DEFAULT_TIME} <span class="gs-day__tz">BST</span></div>
    </div>
    ${blocks}
  </section>`;
}

function renderDays() {
  const host = document.getElementById('gsDays');
  if (!host) return;
  host.innerHTML = SCHEDULE.map(renderDay).join('');
}

// One delegated listener rather than one per name — the same team appears many
// times across the schedule.
function bindTeamClicks() {
  document.getElementById('gsDays')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.gs-match__team--link');
    if (!btn) return;
    const team = ROSTERS.get(normName(btn.dataset.team));
    if (!team) return;
    openTeamModal(team, LOGOS.get(logoKey(team.teamName)) || null);
  });
}

async function init() {
  if (!document.getElementById('gsDays')) return;
  initTeamModal();
  buildJumpStrip();
  buildStats();
  renderDays();          // render immediately; names become clickable once rosters land
  bindTeamClicks();

  const logoPromise = fetchTeamLogoMap();
  try {
    const res = await fetch(SHEETS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    ROSTERS = new Map((data.teams || [])
      .filter((t) => t && t.teamName)
      .map((t) => [normName(t.teamName), t]));
    LOGOS = (await logoPromise) || new Map();
    renderDays();        // re-render so matched names turn into buttons
  } catch (e) {
    // The schedule is the point of this page — it stays readable without rosters.
    console.error('Could not load rosters for the schedule:', e);
  }
}

document.addEventListener('DOMContentLoaded', init);

// Exposed for the console/tests — lets the totals be checked against the
// numbers quoted in the intro without re-counting by hand.
window.SecretLeagueSchedule = { SCHEDULE, totals, matchesOf };
