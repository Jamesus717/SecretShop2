import { supabaseClient } from './supabase.js';

const ROUND_TYPES = { 
  GROUP:      'group', 
  UPPER:      'upper', 
  LOWER:      'lower', 
  GRAND_FINAL:'grand_final' 
};

let __teams = {};
let __matches = [];
let __registrations = [];
let __teamRegistrations = [];
let __selectedPlayerId = null;

const route = {
  'group-1-1': { w: 'upper-1-1-a', l: 'lower-1-1-a' },
  'group-1-2': { w: 'upper-1-1-b', l: 'lower-1-1-b' },
  'group-1-3': { w: 'upper-1-2-a', l: 'lower-1-2-a' },
  'group-1-4': { w: 'upper-1-2-b', l: 'lower-1-2-b' },
  'group-1-5': { w: 'upper-1-3-a', l: 'lower-1-3-a' },

  'upper-1-1': { w: 'upper-2-1-a', l: 'lower-2-1-a' },
  'upper-1-2': { w: 'upper-2-1-b', l: 'lower-2-2-a' },
  'upper-1-3': { w: 'upper-2-2-a', l: null },

  'upper-2-1': { w: 'upper-3-1-a', l: 'lower-3-1-a' },
  'upper-2-2': { w: 'upper-3-1-b', l: 'lower-3-1-b' },

  'upper-3-1': { w: 'grand_final-1-1-a', l: 'lower-4-1-a' },

  'lower-1-1': { w: 'lower-2-1-b', l: null },
  'lower-1-2': { w: 'lower-2-2-b', l: null },
  'lower-1-3': { w: 'lower-2-2-b', l: null }, 
  
  'lower-2-1': { w: 'lower-3-1-a', l: null },
  'lower-2-2': { w: 'lower-3-1-b', l: null },

  'lower-3-1': { w: 'lower-4-1-b', l: null },

  'lower-4-1': { w: 'grand_final-1-1-b', l: null }
};

