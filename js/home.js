// Home page: once sign-ups are closed, the countdown and Register buttons give
// way to a "Tonight / Next up / Latest results" box read live from the playoff
// scheduling sheet (via js/playoffs.js, so there's one parser for that sheet).
// Next season, moving SIGNUPS_CLOSE in js/config.js brings the sign-up block
// back on its own.

import { fetchMatchList } from './playoffs.js';

const DIV_LABELS = { upper: 'Upper', mid: 'Mid', lower: 'Lower' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_RESULTS = 6;

// Team names come from a spreadsheet anyone on the admin team can type into.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

function byTime(x, y) {
  return (x.time || '99:99').localeCompare(y.time || '99:99') || x.div.localeCompare(y.div) || x.n - y.n;
}

function matchRow(m) {
  const done = m.state === 'done';
  const side = (name) => {
    const cls = !done ? '' : name === m.winner ? ' home-match__team--win' : ' home-match__team--loss';
    return `<span class="home-match__team${cls}">${esc(name)}</span>`;
  };
  const middle = done && m.score
    ? `<span class="home-match__score">${m.winner === m.a ? m.score[0] : m.score[1]}–${m.winner === m.a ? m.score[1] : m.score[0]}</span>`
    : '<span class="home-match__vs">vs</span>';
  const tag = m.state === 'live'
    ? '<span class="home-tag home-tag--live">LIVE NOW</span>'
    : m.state === 'awaiting' ? '<span class="home-tag home-tag--awaiting">AWAITING RESULT</span>' : '';
  const watch = m.streams.length
    ? `<a class="home-match__watch" href="${esc(m.streams[0])}" target="_blank" rel="noopener noreferrer">${done ? 'VOD' : 'WATCH'}</a>`
    : '';
  return `<div class="home-match">
    <span class="home-div home-div--${m.div}">${DIV_LABELS[m.div] || ''}</span>
    <span class="home-match__teams">${side(m.a)}${middle}${side(m.b)}</span>
    ${tag}
    <span class="home-match__meta">
      ${done ? `<span>${esc(fmtDate(m.date))}</span>` : m.time ? `<span>${esc(m.time)} ${esc(m.zone)}</span>` : ''}
      <span>Bo${m.bo}</span>
      ${m.caster ? `<span>Cast: ${esc(m.caster)}</span>` : ''}
      ${watch}
    </span>
  </div>`;
}

function group(title, list) {
  return `<div class="home-matches__group">
    <div class="home-matches__head">${title}</div>
    ${list.map(matchRow).join('')}
  </div>`;
}

function render(host, { now, matches }) {
  const dated = matches.filter((m) => m.date);
  const today = dated.filter((m) => m.date === now.date).sort(byTime);

  // Nothing on today: the next day anything is scheduled.
  const nextDate = today.length ? null
    : dated.filter((m) => m.date > now.date && m.state !== 'done').map((m) => m.date).sort()[0];
  // A forfeit can be decided before its date — it isn't "next up".
  const next = nextDate ? dated.filter((m) => m.date === nextDate && m.state !== 'done').sort(byTime) : [];

  // The last few results before today (today's are already shown above), newest first.
  const results = dated.filter((m) => m.state === 'done' && m.date < now.date)
    .sort((x, y) => y.date.localeCompare(x.date) || byTime(x, y))
    .slice(0, MAX_RESULTS);

  const parts = [];
  if (today.length) parts.push(group(`Tonight · ${fmtDate(now.date)}`, today));
  if (next.length) parts.push(group(`Next up · ${fmtDate(nextDate)}`, next));
  if (results.length) parts.push(group('Latest results', results));
  if (!parts.length) parts.push('<p class="home-matches__empty">No playoff games scheduled right now.</p>');

  host.innerHTML = `
    <div class="section-label">SecretLeague Playoffs</div>
    ${parts.join('')}
    <a class="home-matches__more" href="playoffs.html">Full bracket &amp; schedule →</a>`;
}

async function init() {
  const host = document.getElementById('homeMatches');
  const signups = document.getElementById('homeSignups');
  if (!host || !window.SECRETLEAGUE || !window.SECRETLEAGUE.signupsClosed()) return;

  if (signups) signups.hidden = true;
  host.hidden = false;
  host.innerHTML = '<div class="section-label">SecretLeague Playoffs</div><p class="home-matches__empty">Loading the schedule…</p>';

  try {
    render(host, await fetchMatchList());
  } catch (e) {
    console.error('Could not load the playoff schedule for the home page:', e);
    host.innerHTML = `<div class="section-label">SecretLeague Playoffs</div>
      <p class="home-matches__empty">Couldn't load tonight's games. The <a href="playoffs.html">Playoffs page</a> has the full schedule.</p>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
