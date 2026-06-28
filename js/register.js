import { supabaseClient } from './supabase.js';
import { getSession } from './auth.js';

const RANKS = [
  { icon: 'assets/ranks/herald.png', label: 'Herald' },
  { icon: 'assets/ranks/guardian.png', label: 'Guardian' },
  { icon: 'assets/ranks/crusader.png', label: 'Crusader' },
  { icon: 'assets/ranks/archon.png', label: 'Archon' },
  { icon: 'assets/ranks/legend.png', label: 'Legend' },
  { icon: 'assets/ranks/ancient.png', label: 'Ancient' },
  { icon: 'assets/ranks/divine.png', label: 'Divine' },
  { icon: 'assets/ranks/immortal.png', label: 'Immortal' }
];

const POSITIONS = [
  { val: '1', label: 'Pos 1' },
  { val: '2', label: 'Pos 2' },
  { val: '3', label: 'Pos 3' },
  { val: '4', label: 'Pos 4' },
  { val: '5', label: 'Pos 5' }
];

const RANK_MMR = {
  Herald: 400,
  Guardian: 1050,
  Crusader: 1750,
  Archon: 2450,
  Legend: 3150,
  Ancient: 3850,
  Divine: 4750,
  Immortal: 6000
};

const DRAFT_KEY = 'secretshop_draft_v2';
const WEBHOOK = 'https://discord.com/api/webhooks/1520837122066747525/txndsvwRNDdsC36IjQTxXfmoi9__30vnq8pJxIgsUMe-UIi7qFNZNqat1ClSXVh3LSSR';
const SPREADSHEET_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzY3rgQ4I0p8zFeVQdWqEg9To5GazsZtJBUlazgPAf0lPY-L5pqI1vERvyH_RRI211rAg/exec';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOTS = ['Morning\n(9am–1pm)', 'Afternoon\n(1pm–6pm)', 'Evening\n(6pm–11pm)'];

let currentMode = 'solo';
let currentPlayerStep = 1;

function getVal(id) { return document.getElementById(id) ? document.getElementById(id).value.trim() : ''; }
function getRadio(name) { const el = document.querySelector(`input[name="${name}"]:checked`); return el ? el.value : ''; }
function setInvalid(id, inv) { const el = document.getElementById(id); if(el) el.classList.toggle('invalid', inv); }

function setValIfEmpty(id, v) {
  const el = document.getElementById(id);
  if (!el) return;
  if ((el.value || '').trim() !== '') return;
  el.value = v || '';
}
function setRadio(name, value) {
  if (!value) return;
  const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (el) el.checked = true;
}

function buildRankGrid(cid, prefix) {
  const el = document.getElementById(cid);
  if (!el) return;
  el.innerHTML = RANKS.map((r,i) => `
    <div class="rank-option">
      <input type="radio" name="rank-${prefix}" id="rank-${prefix}-${i}" value="${r.label}">
      <label for="rank-${prefix}-${i}"><img src="${r.icon}" class="rank-icon" alt="">${r.label}</label>
    </div>`).join('');
}

function buildPosGrid(cid, prefix) {
  const el = document.getElementById(cid);
  if (!el) return;
  el.innerHTML = POSITIONS.map((p,i) => `
    <div class="pos-option">
      <input type="radio" name="pos-${prefix}" id="pos-${prefix}-${i}" value="${p.val}">
      <label for="pos-${prefix}-${i}">${p.label}</label>
    </div>`).join('');
}

