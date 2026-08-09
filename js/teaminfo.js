import { fetchTeamLogoMap, logoKey } from './teamlogo.js';
import { RANKS, mmrToRank } from './ranks.js';

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycby727bbYh0mTv8sWjyHe9DJVp5YTkZnTNyAzcxfWJPNXcnbJ32xbyX_QM7CQwlQ5Pie1Q/exec';

const RING_RADIUS = 260; // px — must match half the .team-wheel width minus node margin, see teaminfo.css
const MIN_SLOTS = 24;    // empty slots signal there's still room to sign up
const IMG_EXTS = ['png', 'webp', 'jpg', 'jpeg'];

// Node sizing. The ring's radius is fixed, so every extra slot leaves each node
// less arc to sit in — at 24 slots an 84px circle would overlap its neighbours.
// Shrink to fit instead of overlapping. NODE_MAX matches the CSS default, so at
// 16 slots this returns 84px and the wheel looks exactly as it did before.
const NODE_MAX = 84;
const NODE_MIN = 44;
const NODE_GAP = 12; // clear space to leave between neighbouring circles

function nodeSize(total) {
  const arcPerSlot = (2 * Math.PI * RING_RADIUS) / total;
  return Math.max(NODE_MIN, Math.min(NODE_MAX, Math.round(arcPerSlot - NODE_GAP)));
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

// Manual escape hatch: if a team's logo filename can't be derived from its name,
// map the exact sheet team name to its file here.
const TEAM_IMAGE_OVERRIDES = {
  // 'Exact Team Name From Sheet': 'assets/teaminfoimgs/whatever.png',
};

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Filenames are matched case-insensitively (live hosts are usually case-sensitive,
// so we probe the common casings rather than trusting the team name's own casing).
function caseVariants(s) {
  const lower = s.toLowerCase();
  const sentence = lower.charAt(0).toUpperCase() + lower.slice(1);
  return [s, lower, sentence];
}

function slugCandidates(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return [];

  const separatorForms = [
    trimmed.replace(/\s+/g, '_'),
    trimmed.replace(/\s+/g, ''),
    trimmed,
    trimmed.replace(/\s+/g, '-')
  ];

  const out = [];
  // Exact-accent forms first, then accent-stripped (e.g. "Crêpe stack" → "Crepe_stack").
  [separatorForms, separatorForms.map(stripAccents)].forEach((forms) => {
    forms.forEach((form) => caseVariants(form).forEach((v) => out.push(v)));
  });
  return [...new Set(out)];
}

function candidateImagePaths(name, logoMap) {
  // A logo the captain uploaded at registration wins — it's the team's own
  // choice, and the paths below are only a fallback for teams that registered
  // before uploads existed (or whose logo an admin added by hand).
  const uploaded = logoMap?.get(logoKey(name));

  const override = TEAM_IMAGE_OVERRIDES[(name || '').trim()];
  if (override) return uploaded ? [uploaded, override] : [override];

  const paths = uploaded ? [uploaded] : [];
  slugCandidates(name).forEach((base) => {
    IMG_EXTS.forEach((ext) => paths.push(`assets/teaminfoimgs/${base}.${ext}`));
  });
  return paths;
}

function loadTeamImage(name, logoMap) {
  return new Promise((resolve) => {
    const candidates = candidateImagePaths(name, logoMap);
    let i = 0;
    function tryNext() {
      if (i >= candidates.length) { resolve(null); return; }
      const src = candidates[i++];
      const img = new Image();
      img.onload = () => resolve(src);
      img.onerror = tryNext;
      img.src = src;
    }
    tryNext();
  });
}

// Admins publish a team by flipping its Visible cell in the sheet to 1; new
// registrations land as 0 and stay hidden until then. Rows with no value at all
// (written before the column existed, or if the sheet script hasn't been
// updated yet) are treated as visible so nothing silently disappears.
function isVisible(team) {
  const v = team.visible;
  if (v === undefined || v === null || String(v).trim() === '') return true;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y';
}

function initials(name) {
  const words = (name || '?').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function rankIconPath(rank) {
  if (!rank) return '';
  return `assets/ranks/${String(rank).toLowerCase()}.png`;
}

function dotabuffUrl(steamId) {
  if (!steamId) return '';
  const clean = String(steamId).trim();
  if (!/^\d{17}$/.test(clean)) return '';
  return `https://www.dotabuff.com/players/${clean}`;
}

// The sheet already marks the captain's roster row with isCaptain. team.captain
// holds their IGN (not a slot number) and is the fallback for rows where the
// per-player flag is missing.
function captainIndex(team, players) {
  const flagged = players.findIndex((p) => p.isCaptain === true || p.isCaptain === 'TRUE' || p.isCaptain === 1);
  if (flagged !== -1) return flagged;

  const capIgn = String(team.captain ?? team.captainIgn ?? '').trim().toLowerCase();
  if (capIgn) {
    const i = players.findIndex((p) => (p.ign || '').trim().toLowerCase() === capIgn);
    if (i !== -1) return i;
  }
  return -1;
}

// Immortal has no upper bound, so it needs a nominal value to average with.
const IMMORTAL_NOMINAL_MMR = 6000;

// The strength line in the modal header. Real per-player MMR is preferred, but
// the sheet only carries it for teams registered after the MMR columns were
// added — for older teams, average their rank bands instead. That result is
// labelled "Avg Rank", never "Avg MMR", because it's an approximation from
// buckets rather than a real average of real numbers.
function teamStrengthLabel(players) {
  const mmrs = players
    .map((p) => Number(p.mmr))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (mmrs.length) {
    const avg = Math.round(mmrs.reduce((a, b) => a + b, 0) / mmrs.length);
    return `Avg MMR: ${avg.toLocaleString()}`;
  }

  const midpoints = players
    .map((p) => RANKS.find((r) => r.label === String(p.rank || '').trim()))
    .filter(Boolean)
    .map((r) => (r.max === Infinity ? IMMORTAL_NOMINAL_MMR : (r.min + r.max) / 2));

  if (!midpoints.length) return '';
  const rank = mmrToRank(midpoints.reduce((a, b) => a + b, 0) / midpoints.length);
  return rank ? `Avg Rank: ${rank.label}` : '';
}

function buildWheel(teams, logoMap) {
  const ring = document.getElementById('teamWheelRing');
  const emptyState = document.getElementById('teaminfoEmpty');
  if (!ring) return;

  if (!teams.length) {
    document.getElementById('teamWheel').style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  const total = Math.max(MIN_SLOTS, teams.length);
  ring.style.setProperty('--node-size', `${nodeSize(total)}px`);
  ring.innerHTML = '';

  for (let i = 0; i < total; i++) {
    const team = teams[i];
    const angle = (360 / total) * i;
    const node = document.createElement(team ? 'button' : 'div');
    node.className = 'team-node' + (team ? '' : ' team-node--empty');
    node.style.transform = `rotate(${angle}deg) translateY(-${RING_RADIUS}px) rotate(-${angle}deg)`;

    if (team) {
      node.type = 'button';
      node.setAttribute('aria-label', `View roster for ${team.teamName}`);
      node.title = team.teamName;
    } else {
      node.title = 'Team slot open';
    }

    const circle = document.createElement('div');
    circle.className = 'team-node__circle';
    const fallback = document.createElement('div');
    fallback.className = 'team-node__fallback';
    fallback.textContent = team ? initials(team.teamName) : '?';
    circle.appendChild(fallback);
    node.appendChild(circle);
    ring.appendChild(node);

    if (team) {
      node.addEventListener('click', () => openTeamModal(team, circle.querySelector('img')?.src || null));
      loadTeamImage(team.teamName, logoMap).then((src) => {
        if (!src) return;
        const img = document.createElement('img');
        img.src = src;
        img.alt = team.teamName;
        circle.innerHTML = '';
        circle.appendChild(img);
      });
    }
  }
}

function openTeamModal(team, crestSrc) {
  const overlay = document.getElementById('teamModalOverlay');
  const nameEl = document.getElementById('teamModalName');
  const metaEl = document.getElementById('teamModalMeta');
  const crestEl = document.getElementById('teamModalCrest');
  const rosterEl = document.getElementById('teamModalRoster');
  if (!overlay) return;

  nameEl.textContent = team.teamName || 'Unknown Team';

  const players = (team.players || []).filter((p) => p && (p.ign || p.steam));
  const capIdx = captainIndex(team, players);
  // The captain is already identifiable from the 👑 on their roster row, so this
  // line carries team strength instead.
  const strength = teamStrengthLabel(players);
  metaEl.textContent = `${players.length} Player${players.length === 1 ? '' : 's'}${strength ? ` · ${strength}` : ''}`;

  crestEl.innerHTML = '';
  if (crestSrc) {
    const img = document.createElement('img');
    img.src = crestSrc;
    img.alt = team.teamName;
    crestEl.appendChild(img);
  } else {
    crestEl.textContent = initials(team.teamName);
  }

  rosterEl.innerHTML = players.map((p, i) => {
    const rankIcon = rankIconPath(p.rank);
    const dbUrl = p.dotabuff || dotabuffUrl(p.steam);
    const isCap = i === capIdx;
    return `
      <div class="roster-row${isCap ? ' roster-row--captain' : ''}">
        ${rankIcon ? `<img class="roster-row__rank" src="${rankIcon}" alt="${p.rank}">` : ''}
        <div class="roster-row__info">
          <span class="roster-row__name">${p.ign || 'Unknown'}${isCap ? '<span class="roster-row__crown" title="Team Captain" aria-label="Team Captain">👑</span>' : ''}</span>
          <span class="roster-row__sub">${isCap ? 'Captain · ' : ''}${p.rank || '?'} · Pos ${p.position || '?'}</span>
        </div>
        ${dbUrl
          ? `<a class="roster-row__dotabuff" href="${dbUrl}" target="_blank" rel="noopener">Dotabuff ↗</a>`
          : `<span class="roster-row__missing">No Dotabuff</span>`}
      </div>
    `;
  }).join('');

  overlay.classList.add('show');
}

function closeTeamModal() {
  document.getElementById('teamModalOverlay')?.classList.remove('show');
}

function initModal() {
  document.getElementById('teamModalClose')?.addEventListener('click', closeTeamModal);
  document.getElementById('teamModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'teamModalOverlay') closeTeamModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTeamModal();
  });
}

async function init() {
  initModal();
  // Logos come from Supabase, rosters from the sheet — fetch both at once.
  // fetchTeamLogoMap never rejects; a failure there just means the filename
  // fallback and initials do the work.
  const logoMapPromise = fetchTeamLogoMap();
  try {
    const res = await fetch(SHEETS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const teams = (data.teams || []).filter((t) => t && t.teamName && isVisible(t));
    buildWheel(teams, await logoMapPromise);
  } catch (e) {
    console.error('Failed to load team data:', e);
    showToast('Could not load team data. Please try again later.');
    buildWheel([], new Map());
  }
}

document.addEventListener('DOMContentLoaded', init);
