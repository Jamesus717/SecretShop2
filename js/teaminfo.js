const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzb6o2RVlR_6Xc9AZBv2MWJi3fYt0tinQH5MPkg_9IuuzKuHeed5MEU0pjUcGmVwgRJPw/exec';

const RING_RADIUS = 260; // px — must match half the .team-wheel width minus node margin, see teaminfo.css
const MIN_SLOTS = 16;
const IMG_EXTS = ['png', 'webp', 'jpg', 'jpeg'];

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

function candidateImagePaths(name) {
  const override = TEAM_IMAGE_OVERRIDES[(name || '').trim()];
  if (override) return [override];

  const paths = [];
  slugCandidates(name).forEach((base) => {
    IMG_EXTS.forEach((ext) => paths.push(`assets/teaminfoimgs/${base}.${ext}`));
  });
  return paths;
}

function loadTeamImage(name) {
  return new Promise((resolve) => {
    const candidates = candidateImagePaths(name);
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

function buildWheel(teams) {
  const ring = document.getElementById('teamWheelRing');
  const emptyState = document.getElementById('teaminfoEmpty');
  if (!ring) return;

  if (!teams.length) {
    document.getElementById('teamWheel').style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  const total = Math.max(MIN_SLOTS, teams.length);
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
      loadTeamImage(team.teamName).then((src) => {
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
  metaEl.textContent = `${players.length} Player${players.length === 1 ? '' : 's'}${team.captainIgn ? ` · Captain: ${team.captainIgn}` : ''}`;

  crestEl.innerHTML = '';
  if (crestSrc) {
    const img = document.createElement('img');
    img.src = crestSrc;
    img.alt = team.teamName;
    crestEl.appendChild(img);
  } else {
    crestEl.textContent = initials(team.teamName);
  }

  rosterEl.innerHTML = players.map((p) => {
    const rankIcon = rankIconPath(p.rank);
    const dbUrl = p.dotabuff || dotabuffUrl(p.steam);
    return `
      <div class="roster-row">
        ${rankIcon ? `<img class="roster-row__rank" src="${rankIcon}" alt="${p.rank}">` : ''}
        <div class="roster-row__info">
          <span class="roster-row__name">${p.ign || 'Unknown'}</span>
          <span class="roster-row__sub">${p.rank || '?'} · Pos ${p.position || '?'}</span>
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
  try {
    const res = await fetch(SHEETS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const teams = (data.teams || []).filter((t) => t && t.teamName);
    buildWheel(teams);
  } catch (e) {
    console.error('Failed to load team data:', e);
    showToast('Could not load team data. Please try again later.');
    buildWheel([]);
  }
}

document.addEventListener('DOMContentLoaded', init);