function buildAvailabilityGrid() {
  const grid = document.getElementById('availabilityGrid');
  if (!grid) return;

  // Header row
  let html = '<div class="avail-header"><div class="avail-corner"></div>';
  DAYS.forEach(d => { html += `<div class="avail-day">${d}</div>`; });
  html += '</div>';

  // Slot rows
  SLOTS.forEach((slot, si) => {
    html += `<div class="avail-row"><div class="avail-slot-label">${slot.replace('\n', '<br>')}</div>`;
    DAYS.forEach((d, di) => {
      const id = `avail-${si}-${di}`;
      html += `<div class="avail-cell" id="${id}" data-slot="${si}" data-day="${di}" tabindex="0" role="checkbox" aria-checked="false" aria-label="${d} ${slot.split('\n')[0]}"></div>`;
    });
    html += '</div>';
  });

  grid.innerHTML = html;

  // Toggle on click or Enter/Space
  grid.querySelectorAll('.avail-cell').forEach(cell => {
    const toggle = () => {
      cell.classList.toggle('selected');
      cell.setAttribute('aria-checked', cell.classList.contains('selected'));
      saveDraft();
    };
    cell.addEventListener('click', toggle);
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
}

function getAvailability() { 
  const selected = []; 
  document.querySelectorAll('.avail-cell.selected').forEach(cell => { 
    const si = parseInt(cell.dataset.slot); 
    const di = parseInt(cell.dataset.day); 
    selected.push({ day: di, slot: si, label: `${DAYS[di]}: ${SLOTS[si].split('\n')[0]}` }); 
  }); 
  // Sort by day then slot 
  selected.sort((a, b) => a.day !== b.day ? a.day - b.day : a.slot - b.slot); 
  return selected.map(s => s.label); 
}

function setAvailability(arr) {
  if (!arr || !arr.length) return;
  document.querySelectorAll('.avail-cell').forEach(cell => {
    // Try both formats in case of old draft data
    const keyOld = `${DAYS[cell.dataset.day]}-${SLOTS[cell.dataset.slot].split('\n')[0]}`;
    const keyNew = `${DAYS[cell.dataset.day]}: ${SLOTS[cell.dataset.slot].split('\n')[0]}`;
    if (arr.includes(keyOld) || arr.includes(keyNew)) {
      cell.classList.add('selected');
      cell.setAttribute('aria-checked', 'true');
    }
  });
}

function buildPlayerCards() {
  const c = document.getElementById('playersContainer');
  if (!c) return;
  c.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const isCap = i === 1;
    c.innerHTML += `
    <div class="player-card" id="player-card-${i}" style="display: ${i === 1 ? 'block' : 'none'};">
      <div class="player-num ${isCap?'cap':''}">
        <div class="badge">${i}</div> PLAYER ${i}${isCap?' — CAPTAIN':''}
      </div>
      <div class="grid-2 player-basic-grid">
        <div class="field" id="f-p${i}-ign"><label>IGN <span>*</span></label><input type="text" id="p${i}-ign"><div class="error-msg">Required</div></div>
        <div class="field" id="f-p${i}-steamName"><label>Steam Name <span>*</span></label><input type="text" id="p${i}-steamName" maxlength="32"><div class="error-msg">Required</div></div>
      </div>
      <div class="grid-2 player-basic-grid">
        <div class="field" id="f-p${i}-steam"><label>Steam ID ${isCap?'<span>*</span>':''}</label><input type="text" id="p${i}-steam" maxlength="17" placeholder="17 digits"><div class="error-msg">Exactly 17 digits required</div></div>
        <div class="field" id="f-p${i}-discord"><label>Discord ${isCap?'':'(Opt)'}</label><input type="text" id="p${i}-discord" maxlength="32"></div>
      </div>
      <div class="player-meta-grid">
        <div class="player-meta-panel">
          <div class="section-label">Rank</div>
          <div class="field required-field" id="f-rankErr-p${i}"><div class="rank-grid" id="rankGrid-p${i}"></div><div class="error-msg" style="margin-top:10px">Please select a rank</div></div>
        </div>
        <div class="player-meta-panel">
          <div class="section-label">Position</div>
          <div class="field required-field" id="f-posErr-p${i}"><div class="pos-grid" id="posGrid-p${i}"></div><div class="error-msg" style="margin-top:10px">Please select a position</div></div>
        </div>
      </div>
    </div>`;
  }
  for (let i = 1; i <= 5; i++) { buildRankGrid('rankGrid-p'+i, 'p'+i); buildPosGrid('posGrid-p'+i, 'p'+i); }
  buildStepperDots();
}

function buildStepperDots() {
  const st = document.getElementById('teamStepper');
  if (!st) return;
  st.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    st.innerHTML += `<div class="stepper-dot ${i === 1 ? 'active' : ''}" id="stepper-dot-${i}" data-step="${i}"></div>`;
  }
}

