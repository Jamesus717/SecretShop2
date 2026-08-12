import { fetchTeamLogoMap, logoKey } from './teamlogo.js';
import { initTeamModal, openTeamModal, initials } from './teammodal.js';

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycby727bbYh0mTv8sWjyHe9DJVp5YTkZnTNyAzcxfWJPNXcnbJ32xbyX_QM7CQwlQ5Pie1Q/exec';

const RING_RADIUS = 260; // px — must match half the .team-wheel width minus node margin, see teaminfo.css
const IMG_EXTS = ['png', 'webp', 'jpg', 'jpeg'];

// Node sizing. The ring's radius is fixed, so every extra slot leaves each node
// less arc to sit in. Shrink to fit rather than overlapping. NODE_MAX matches
// the CSS default, so small divisions keep the full-size 84px circles.
const NODE_MAX = 84;
const NODE_MIN = 44;
const NODE_GAP = 12;

function nodeSize(total) {
  const arcPerSlot = (2 * Math.PI * RING_RADIUS) / total;
  return Math.max(NODE_MIN, Math.min(NODE_MAX, Math.round(arcPerSlot - NODE_GAP)));
}

// Group stage divisions. These are seedings for the group stage only and are
// expected to change once it finishes — the page says so above the tabs.
// Teams are matched to sheet rows on a normalised name, so punctuation, accents
// and casing can drift without breaking the grouping.
const DIVISIONS = [
  { key: 'upper', label: 'Upper', teams: [
    'N-stitution', 'Institutionalized Mentaly Ill Players', 'Midlands Massive',
    'Glizzy Gladiators', 'SLOB Team', 'Crêpe stack', 'Golden Retrievers'
  ]},
  { key: 'mid', label: 'Mid', teams: [
    'Ctrl Alt Defeat', 'Money Talks', 'The Dark Side of the Map', 'The Truers',
    '5 Stuns No Brains', 'Imprint Esports', 'The Bortymites', 'Free Bans Gang',
    'TaiLungs Accountants'
  ]},
  { key: 'lower', label: 'Lower', teams: [
    'Catwice', 'Chutney Smugglers', 'Herald Royale with Cheese', 'No Sweat',
    'FarmVille', 'D2Ire Rejects'
  ]}
];

function normName(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
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

function buildWheel(container, division, teams, logoMap) {
  const total = teams.length;
  container.innerHTML = `
    <div class="team-wheel">
      <div class="team-wheel__trophy">
        <img class="team-wheel__trophy-icon" src="assets/logo.png" alt="SecretShop Logo">
        <div class="team-wheel__trophy-text">${division.label} Division</div>
        <div class="team-wheel__trophy-count">${total} Team${total === 1 ? '' : 's'}</div>
      </div>
      <div class="team-wheel__ring"></div>
    </div>`;

  const ring = container.querySelector('.team-wheel__ring');
  ring.style.setProperty('--node-size', `${nodeSize(Math.max(total, 1))}px`);

  teams.forEach((team, i) => {
    const angle = (360 / total) * i;
    const node = document.createElement(team.data ? 'button' : 'div');
    node.className = 'team-node' + (team.data ? '' : ' team-node--empty');
    node.style.transform = `rotate(${angle}deg) translateY(-${RING_RADIUS}px) rotate(-${angle}deg)`;

    if (team.data) {
      node.type = 'button';
      node.setAttribute('aria-label', `View roster for ${team.name}`);
      node.title = team.name;
    } else {
      node.title = `${team.name} — roster not published yet`;
    }

    const circle = document.createElement('div');
    circle.className = 'team-node__circle';
    const fallback = document.createElement('div');
    fallback.className = 'team-node__fallback';
    fallback.textContent = initials(team.name);
    circle.appendChild(fallback);
    node.appendChild(circle);
    ring.appendChild(node);

    if (team.data) {
      node.addEventListener('click', () => openTeamModal(team.data, circle.querySelector('img')?.src || null));
    }
    loadTeamImage(team.name, logoMap).then((src) => {
      if (!src) return;
      const img = document.createElement('img');
      img.src = src;
      img.alt = team.name;
      circle.innerHTML = '';
      circle.appendChild(img);
    });
  });
}

function selectDivision(key) {
  document.querySelectorAll('.div-tab').forEach((b) => {
    const on = b.dataset.div === key;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.div-panel').forEach((p) => {
    p.classList.toggle('active', p.dataset.div === key);
  });
}

function buildTabs(byDivision) {
  const tabs = document.getElementById('divTabs');
  if (!tabs) return;
  tabs.innerHTML = DIVISIONS.map((d, i) => `
    <button type="button" class="div-tab div-tab--${d.key}${i === 0 ? ' active' : ''}"
            data-div="${d.key}" role="tab" aria-selected="${i === 0}">
      <span class="div-tab__label">${d.label}</span>
      <span class="div-tab__count">${byDivision[d.key].length} teams</span>
    </button>`).join('');

  tabs.querySelectorAll('.div-tab').forEach((btn) => {
    btn.addEventListener('click', () => selectDivision(btn.dataset.div));
  });
}

function render(sheetTeams, logoMap) {
  const host = document.getElementById('divWheels');
  const emptyState = document.getElementById('teaminfoEmpty');
  if (!host) return;

  // Index the sheet by normalised name so the division lists drive the layout.
  const byName = new Map(sheetTeams.map((t) => [normName(t.teamName), t]));

  const byDivision = {};
  DIVISIONS.forEach((d) => {
    byDivision[d.key] = d.teams.map((name) => {
      const data = byName.get(normName(name));
      return { name: data?.teamName || name, data: data || null };
    });
  });

  // Any registered team not named in a division would silently vanish, so surface it.
  const assigned = new Set(DIVISIONS.flatMap((d) => d.teams.map(normName)));
  const unassigned = sheetTeams.filter((t) => !assigned.has(normName(t.teamName)));
  if (unassigned.length) {
    console.warn('Teams not in any division list:', unassigned.map((t) => t.teamName));
  }

  if (!sheetTeams.length) {
    host.style.display = 'none';
    document.getElementById('divTabs').style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  buildTabs(byDivision);
  host.innerHTML = '';
  DIVISIONS.forEach((d, i) => {
    const panel = document.createElement('div');
    panel.className = 'div-panel' + (i === 0 ? ' active' : '');
    panel.dataset.div = d.key;
    host.appendChild(panel);
    buildWheel(panel, d, byDivision[d.key], logoMap);
  });
}

async function init() {
  initTeamModal();
  // Logos come from Supabase, rosters from the sheet — fetch both at once.
  // fetchTeamLogoMap never rejects; a failure there just means the filename
  // fallback and initials do the work.
  const logoMapPromise = fetchTeamLogoMap();
  try {
    const res = await fetch(SHEETS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const teams = (data.teams || []).filter((t) => t && t.teamName && isVisible(t));
    render(teams, await logoMapPromise);
  } catch (e) {
    console.error('Failed to load team data:', e);
    showToast('Could not load team data. Please try again later.');
    render([], new Map());
  }
}

document.addEventListener('DOMContentLoaded', init);
