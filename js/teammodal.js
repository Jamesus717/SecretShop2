// Team roster modal, shared by Team Info and the Group Stage schedule.
//
// Both pages include the same #teamModalOverlay markup (see either HTML file)
// and link css/team-modal.css. Call initTeamModal() once, then openTeamModal().

import { RANKS, mmrToRank } from './ranks.js';

const IMMORTAL_NOMINAL_MMR = 6000;

export function initials(name) {
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

// Team and player names are captain-supplied, so escape anything going into
// innerHTML. Without this a name containing markup would execute on the page.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// The sheet marks the captain's roster row with isCaptain. team.captain holds
// their IGN (not a slot number) and is the fallback when the flag is missing.
export function captainIndex(team, players) {
  const flagged = players.findIndex((p) => p.isCaptain === true || p.isCaptain === 'TRUE' || p.isCaptain === 1);
  if (flagged !== -1) return flagged;

  const capIgn = String(team.captain ?? team.captainIgn ?? '').trim().toLowerCase();
  if (capIgn) {
    const i = players.findIndex((p) => (p.ign || '').trim().toLowerCase() === capIgn);
    if (i !== -1) return i;
  }
  return -1;
}

// Real per-player MMR is preferred; teams registered before the MMR columns
// existed fall back to averaging rank bands, labelled "Avg Rank" so an
// approximation is never presented as a real average.
export function teamStrengthLabel(players) {
  const mmrs = players.map((p) => Number(p.mmr)).filter((n) => Number.isFinite(n) && n > 0);
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

export function openTeamModal(team, crestSrc) {
  const overlay = document.getElementById('teamModalOverlay');
  const nameEl = document.getElementById('teamModalName');
  const metaEl = document.getElementById('teamModalMeta');
  const crestEl = document.getElementById('teamModalCrest');
  const rosterEl = document.getElementById('teamModalRoster');
  if (!overlay) return;

  nameEl.textContent = team.teamName || 'Unknown Team';

  const players = (team.players || []).filter((p) => p && (p.ign || p.steam));
  const capIdx = captainIndex(team, players);
  // The captain is identifiable from the 👑 on their row, so this line carries
  // team strength instead.
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
        ${rankIcon ? `<img class="roster-row__rank" src="${esc(rankIcon)}" alt="${esc(p.rank)}">` : ''}
        <div class="roster-row__info">
          <span class="roster-row__name">${esc(p.ign || 'Unknown')}${isCap ? '<span class="roster-row__crown" title="Team Captain" aria-label="Team Captain">👑</span>' : ''}</span>
          <span class="roster-row__sub">${isCap ? 'Captain · ' : ''}${esc(p.rank || '?')} · Pos ${esc(p.position || '?')}</span>
        </div>
        ${dbUrl
          ? `<a class="roster-row__dotabuff" href="${esc(dbUrl)}" target="_blank" rel="noopener">Dotabuff ↗</a>`
          : `<span class="roster-row__missing">No Dotabuff</span>`}
      </div>
    `;
  }).join('');

  overlay.classList.add('show');
}

export function closeTeamModal() {
  document.getElementById('teamModalOverlay')?.classList.remove('show');
}

export function initTeamModal() {
  document.getElementById('teamModalClose')?.addEventListener('click', closeTeamModal);
  document.getElementById('teamModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'teamModalOverlay') closeTeamModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTeamModal();
  });
}