function updateStepper() {
  for (let i = 1; i <= 5; i++) {
    const card = document.getElementById(`player-card-${i}`);
    const dot = document.getElementById(`stepper-dot-${i}`);
    if (card) card.style.display = i === currentPlayerStep ? 'block' : 'none';
    if (dot) dot.classList.toggle('active', i === currentPlayerStep);
  }
  
  const prevBtn = document.getElementById('prevPlayerBtn');
  const nextBtn = document.getElementById('nextPlayerBtn');
  const submitBtn = document.getElementById('submitBtn');
  
  if (prevBtn) prevBtn.disabled = currentPlayerStep === 1;
  
  if (currentPlayerStep === 5) {
    if (nextBtn) nextBtn.style.display = 'none';
    if (submitBtn) submitBtn.style.display = 'block';
  } else {
    if (nextBtn) nextBtn.style.display = 'block';
    if (submitBtn) submitBtn.style.display = 'none';
  }
  
  const formCard = document.getElementById('formCard');
  if (formCard) formCard.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateField(id) {
  const val = getVal(id);
  if (id === 'steamId' || id.endsWith('-steam')) {
    const isCap = id === 'steamId' || id === 'p1-steam';
    if (isCap) setInvalid('f-'+id, val.length !== 17);
    else if (val) setInvalid('f-'+id, val.length !== 17);
    else setInvalid('f-'+id, false);
  } else if (id === 'discordUser' || id.endsWith('-discord')) {
    setInvalid('f-'+id, false);
  } else {
    setInvalid('f-'+id, !val);
  }
}

function setMode(m) {
  currentMode = m;
  document.body.classList.toggle('team-mode', m === 'team');
  document.getElementById('soloBtn')?.classList.toggle('active', m === 'solo');
  document.getElementById('teamBtn')?.classList.toggle('active', m === 'team');
  
  const submitBtn = document.getElementById('submitBtn');
  const stepperControls = document.getElementById('stepperControls');
  
  if (m === 'solo') {
    if (submitBtn) submitBtn.style.display = 'block';
    if (stepperControls) stepperControls.style.display = 'none';
  } else {
    if (stepperControls) stepperControls.style.display = 'flex';
    updateStepper(); // hide/show submit based on step
  }
  
  saveDraft();
}

function saveDraft() {
  const data = {
    mode: currentMode,
    solo: {
      ign: getVal('ign'),
      steamName: getVal('steamName'),
      steamId: getVal('steamId'),
      discord: getVal('discordUser'),
      rank: getRadio('rank-solo'),
      pos: getRadio('pos-solo')
    },
    team: {
      teamName: getVal('teamName'),
      players: []
    },
    availability: getAvailability()
  };
  for(let i=1; i<=5; i++) {
    data.team.players.push({
      ign: getVal(`p${i}-ign`),
      steamName: getVal(`p${i}-steamName`),
      steamId: getVal(`p${i}-steam`),
      discord: getVal(`p${i}-discord`),
      rank: getRadio(`rank-p${i}`),
      pos: getRadio(`pos-p${i}`)
    });
  }
  localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
}

function loadDraft() {
  const saved = localStorage.getItem(DRAFT_KEY);
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    if (data.mode) setMode(data.mode);
    if (data.solo) {
      if(document.getElementById('ign')) document.getElementById('ign').value = data.solo.ign || '';
      if(document.getElementById('steamName')) document.getElementById('steamName').value = data.solo.steamName || '';
      if(document.getElementById('steamId')) document.getElementById('steamId').value = data.solo.steamId || '';
      if(document.getElementById('discordUser')) document.getElementById('discordUser').value = data.solo.discord || '';
      if(data.solo.rank) setRadio('rank-solo', data.solo.rank);
      if(data.solo.pos) setRadio('pos-solo', data.solo.pos);
    }
    if (data.team) {
      if(document.getElementById('teamName')) document.getElementById('teamName').value = data.team.teamName || '';
      if(data.team.players) {
        data.team.players.forEach((p, i) => {
          const idx = i + 1;
          if(document.getElementById(`p${idx}-ign`)) document.getElementById(`p${idx}-ign`).value = p.ign || '';
          if(document.getElementById(`p${idx}-steamName`)) document.getElementById(`p${idx}-steamName`).value = p.steamName || '';
          if(document.getElementById(`p${idx}-steam`)) document.getElementById(`p${idx}-steam`).value = p.steamId || '';
          if(document.getElementById(`p${idx}-discord`)) document.getElementById(`p${idx}-discord`).value = p.discord || '';
          if(p.rank) setRadio(`rank-p${idx}`, p.rank);
          if(p.pos) setRadio(`pos-p${idx}`, p.pos);
        });
      }
    }
    if (data.availability) setAvailability(data.availability);
  } catch (e) { console.error('Failed to load draft'); }
}