function showToast(msg) {
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

function teamName(id) {
  if (!id) return "TBD";
  return __teams[id] ? __teams[id].name : "TBD";
}

function slotClass(match, side) {
  if (match.status !== 'complete') return '';
  const teamId = side === 'a' ? match.team_a_id : match.team_b_id;
  if (!teamId) return '';
  return match.winner_id === teamId ? 'match-slot--winner' : 'match-slot--loser';
}

function matchCard(match) {
  const isAdmin = window.__isAdmin;
  const slotA = slotClass(match, 'a');
  const slotB = slotClass(match, 'b');
  const bo = match.round_type === 'grand_final' ? 5 : 3;
  const winBtnA = (isAdmin && match.status === 'pending' && match.team_a_id && match.team_b_id)
    ? `<button class="win-btn" data-match="${match.id}" data-winner="${match.team_a_id}">W</button>`
    : '';
  const slotBContent = match.is_bye
    ? `<span class="match-team-name match-bye">— BYE —</span>`
    : `<span class="match-team-name">${teamName(match.team_b_id)}</span>`;
  const winBtnB = (isAdmin && match.status === 'pending' && match.team_a_id && (match.team_b_id || match.is_bye))
    ? `<button class="win-btn" data-match="${match.id}" data-winner="${match.is_bye ? match.team_a_id : match.team_b_id}">W</button>`
    : '';
  const resultBlock = match.status === 'complete'
    ? `<div class="match-result">
         Winner: <strong>${teamName(match.winner_id)}</strong>
         ${isAdmin ? `<button class="undo-btn" data-match="${match.id}">Undo</button>` : ''}
       </div>`
    : '';
  return `
    <div class="match-card" data-match-id="${match.id}" data-status="${match.status}">
      <div class="match-label">Match ${match.match_number}</div>
      <div class="match-slot ${slotA}" data-side="a">
        <span class="match-team-name">${teamName(match.team_a_id)}</span>
        ${winBtnA}
      </div>
      <div class="match-vs">BO${bo}</div>
      <div class="match-slot ${slotB}" data-side="b">
        ${slotBContent}
        ${winBtnB}
      </div>
      ${resultBlock}
    </div>
  `;
}

function renderBracket() {
  const emptyState = document.getElementById('bracket-empty');
  
  if (!__matches || __matches.length === 0) {
    emptyState.style.display = 'block';
    document.querySelectorAll('.bracket-section').forEach(el => el.style.display = 'none');
    return;
  }
  
  emptyState.style.display = 'none';
  document.querySelectorAll('.bracket-section').forEach(el => el.style.display = 'flex');

  // Group
  const groups = __matches.filter(m => m.round_type === ROUND_TYPES.GROUP);
  document.getElementById('round-group').innerHTML = groups.map(m => matchCard(m)).join('');

  // Upper
  const upper = __matches.filter(m => m.round_type === ROUND_TYPES.UPPER);
  const uCols = Math.max(...upper.map(m => m.round_number), 0);
  let upperHtml = '';
  for(let i=1; i<=uCols; i++) {
    const roundMatches = upper.filter(m => m.round_number === i);
    upperHtml += `
      <div class="bracket-column">
        <div class="bracket-column-label">Round ${i}</div>
        ${roundMatches.map(m => matchCard(m)).join('')}
      </div>
    `;
  }
  document.getElementById('bracket-upper').innerHTML = upperHtml;

  // Lower
  const lower = __matches.filter(m => m.round_type === ROUND_TYPES.LOWER);
  const lCols = Math.max(...lower.map(m => m.round_number), 0);
  let lowerHtml = '';
  for(let i=1; i<=lCols; i++) {
    const roundMatches = lower.filter(m => m.round_number === i);
    lowerHtml += `
      <div class="bracket-column">
        <div class="bracket-column-label">Round ${i}</div>
        ${roundMatches.map(m => matchCard(m)).join('')}
      </div>
    `;
  }
  document.getElementById('bracket-lower').innerHTML = lowerHtml;

  // Final
  const gf = __matches.filter(m => m.round_type === ROUND_TYPES.GRAND_FINAL);
  document.getElementById('round-final').innerHTML = gf.map(m => matchCard(m)).join('');

  // Champion
  const gfComplete = gf.find(m => m.status === 'complete');
  const view = document.getElementById('bracket-view');
  const existingBanner = view.querySelector('.champion-banner');
  if (existingBanner) existingBanner.remove();

  if (gfComplete) {
    view.insertAdjacentHTML('afterbegin', `
      <div class="champion-banner"> 
        <div class="champion-crown">👑</div> 
        <div class="champion-label">Tournament Champion</div> 
        <div class="champion-name">${teamName(gfComplete.winner_id)}</div> 
      </div>
    `);
  }

  // Attach listeners
  if (window.__isAdmin) {
    document.querySelectorAll('.win-btn').forEach(btn => {
      btn.addEventListener('click', () => declareWinner(btn.dataset.match, btn.dataset.winner));
    });
    document.querySelectorAll('.undo-btn').forEach(btn => {
      btn.addEventListener('click', () => undoMatch(btn.dataset.match));
    });
  }
}

async function loadBracket() {
  const { data: tData } = await supabaseClient.from('tournament_teams').select('*');
  __teams = {};
  if (tData) {
    tData.forEach(t => __teams[t.id] = t);
  }

  const { data: mData } = await supabaseClient.from('tournament_matches').select('*')
    .order('round_type', { ascending: true })
    .order('round_number', { ascending: true })
    .order('match_number', { ascending: true });
  
  __matches = mData || [];
  renderBracket();
}

async function declareWinner(matchId, winnerId) {
  const match = __matches.find(m => m.id === matchId);
  if (!match) return;

  const loserId = match.team_a_id === winnerId ? match.team_b_id : match.team_a_id;
  
  // Update current
  await supabaseClient.from('tournament_matches')
    .update({ winner_id: winnerId, status: 'complete' })
    .eq('id', matchId);

  // Feed to next
  const routeKey = `${match.round_type}-${match.round_number}-${match.match_number}`;
  const routes = route[routeKey];
  
  if (routes) {
    if (routes.w) await pushToMatch(routes.w, winnerId);
    if (routes.l && loserId) await pushToMatch(routes.l, loserId);
  }

  await loadBracket();
  showToast('Result recorded.');
}

async function pushToMatch(routeStr, teamId) {
  if (!routeStr) return;
  const parts = routeStr.split('-');
  const rt = parts[0], rn = parseInt(parts[1]), mn = parseInt(parts[2]), side = parts[3];

  const targetMatch = __matches.find(m => m.round_type === rt && m.round_number === rn && m.match_number === mn);
  if (!targetMatch) return;

  const update = side === 'a' ? { team_a_id: teamId } : { team_b_id: teamId };
  await supabaseClient.from('tournament_matches').update(update).eq('id', targetMatch.id);

  // Handle auto bye
  if (targetMatch.is_bye) {
    // If it's a bye match and we just fed a team in, they auto win
    await supabaseClient.from('tournament_matches').update({ winner_id: teamId, status: 'complete' }).eq('id', targetMatch.id);
    
    // Auto feed them forward
    const nextRoute = route[`${rt}-${rn}-${mn}`];
    if (nextRoute && nextRoute.w) {
      await pushToMatch(nextRoute.w, teamId);
    }
  }
}

async function undoMatch(matchId) {
  await supabaseClient.from('tournament_matches')
    .update({ winner_id: null, status: 'pending' })
    .eq('id', matchId);
  await loadBracket();
}

async function seedBracket() {
  const teamKeys = Object.keys(__teams);
  if (teamKeys.length !== 10) {
    showToast(`Need exactly 10 teams to seed. Currently have ${teamKeys.length}.`);
    return;
  }

  if(!confirm('This will delete all current matches and recreate the bracket. Proceed?')) return;

  // Clear existing
  for(const m of __matches) {
    await supabaseClient.from('tournament_matches').delete().eq('id', m.id);
  }

  const matchesToCreate = [
    { round_type: 'group', round_number: 1, match_number: 1, team_a_id: teamKeys[0], team_b_id: teamKeys[1] },
    { round_type: 'group', round_number: 1, match_number: 2, team_a_id: teamKeys[2], team_b_id: teamKeys[3] },
    { round_type: 'group', round_number: 1, match_number: 3, team_a_id: teamKeys[4], team_b_id: teamKeys[5] },
    { round_type: 'group', round_number: 1, match_number: 4, team_a_id: teamKeys[6], team_b_id: teamKeys[7] },
    { round_type: 'group', round_number: 1, match_number: 5, team_a_id: teamKeys[8], team_b_id: teamKeys[9] },
    { round_type: 'upper', round_number: 1, match_number: 1 },
    { round_type: 'upper', round_number: 1, match_number: 2 },
    { round_type: 'upper', round_number: 1, match_number: 3, is_bye: true },
    { round_type: 'upper', round_number: 2, match_number: 1 },
    { round_type: 'upper', round_number: 2, match_number: 2 },
    { round_type: 'upper', round_number: 3, match_number: 1 },
    { round_type: 'lower', round_number: 1, match_number: 1 },
    { round_type: 'lower', round_number: 1, match_number: 2 },
    { round_type: 'lower', round_number: 1, match_number: 3, is_bye: true },
    { round_type: 'lower', round_number: 2, match_number: 1 },
    { round_type: 'lower', round_number: 2, match_number: 2 },
    { round_type: 'lower', round_number: 3, match_number: 1 },
    { round_type: 'lower', round_number: 4, match_number: 1 },
    { round_type: 'grand_final', round_number: 1, match_number: 1 },
  ];

  await supabaseClient.from('tournament_matches').insert(matchesToCreate);
  await loadBracket();
  showToast('Bracket seeded!');
}

async function loadAdminPanel() {
  if (!window.__isAdmin) return;

  const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzb6o2RVlR_6Xc9AZBv2MWJi3fYt0tinQH5MPkg_9IuuzKuHeed5MEU0pjUcGmVwgRJPw/exec';
  
  let sheetsData = { solo: [], teams: [] }; 
  try { 
    const res = await fetch(SHEETS_URL); 
    if (res.ok) sheetsData = await res.json(); 
  } catch (e) { 
    showToast('Could not load registrations from Google Sheets.'); 
  } 
  
  __registrations = sheetsData.solo || []; 
  __teamRegistrations = sheetsData.teams || [];

  renderTeamBuilder();

  // Bindings
  document.querySelectorAll('.admin-tab').forEach(t => {
    t.addEventListener('click', (e) => {
      document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById(`tab-${e.target.dataset.tab}`).classList.add('active');
    });
  });

  document.getElementById('create-team-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('new-team-name');
    if(!input.value.trim()) return;
    await supabaseClient.from('tournament_teams').insert({ name: input.value.trim(), player_ids: [] });
    input.value = '';
    await loadBracket();
    await loadAdminPanel();
  });

  document.getElementById('seed-bracket-btn')?.addEventListener('click', seedBracket);
  document.getElementById('reset-bracket-btn')?.addEventListener('click', async () => {
    if(confirm('Delete all matches?')) {
      for(const m of __matches) {
        await supabaseClient.from('tournament_matches').delete().eq('id', m.id);
      }
      await loadBracket();
    }
  });
}