async function prefillFromProfile() {
  const session = await getSession();
  if (!session) return;
  const user = session.user;
  const md = user?.user_metadata || {};
  const discordName = md.full_name || md.name || '';
  if (discordName) setValIfEmpty('discordUser', discordName);

  const { data } = await supabaseClient.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!data) return;

  setValIfEmpty('ign', data.ign || '');
  setValIfEmpty('steamId', data.steam_id || '');
  if (data.rank) setRadio('rank-solo', data.rank);
  if (data.primary_position) setRadio('pos-solo', String(data.primary_position));

  setValIfEmpty('p1-ign', data.ign || '');
  setValIfEmpty('p1-steam', data.steam_id || '');
  if (data.rank) setRadio('rank-p1', data.rank);
  if (data.primary_position) setRadio('pos-p1', String(data.primary_position));
  if (discordName) setValIfEmpty('p1-discord', discordName);
}

async function insertSupabaseSolo(solo) {
  await supabaseClient.from('solo_registrations').insert({
    ign: solo.ign,
    steam_name: solo.steamName,
    steam_id: solo.steamId,
    discord_username: solo.discord || null,
    rank: solo.rank,
    primary_position: Number(solo.pos)
  });
}

async function insertSupabaseTeam(teamName, players) {
  const avgMmr = Math.round(players.reduce((sum, p) => sum + (RANK_MMR[p.rank] || 0), 0) / Math.max(players.length, 1));
  const captain = players[0] || {};
  
  await supabaseClient.from('team_registrations').insert({
    team_name: teamName,
    captain_ign: captain.ign || '',
    captain_discord: captain.discord || null,
    players: players.map((p) => ({
      ign: p.ign,
      steam_id: p.sid,
      discord_username: p.discord || null,
      rank: p.rank,
      primary_position: Number(p.pos)
    })),
    avg_mmr: avgMmr
  });
}

export async function handleSubmit() {
  let ok = true;
  let payload = { embeds: [] };

  if (currentMode === 'solo') {
    const ign = getVal('ign'), sName = getVal('steamName'), sid = getVal('steamId'), discord = getVal('discordUser'), rank = getRadio('rank-solo'), pos = getRadio('pos-solo');
    
    validateField('ign'); validateField('steamName'); validateField('steamId');
    if(!ign || !sName || sid.length !== 17 || !rank || !pos) ok = false;
    
    setInvalid('f-rankErr-solo', !rank);
    setInvalid('f-posErr-solo', !pos);

    if(ok) {
      payload.embeds.push({
        title: "⚔️ New Solo Registration",
        color: 0xc89b3c,
        fields: [
          { name: "IGN", value: ign, inline: true },
          { name: "Steam Name", value: sName, inline: true },
          { name: "Discord", value: discord || "N/A", inline: true },
          { name: "Rank", value: rank, inline: true },
          { name: "Position", value: "Pos " + pos, inline: true },
          { name: "Steam ID", value: `[${sid}](https://steamcommunity.com/profiles/${sid})`, inline: true },
          { name: "Dotabuff", value: sid ? `[${sid}](https://www.dotabuff.com/players/${sid})` : 'N/A', inline: true },
          { name: "Availability", value: getAvailability().length ? getAvailability().join(' | ') : 'No availability selected' }
        ]
      });
    }
  } else {
    const tname = getVal('teamName');
    validateField('teamName');
    if(!tname) ok = false;

    let playersData = [];
    for (let i = 1; i <= 5; i++) {
      const ign = getVal(`p${i}-ign`), sName = getVal(`p${i}-steamName`), sid = getVal(`p${i}-steam`), discord = getVal(`p${i}-discord`), rank = getRadio(`rank-p${i}`), pos = getRadio(`pos-p${i}`);
      validateField(`p${i}-ign`); validateField(`p${i}-steamName`); validateField(`p${i}-steam`);
      
      if(!ign || !sName || (i===1 && sid.length !== 17) || (sid && sid.length !== 17) || !rank || !pos) ok = false;
      setInvalid(`f-rankErr-p${i}`, !rank);
      setInvalid(`f-posErr-p${i}`, !pos);
      
      playersData.push({ ign, sName, sid, discord, rank, pos });
    }

    if(ok) {
      payload.embeds.push({
        title: `🛡️ New Team Registration: ${tname}`,
        color: 0x7b5ea7,
        fields: playersData.map((p, i) => ({
          name: `Player ${i+1}${i===0?' (Captain)':''}`,
          value: `**IGN:** ${p.ign}\n**Steam:** ${p.sName}\n**Rank:** ${p.rank}\n**Pos:** ${p.pos}\n**ID:** ${p.sid || 'N/A'}\n**Dotabuff:** ${p.sid ? `[${p.sid}](https://www.dotabuff.com/players/${p.sid})` : 'N/A'}`,
          inline: true
        })).concat([
          { name: "Availability", value: getAvailability().length ? getAvailability().join(' | ') : 'No availability selected' }
        ])
      });
    }
  }

  if (!ok) {
    const invalidEl = document.querySelector('.invalid');
    const formCard = document.getElementById('formCard');
    if (formCard && invalidEl) {
      formCard.scrollTo({ top: invalidEl.offsetTop - 40, behavior: 'smooth' });
    }
    return;
  }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = '🛡️ TRANSMITTING...';
  
  try {
    // 1. Send to Discord
    const discordRes = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // 2. Send to Google Sheets
    if (SPREADSHEET_SCRIPT_URL) {
      const sheetData = currentMode === 'solo' ? {
        type: 'solo',
        timestamp: new Date().toLocaleString(),
        ign: getVal('ign'),
        steam: getVal('steamId'),
        dotabuff: getVal('steamId') ? `https://www.dotabuff.com/players/${getVal('steamId')}` : '',
        discord: getVal('discordUser'),
        rank: getRadio('rank-solo'),
        position: getRadio('pos-solo'),
        availability: getAvailability().length ? getAvailability().join(' | ') : 'No availability selected'
      } : {
        type: 'team',
        timestamp: new Date().toLocaleString(),
        teamName: getVal('teamName'),
        players: [1,2,3,4,5].map(i => ({
          ign: getVal(`p${i}-ign`),
          steam: getVal(`p${i}-steam`),
          dotabuff: getVal(`p${i}-steam`) ? `https://www.dotabuff.com/players/${getVal(`p${i}-steam`)}` : '',
          rank: getRadio(`rank-p${i}`),
          position: getRadio(`pos-p${i}`)
        })),
        availability: getAvailability().length ? getAvailability().join(' | ') : 'No availability selected'
      };

      fetch(SPREADSHEET_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        cache: 'no-cache',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(sheetData)
      }).catch(()=>{});
    }

    // 3. Supabase insert
    if (currentMode === 'solo') {
      await insertSupabaseSolo({
        ign: getVal('ign'),
        steamName: getVal('steamName'),
        steamId: getVal('steamId'),
        discord: getVal('discordUser'),
        rank: getRadio('rank-solo'),
        pos: getRadio('pos-solo')
      }).catch(()=>{});
    } else {
      const playersData = [];
      for(let i=1;i<=5;i++) playersData.push({
        ign: getVal(`p${i}-ign`),
        sName: getVal(`p${i}-steamName`),
        sid: getVal(`p${i}-steam`),
        discord: getVal(`p${i}-discord`),
        rank: getRadio(`rank-p${i}`),
        pos: getRadio(`pos-p${i}`)
      });
      await insertSupabaseTeam(getVal('teamName'), playersData).catch(()=>{});
    }

    if(discordRes.ok) {
      document.getElementById('formContent').style.display = 'none';
      document.getElementById('successMsg').style.display = 'flex';
      localStorage.removeItem(DRAFT_KEY);
      const formCard = document.getElementById('formCard');
      if (formCard) formCard.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      throw new Error();
    }
  } catch (e) {
    alert('Transmission failed. Please check your connection and try again.');
    btn.disabled = false;
    btn.textContent = '⚔ Submit Entry ⚔';
  }
}