function renderTeamBuilder() {
  const unassignedList = document.getElementById('unassigned-list');
  const teamSlots = document.getElementById('team-slots');
  if(!unassignedList || !teamSlots) return;

  // All players currently in teams
  const assignedIds = new Set();
  Object.values(__teams).forEach(t => {
    if(t.player_ids) t.player_ids.forEach(pid => assignedIds.add(pid));
  });

  // Unassigned
  const unassigned = __registrations.filter(r => !assignedIds.has(r.id)); 
  
  // Solo players section 
  const soloHtml = unassigned.length > 0 
    ? `<div class="builder-section-label">Solo Players (${unassigned.length})</div>` + 
      unassigned.map(p => ` 
        <div class="player-chip ${__selectedPlayerId === p.id ? 'selected' : ''}"  
             data-id="${p.id}"> 
          <span class="chip-name">${p.ign || p.discord || 'Unknown'}</span> 
          <span class="chip-rank">${p.rank || '?'} · Pos ${p.position || '?'}</span> 
        </div> 
      `).join('') 
    : `<div class="admin-hint">No unassigned solo players.</div>`; 
   
  // Pre-registered teams section 
  const teamsHtml = __teamRegistrations.length > 0 
    ? `<div class="builder-section-label" style="margin-top:16px"> 
         Pre-Registered Teams (${__teamRegistrations.length}) 
       </div>` + 
      __teamRegistrations.map(t => ` 
        <div class="prereg-team"> 
          <div class="prereg-team-name">${t.teamName}</div> 
          <div class="prereg-team-players"> 
            ${(t.players || []).map(p => ` 
              <div class="player-chip small" data-id="${p.id}"> 
                <span class="chip-name">${p.ign || 'Player'}</span> 
                <span class="chip-rank">${p.rank || '?'}</span> 
              </div> 
            `).join('')} 
          </div> 
          <button class="admin-btn admin-btn--primary import-team-btn"  
                  data-team='${JSON.stringify(t).replace(/'/g, "&#39;")}'  
                  style="margin-top:6px;font-size:0.65rem;padding:6px"> 
            Import as Tournament Team 
          </button> 
        </div> 
      `).join('') 
    : ''; 
   
  unassignedList.innerHTML = soloHtml + teamsHtml; 

  unassignedList.querySelectorAll('.import-team-btn').forEach(btn => { 
    btn.addEventListener('click', async (e) => { 
      e.stopPropagation(); 
      btn.disabled = true; 
      btn.textContent = 'Importing...'; 

      let teamData; 
      try { 
        teamData = JSON.parse(btn.dataset.team.replace(/&#39;/g, "'")); 
      } catch (err) { 
        showToast('Failed to read team data.'); 
        btn.disabled = false; 
        btn.textContent = 'Import as Tournament Team'; 
        return; 
      } 

      // Check if already imported 
      const already = Object.values(__teams).find(t => t.name === teamData.teamName); 
      if (already) { 
        showToast(`"${teamData.teamName}" is already imported.`); 
        btn.disabled = false; 
        btn.textContent = 'Import as Tournament Team'; 
        return; 
      } 

      const { error } = await supabaseClient 
        .from('tournament_teams') 
        .insert({ 
          name: teamData.teamName, 
          player_ids: [], 
          players: teamData.players || [] 
        }); 

      if (error) { 
        showToast('Import failed: ' + (error.message || 'unknown error')); 
        btn.disabled = false; 
        btn.textContent = 'Import as Tournament Team'; 
        return; 
      } 

      showToast(`"${teamData.teamName}" imported!`); 
      await loadBracket(); 
      await loadAdminPanel(); 
    }); 
  }); 

  unassignedList.querySelectorAll('.player-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      __selectedPlayerId = __selectedPlayerId === chip.dataset.id ? null : chip.dataset.id;
      renderTeamBuilder();
    });
  });

  // Teams
  teamSlots.innerHTML = Object.values(__teams).map(t => {
    // Merge: jsonb players (pre-reg) + solo assignments via player_ids
    const preregPlayers = Array.isArray(t.players) ? t.players : [];
    const soloPlayers = (t.player_ids || []).map(pid => {
      const found = __registrations.find(r => r.id === pid);
      return found ? { ign: found.ign || found.discord, rank: found.rank, position: found.position, _soloId: pid } : null;
    }).filter(Boolean);

    const allPlayers = [...preregPlayers.map(p => ({ ...p, _type: 'prereg' })), ...soloPlayers.map(p => ({ ...p, _type: 'solo' }))];
    const count = allPlayers.length;
    const isFull = count >= 5;

    const slots = [];
    for (let i = 0; i < 5; i++) {
      const p = allPlayers[i];
      if (p) {
        slots.push(`
          <div class="team-player-row">
            <span class="team-player-name">${p.ign || 'Unknown'}</span>
            <span class="team-player-rank">${p.rank || '?'} · Pos ${p.position || '?'}</span>
            ${p._type === 'solo' ? `<button class="remove-btn" data-team="${t.id}" data-player="${p._soloId}">✕</button>` : ''}
          </div>
        `);
      } else {
        const isNext = i === count;
        slots.push(`
          <div class="team-player-row team-player-row--empty ${isNext && __selectedPlayerId ? 'team-player-row--ready' : ''}">
            <span class="team-player-empty">
              ${isNext && __selectedPlayerId ? '← Click to assign' : `Player ${i + 1}`}
            </span>
          </div>
        `);
      }
    }
    return `
      <div class="team-slot ${isFull ? 'team-slot--full' : ''}" data-id="${t.id}">
        <div class="team-slot-header">
          <span class="team-slot-name">${t.name}</span>
          <span class="team-slot-count ${isFull ? 'team-slot-count--full' : ''}">${count}/5</span>
          ${count === 0 ? `<button class="delete-team-btn" data-id="${t.id}">Delete</button>` : ''}
        </div>
        <div class="team-slot-players">
          ${slots.join('')}
        </div>
      </div>
    `;
  }).join('');

  teamSlots.querySelectorAll('.team-slot').forEach(slot => {
    slot.addEventListener('click', async (e) => {
      if(e.target.tagName === 'BUTTON') return; // Ignore button clicks
      if(!__selectedPlayerId) return;

      const teamId = slot.dataset.id;
      const team = __teams[teamId];
      const teamCount = (Array.isArray(team.players) ? team.players.length : 0) + ((team.player_ids || []).length);
      if(teamCount >= 5) {
        showToast('Team is full (max 5).');
        return;
      }
      
      const newIds = [...(team.player_ids || []), __selectedPlayerId];
      await supabaseClient.from('tournament_teams').update({ player_ids: newIds }).eq('id', teamId);
      __selectedPlayerId = null;
      await loadBracket();
      await loadAdminPanel();
    });
  });

  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const teamId = btn.dataset.team;
      const playerId = btn.dataset.player;
      const team = __teams[teamId];
      const newIds = (team.player_ids || []).filter(id => id !== playerId);
      await supabaseClient.from('tournament_teams').update({ player_ids: newIds }).eq('id', teamId);
      await loadBracket();
      await loadAdminPanel();
    });
  });

  document.querySelectorAll('.delete-team-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if(!confirm('Delete this team?')) return;
      await supabaseClient.from('tournament_teams').delete().eq('id', btn.dataset.id);
      await loadBracket();
      await loadAdminPanel();
    });
  });
}

async function boot() {
  await loadBracket();

  // Poll for auth to finish (auth.js is async and may not be done yet)
  let waited = 0;
  while (window.__isAdmin === undefined && waited < 3000) {
    await new Promise(r => setTimeout(r, 100));
    waited += 100;
  }

  if (window.__isAdmin) await loadAdminPanel();
}

document.addEventListener('DOMContentLoaded', boot);