function init() {
  buildRankGrid('rankGrid-solo', 'solo');
  buildPosGrid('posGrid-solo', 'solo');
  buildPlayerCards();
  buildAvailabilityGrid();
  
  document.getElementById('soloBtn')?.addEventListener('click', () => setMode('solo'));
  document.getElementById('teamBtn')?.addEventListener('click', () => setMode('team'));
  document.getElementById('submitBtn')?.addEventListener('click', handleSubmit);

  document.getElementById('prevPlayerBtn')?.addEventListener('click', () => {
    if (currentPlayerStep > 1) {
      currentPlayerStep--;
      updateStepper();
    }
  });

  document.getElementById('nextPlayerBtn')?.addEventListener('click', () => {
    if (currentPlayerStep < 5) {
      // Validate current player before allowing next
      let ok = true;
      const i = currentPlayerStep;
      const isCap = i === 1;
      
      if (i === 1) {
        const tname = getVal('teamName');
        validateField('teamName');
        if (!tname) ok = false;
      }
      
      const ign = getVal(`p${i}-ign`), sName = getVal(`p${i}-steamName`), sid = getVal(`p${i}-steam`), rank = getRadio(`rank-p${i}`), pos = getRadio(`pos-p${i}`);
      validateField(`p${i}-ign`); validateField(`p${i}-steamName`); validateField(`p${i}-steam`);
      
      if(!ign || !sName || (isCap && sid.length !== 17) || (sid && sid.length !== 17) || !rank || !pos) ok = false;
      setInvalid(`f-rankErr-p${i}`, !rank);
      setInvalid(`f-posErr-p${i}`, !pos);
      
      if (ok) {
        currentPlayerStep++;
        updateStepper();
      } else {
        // Optional: show a small toast or just let the red borders show
        const t = document.getElementById('toast');
        if (t) {
          t.textContent = 'Please fill out all required fields correctly.';
          t.classList.add('show');
          setTimeout(() => t.classList.remove('show'), 2600);
        }
      }
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target?.id === 'steamId' || (e.target?.id || '').endsWith('-steam')) {
      e.target.value = (e.target.value || '').replace(/\D/g, '');
    }
    if (e.target?.tagName === 'INPUT') validateField(e.target.id);
    saveDraft();
  });
  document.addEventListener('change', (e) => {
    if (e.target?.type === 'radio') saveDraft();
  });

  const forceMode = localStorage.getItem('sl_force_mode');
  if (forceMode) {
    setMode(forceMode);
    localStorage.removeItem('sl_force_mode');
  } else {
    loadDraft();
  }
  
  prefillFromProfile().catch(() => {});
}

document.addEventListener('DOMContentLoaded', init);
window.SecretLeagueRegister = { setMode, handleSubmit };
