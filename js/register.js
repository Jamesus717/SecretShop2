import { supabaseClient } from './supabase.js';
import { getSession, signInWithDiscord } from './auth.js';
import { mmrToRank } from './ranks.js';
import { prepareLogo, uploadTeamLogo, saveTeamLogoRecord, deleteTeamLogo } from './teamlogo.js';

const POSITIONS = [
  { val: '1', label: 'Pos 1' },
  { val: '2', label: 'Pos 2' },
  { val: '3', label: 'Pos 3' },
  { val: '4', label: 'Pos 4' },
  { val: '5', label: 'Pos 5' }
];

const DRAFT_KEY = 'secretshop_draft_v2';
const WEBHOOK = 'https://discord.com/api/webhooks/1521956889406083225/NzjKlmZre6tCkM9RWSsxgQjfYaACu7RwUny-exSHpFjDMRXT5v1PGPb2d6-rfZWTrdKZ'; // admin channel — sign-up notifications (solo + team)
const LFT_WEBHOOK = 'https://discord.com/api/webhooks/1521961134285127830/0JkbT2vbUH18Ah7W9NAgm0bPkuA4b2cXZ9E7gd59Hig0JIHCwnh3xIeXq4jIrod8cSob'; // looking-for-players channel — solo entries only
const SPREADSHEET_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw26eQGz0zFl-CpzyyJvalelnUE7YDFkYFFgkD6Cy9hGPn9gKZWC08CWz2OSBLf97n9Sw/exec';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOTS = ['Morning\n(9am–1pm)', 'Afternoon\n(1pm–6pm)', 'Evening\n(6pm–11pm)'];

let currentMode = 'team';
let currentPlayerStep = 1;
let __session = null;
let __existingTeam = null;
// Resized team logo, held in both forms: the blob is what gets uploaded, the
// data URL is what survives a page reload in the saved draft.
let __logoBlob = null;
let __logoDataUrl = null;

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}

function getVal(id) { return document.getElementById(id) ? document.getElementById(id).value.trim() : ''; }
function getRadio(name) { const el = document.querySelector(`input[name="${name}"]:checked`); return el ? el.value : ''; }
function setInvalid(id, inv) { const el = document.getElementById(id); if(el) el.classList.toggle('invalid', inv); }
function getCaptainIndex() { const n = parseInt(getRadio('teamCaptain'), 10); return (n >= 1 && n <= 5) ? n : 1; }

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

function getMmr(prefix) {
  const v = parseInt(getVal(`mmr-${prefix}`), 10);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function getRankLabel(prefix) {
  const mmr = getMmr(prefix);
  return mmr ? (mmrToRank(mmr)?.label || '') : '';
}

function setMmr(prefix, value) {
  const el = document.getElementById(`mmr-${prefix}`);
  if (!el || !value) return;
  el.value = value;
  updateMmrPreview(prefix);
}

function setMmrIfEmpty(prefix, value) {
  const el = document.getElementById(`mmr-${prefix}`);
  if (!el || !value) return;
  if ((el.value || '').trim() !== '') return;
  setMmr(prefix, value);
}

function updateMmrPreview(prefix) {
  const preview = document.getElementById(`mmrPreview-${prefix}`);
  if (!preview) return;
  const rank = mmrToRank(getMmr(prefix));
  if (rank) {
    preview.innerHTML = `<img src="${rank.icon}" alt="">${rank.label}`;
    preview.classList.add('show');
  } else {
    preview.innerHTML = '';
    preview.classList.remove('show');
  }
}

function bindMmrInput(prefix) {
  const el = document.getElementById(`mmr-${prefix}`);
  if (!el) return;
  el.addEventListener('input', () => updateMmrPreview(prefix));
}

function buildPosGrid(cid, prefix, multi = false) {
  const el = document.getElementById(cid);
  if (!el) return;
  const type = multi ? 'checkbox' : 'radio';
  el.innerHTML = POSITIONS.map((p,i) => `
    <div class="pos-option">
      <input type="${type}" name="pos-${prefix}" id="pos-${prefix}-${i}" value="${p.val}">
      <label for="pos-${prefix}-${i}">${p.label}${multi ? `<span class="pos-order-badge" id="pos-order-${prefix}-${i}"></span>` : ''}</label>
    </div>`).join('');
  if (multi) {
    el.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', onSoloPosChange));
  }
}

// Solo players may pick any number of positions; selection order matters (first = primary).
let soloPosOrder = [];

function getSoloPositions() { return soloPosOrder.slice(); }

function onSoloPosChange(e) {
  const val = e.target.value;
  if (e.target.checked) {
    if (!soloPosOrder.includes(val)) soloPosOrder.push(val);
  } else {
    soloPosOrder = soloPosOrder.filter(v => v !== val);
  }
  updateSoloPosBadges();
  if (soloPosOrder.length > 0) setInvalid('f-posErr-solo', false);
  saveDraft();
}

function updateSoloPosBadges() {
  POSITIONS.forEach((p, i) => {
    const badge = document.getElementById(`pos-order-solo-${i}`);
    if (!badge) return;
    const order = soloPosOrder.indexOf(p.val);
    if (order === -1) {
      badge.className = 'pos-order-badge';
      badge.textContent = '';
    } else {
      badge.textContent = order === 0 ? '★ 1' : String(order + 1);
      badge.className = 'pos-order-badge show' + (order === 0 ? ' primary' : '');
    }
  });
}

function setSoloPositions(arr) {
  soloPosOrder = [];
  POSITIONS.forEach((p, i) => {
    const cb = document.getElementById(`pos-solo-${i}`);
    if (cb) cb.checked = false;
  });
  (arr || []).forEach(v => {
    const val = String(v);
    const idx = POSITIONS.findIndex(p => p.val === val);
    if (idx >= 0 && !soloPosOrder.includes(val)) {
      const cb = document.getElementById(`pos-solo-${idx}`);
      if (cb) cb.checked = true;
      soloPosOrder.push(val);
    }
  });
  updateSoloPosBadges();
}

function formatSoloRoles(positions) {
  if (!positions.length) return 'N/A';
  let out = `Primary: Pos ${positions[0]}`;
  const secondary = positions.slice(1).map(v => `Pos ${v}`);
  if (secondary.length) out += `\nSecondary: ${secondary.join(', ')}`;
  return out;
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
      <div class="player-card-head">
        <div class="player-num ${isCap?'cap':''}" id="player-num-${i}">
          <div class="badge">${i}</div> PLAYER ${i}<span class="cap-suffix" id="p${i}-cap-suffix">${isCap?' — CAPTAIN':''}</span>
        </div>
        <label class="captain-toggle ${isCap?'active':''}" id="captain-toggle-${i}">
          <input type="radio" name="teamCaptain" value="${i}" ${isCap?'checked':''}>
          <span>👑 Captain</span>
        </label>
      </div>
      <div class="field" id="f-p${i}-ign"><label>Steam Name <span>*</span></label><input type="text" id="p${i}-ign"><div class="error-msg">Required</div></div>
      <div class="steamid-help">
        <span class="steamid-help__trigger" tabindex="0" role="button" aria-label="How to find your Steam ID">Where do I find my Steam ID?</span>
        <div class="steamid-help__tip" role="tooltip">
          <p><strong>Easiest:</strong> open your Steam profile in a browser. If the URL is <code>steamcommunity.com/profiles/7656119…</code>, that 17-digit number is your Steam ID.</p>
          <p>If your URL shows a custom name instead, paste it into <strong>steamid.io</strong> and copy the <code>steamID64</code>.</p>
          <p><strong>In the Steam app:</strong> top-right, click your username → <strong>Account details</strong> — your Steam ID is shown below your username.</p>
        </div>
      </div>
      <div class="grid-2 player-basic-grid">
        <div class="field" id="f-p${i}-steam"><label id="p${i}-steam-label">Steam ID <span>*</span></label><input type="text" id="p${i}-steam" maxlength="17" placeholder="17 digits"><div class="error-msg">Exactly 17 digits required</div></div>
        <div class="field" id="f-p${i}-discord"><label id="p${i}-discord-label">Discord ${isCap?'<span>*</span>':'(Opt)'}</label><input type="text" id="p${i}-discord" maxlength="32"><div class="error-msg">Required — this is how we contact the team</div></div>
      </div>
      <div class="player-meta-grid">
        <div class="player-meta-panel">
          <div class="section-label">MMR <span>*</span></div>
          <div class="field required-field" id="f-mmr-p${i}">
            <div class="mmr-input-row">
              <input type="number" id="mmr-p${i}" min="1" max="15000" placeholder="e.g. 3400">
              <div class="mmr-rank-preview" id="mmrPreview-p${i}"></div>
            </div>
            <div class="error-msg" style="margin-top:10px">Please enter an MMR</div>
          </div>
        </div>
        <div class="player-meta-panel">
          <div class="section-label">Position</div>
          <div class="field required-field" id="f-posErr-p${i}"><div class="pos-grid" id="posGrid-p${i}"></div><div class="error-msg" style="margin-top:10px">Please select a position</div></div>
        </div>
      </div>
    </div>`;
  }
  for (let i = 1; i <= 5; i++) { buildPosGrid('posGrid-p'+i, 'p'+i); bindMmrInput('p'+i); }
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

function updateCaptainUI(revalidate = true) {
  const cap = getCaptainIndex();
  for (let i = 1; i <= 5; i++) {
    const isCap = i === cap;
    document.getElementById(`player-num-${i}`)?.classList.toggle('cap', isCap);
    document.getElementById(`captain-toggle-${i}`)?.classList.toggle('active', isCap);
    const suffix = document.getElementById(`p${i}-cap-suffix`);
    if (suffix) suffix.textContent = isCap ? ' — CAPTAIN' : '';
    const discordLabel = document.getElementById(`p${i}-discord-label`);
    if (discordLabel) discordLabel.innerHTML = isCap ? 'Discord <span>*</span>' : 'Discord (Opt)';
    // Switching captain moves the Discord requirement, so clear the old holder's flag too.
    if (revalidate) { validateField(`p${i}-steam`); validateField(`p${i}-discord`); }
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
  // The logo is a file input — its validity lives in __logoBlob, not its value.
  if (id === 'teamLogo') return;

  const val = getVal(id);
  if (id === 'steamId' || id.endsWith('-steam')) {
    setInvalid('f-'+id, val.length !== 17);
  } else if (id === 'discordUser') {
    setInvalid('f-'+id, false); // solo Discord stays optional
  } else if (id.endsWith('-discord')) {
    // Only the captain's Discord is required — it's our contact point for the team.
    const slot = Number((id.match(/^p(\d)-discord$/) || [])[1]);
    setInvalid('f-'+id, slot === getCaptainIndex() && !val);
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

  applyTeamGateUI();
  saveDraft();
}

// ── Team registration gate: captain must be logged in, and can only have one team at a time ──
async function refreshTeamGate() {
  __session = await getSession();
  __existingTeam = null;
  if (__session) {
    const { data } = await supabaseClient
      .from('team_registrations')
      .select('id, team_name')
      .eq('captain_user_id', __session.user.id)
      .maybeSingle();
    __existingTeam = data || null;
  }
  document.body.classList.remove('team-gate-pending');
  applyTeamGateUI();
}

function applyTeamGateUI() {
  const isTeamMode = currentMode === 'team';
  const gated = isTeamMode && (!__session || !!__existingTeam);
  const gate = document.getElementById('teamGate');

  document.body.classList.toggle('team-gated', gated);

  if (gate) {
    gate.dataset.state = __existingTeam ? 'existing' : 'login';
  }
  const nameEl = document.getElementById('teamGateExistingName');
  if (nameEl) nameEl.textContent = __existingTeam?.team_name || '';

  if (isTeamMode && !gated) updateStepper();
}

function initTeamGate() {
  document.getElementById('teamGateLoginBtn')?.addEventListener('click', () => {
    signInWithDiscord(window.location.pathname);
  });

  document.getElementById('teamGateDeleteBtn')?.addEventListener('click', async () => {
    if (!__existingTeam) return;
    const confirmed = confirm(`Delete your team "${__existingTeam.team_name}"? This can't be undone — you'll need to resubmit your full roster to register again.\n\nNote: this only removes it from our system. It won't remove your team from the Google Sheet or the Team Info page — a SecretShop admin will need to delete that row separately.`);
    if (!confirmed) return;

    const btn = document.getElementById('teamGateDeleteBtn');
    btn.disabled = true;
    btn.textContent = 'Deleting…';

    const { error } = await supabaseClient.from('team_registrations').delete().eq('id', __existingTeam.id);

    if (!error) await deleteTeamLogo(__session?.user?.id);

    btn.disabled = false;
    btn.textContent = 'Delete My Team Registration';

    if (error) {
      showToast('Delete failed — please try again or contact staff.');
      return;
    }

    __existingTeam = null;
    localStorage.removeItem(DRAFT_KEY);
    currentPlayerStep = 1;
    document.getElementById('teamName').value = '';
    clearTeamLogo({ persist: false });
    buildPlayerCards();
    updateCaptainUI(false);
    updateStepper();
    applyTeamGateUI();
    showToast('Team registration deleted. You can register a new team now.');
  });
}

// ── Team logo upload ──────────────────────────────────────────
function setLogoHint(msg, isError) {
  const hint = document.getElementById('teamLogoHint');
  if (!hint) return;
  hint.textContent = msg;
  hint.classList.toggle('logo-upload__hint--error', !!isError);
}

const DEFAULT_LOGO_HINT = "PNG, JPG, WEBP or GIF. Square images look best — we'll resize it for you.";

function renderLogoPreview(dataUrl) {
  const preview = document.getElementById('teamLogoPreview');
  const clearBtn = document.getElementById('teamLogoClearBtn');
  if (!preview) return;

  if (dataUrl) {
    preview.innerHTML = '';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'Team logo preview';
    preview.appendChild(img);
  } else {
    preview.innerHTML = '<span class="logo-upload__placeholder">🛡️</span>';
  }
  if (clearBtn) clearBtn.hidden = !dataUrl;
}

// persist:false when the caller is about to clear the draft anyway, so we don't
// write a half-reset one straight back out.
function clearTeamLogo({ persist = true } = {}) {
  __logoBlob = null;
  __logoDataUrl = null;
  const input = document.getElementById('teamLogo');
  if (input) input.value = '';
  renderLogoPreview(null);
  setLogoHint(DEFAULT_LOGO_HINT, false);
  if (persist) saveDraft();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

function initTeamLogo() {
  const input = document.getElementById('teamLogo');
  const chooseBtn = document.getElementById('teamLogoBtn');

  chooseBtn?.addEventListener('click', () => input?.click());
  // Wrapped, so the click event isn't read as the options argument.
  document.getElementById('teamLogoClearBtn')?.addEventListener('click', () => clearTeamLogo());

  input?.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    setLogoHint('Processing image…', false);
    try {
      __logoBlob = await prepareLogo(file);
      __logoDataUrl = await blobToDataUrl(__logoBlob);
      renderLogoPreview(__logoDataUrl);
      setInvalid('f-teamLogo', false);
      setLogoHint(`Ready — resized to 256px (${Math.round(__logoBlob.size / 1024)}KB).`, false);
      saveDraft();
    } catch (e) {
      console.error('Team logo processing failed:', e);
      clearTeamLogo();
      setLogoHint(e.message || "Couldn't use that image — try a different file.", true);
    }
  });
}

function saveDraft() {
  const data = {
    mode: currentMode,
    solo: {
      ign: getVal('ign'),
      steamId: getVal('steamId'),
      discord: getVal('discordUser'),
      mmr: getVal('mmr-solo'),
      positions: getSoloPositions()
    },
    team: {
      teamName: getVal('teamName'),
      captain: getCaptainIndex(),
      logo: __logoDataUrl,
      players: []
    },
    availability: getAvailability()
  };
  for(let i=1; i<=5; i++) {
    data.team.players.push({
      ign: getVal(`p${i}-ign`),
      steamId: getVal(`p${i}-steam`),
      discord: getVal(`p${i}-discord`),
      mmr: getVal(`mmr-p${i}`),
      pos: getRadio(`pos-p${i}`)
    });
  }
  localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
}

// `saved` is passed in from init(), which reads it before setMode() can
// overwrite it — see the note there.
function loadDraft(saved = localStorage.getItem(DRAFT_KEY)) {
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    if (data.mode) setMode(data.mode);
    if (data.solo) {
      if(document.getElementById('ign')) document.getElementById('ign').value = data.solo.ign || '';
      if(document.getElementById('steamId')) document.getElementById('steamId').value = data.solo.steamId || '';
      if(document.getElementById('discordUser')) document.getElementById('discordUser').value = data.solo.discord || '';
      if(data.solo.mmr) setMmr('solo', data.solo.mmr);
      const savedPositions = data.solo.positions || (data.solo.pos ? [data.solo.pos] : []);
      if(savedPositions.length) setSoloPositions(savedPositions);
    }
    if (data.team) {
      if(document.getElementById('teamName')) document.getElementById('teamName').value = data.team.teamName || '';
      if(data.team.captain) setRadio('teamCaptain', String(data.team.captain));
      if(data.team.logo) {
        // Already resized when it was picked, so it just needs turning back into a blob.
        __logoDataUrl = data.team.logo;
        renderLogoPreview(__logoDataUrl);
        dataUrlToBlob(__logoDataUrl)
          .then((blob) => { __logoBlob = blob; })
          .catch(() => clearTeamLogo());
      }
      if(data.team.players) {
        data.team.players.forEach((p, i) => {
          const idx = i + 1;
          if(document.getElementById(`p${idx}-ign`)) document.getElementById(`p${idx}-ign`).value = p.ign || '';
          if(document.getElementById(`p${idx}-steam`)) document.getElementById(`p${idx}-steam`).value = p.steamId || '';
          if(document.getElementById(`p${idx}-discord`)) document.getElementById(`p${idx}-discord`).value = p.discord || '';
          if(p.mmr) setMmr(`p${idx}`, p.mmr);
          if(p.pos) setRadio(`pos-p${idx}`, p.pos);
        });
      }
    }
    if (data.availability) setAvailability(data.availability);
    // Write the restored state straight back: setMode() already overwrote the
    // stored copy with the empty form, so without this a second reload (with no
    // edits in between) would find an empty draft.
    saveDraft();
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
  setMmrIfEmpty('solo', data.mmr);
  if (data.primary_position && getSoloPositions().length === 0) setSoloPositions([data.primary_position]);

  setValIfEmpty('p1-ign', data.ign || '');
  setValIfEmpty('p1-steam', data.steam_id || '');
  setMmrIfEmpty('p1', data.mmr);
  if (data.primary_position) setRadio('pos-p1', String(data.primary_position));
  if (discordName) setValIfEmpty('p1-discord', discordName);
}

async function insertSupabaseSolo(solo) {
  const positions = solo.positions || [];
  await supabaseClient.from('solo_registrations').insert({
    ign: solo.ign,
    steam_id: solo.steamId,
    discord_username: solo.discord || null,
    rank: solo.rank,
    mmr: solo.mmr,
    primary_position: Number(positions[0])
  });
}

async function insertSupabaseTeam(teamName, players, captainIndex = 1, captainUserId = null, logoUrl = null) {
  const avgMmr = Math.round(players.reduce((sum, p) => sum + (Number(p.mmr) || 0), 0) / Math.max(players.length, 1));
  const captain = players[captainIndex - 1] || players[0] || {};

  return supabaseClient.from('team_registrations').insert({
    team_name: teamName,
    captain_ign: captain.ign || '',
    captain_discord: captain.discord || null,
    captain_user_id: captainUserId,
    logo_url: logoUrl,
    players: players.map((p) => ({
      ign: p.ign,
      steam_id: p.sid,
      discord_username: p.discord || null,
      rank: p.rank,
      mmr: Number(p.mmr),
      primary_position: Number(p.pos)
    })),
    avg_mmr: avgMmr
  });
}

export async function handleSubmit() {
  let ok = true;
  let payload = { embeds: [] };
  let lftPayload = null;

  if (currentMode === 'solo') {
    const ign = getVal('ign'), sid = getVal('steamId'), discord = getVal('discordUser'), mmr = getMmr('solo'), rank = getRankLabel('solo'), positions = getSoloPositions();

    validateField('ign'); validateField('steamId');
    if(!ign || sid.length !== 17 || !mmr || positions.length === 0) ok = false;

    setInvalid('f-mmr-solo', !mmr);
    setInvalid('f-posErr-solo', positions.length === 0);

    if (!ok) {
      const invalidEl = document.querySelector('.invalid');
      const formCard = document.getElementById('formCard');
      if (formCard && invalidEl) formCard.scrollTo({ top: invalidEl.offsetTop - 40, behavior: 'smooth' });
      return;
    }

    let steamIdTaken = false;
    try {
      const { data } = await supabaseClient.rpc('solo_steam_id_registered', { p_steam_id: sid });
      steamIdTaken = !!data;
    } catch (e) {
      steamIdTaken = false;
    }
    if (steamIdTaken) {
      showToast('This Steam ID is already registered for solo entry.');
      const steamField = document.getElementById('f-steamId');
      const formCard = document.getElementById('formCard');
      if (formCard && steamField) formCard.scrollTo({ top: steamField.offsetTop - 40, behavior: 'smooth' });
      return;
    }

    const soloEmbed = {
      title: "⚔️ New Solo Registration",
      color: 0xc89b3c,
      fields: [
        { name: "IGN", value: ign, inline: true },
        { name: "Discord", value: discord || "N/A", inline: true },
        { name: "Rank", value: `${rank} (${mmr} MMR)`, inline: true },
        { name: "Roles", value: formatSoloRoles(positions), inline: true },
        { name: "Steam ID", value: `[${sid}](https://steamcommunity.com/profiles/${sid})`, inline: true },
        { name: "Dotabuff", value: sid ? `[${sid}](https://www.dotabuff.com/players/${sid})` : 'N/A', inline: true },
        { name: "Availability", value: getAvailability().length ? getAvailability().join(' | ') : 'No availability selected' }
      ]
    };
    payload.embeds.push(soloEmbed);

    // Looking-for-players channel post — solo players seeking a team.
    lftPayload = {
      content: `@${discord || ign} is looking for a team:`,
      embeds: [soloEmbed]
    };
  } else {
    if (!__session || __existingTeam) {
      await refreshTeamGate();
      showToast(__existingTeam ? "You've already registered a team on this Discord account." : 'Please log in with Discord to register a team.');
      return;
    }

    const tname = getVal('teamName');
    const capIdx = getCaptainIndex();
    validateField('teamName');
    if(!tname) ok = false;

    setInvalid('f-teamLogo', !__logoBlob);
    if(!__logoBlob) ok = false;

    let playersData = [];
    for (let i = 1; i <= 5; i++) {
      const ign = getVal(`p${i}-ign`), sid = getVal(`p${i}-steam`), discord = getVal(`p${i}-discord`), mmr = getMmr(`p${i}`), rank = getRankLabel(`p${i}`), pos = getRadio(`pos-p${i}`);
      validateField(`p${i}-ign`); validateField(`p${i}-steam`); validateField(`p${i}-discord`);

      if(!ign || sid.length !== 17 || !mmr || !pos) ok = false;
      if(i === capIdx && !discord) ok = false;
      setInvalid(`f-mmr-p${i}`, !mmr);
      setInvalid(`f-posErr-p${i}`, !pos);

      playersData.push({ ign, sid, discord, rank, mmr, pos });
    }

    if(ok) {
      payload.embeds.push({
        title: `🛡️ New Team Registration: ${tname}`,
        color: 0x7b5ea7,
        fields: playersData.map((p, i) => ({
          name: `Player ${i+1}${i===capIdx-1?' (Captain)':''}`,
          value: `**IGN:** ${p.ign}\n**Rank:** ${p.rank} (${p.mmr} MMR)\n**Pos:** ${p.pos}\n**Discord:** ${p.discord || 'N/A'}\n**ID:** ${p.sid || 'N/A'}\n**Dotabuff:** ${p.sid ? `[${p.sid}](https://www.dotabuff.com/players/${p.sid})` : 'N/A'}`,
          inline: true
        })).concat([
          { name: "Captain Contact", value: `${playersData[capIdx-1]?.ign || '?'} — Discord: ${playersData[capIdx-1]?.discord || 'N/A'}` },
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
  
  let captainUserId = null;
  let logoUrl = null;

  try {
    // 0. Team logo goes up first: if the upload fails we bail out here, before
    //    anything has been posted to Discord or written to the sheet.
    if (currentMode === 'team') {
      // Re-fetch the session fresh right here rather than trusting the page-load-time
      // __session, in case it went stale (token refresh, long-open tab, etc).
      const freshSession = await getSession();
      captainUserId = freshSession?.user?.id || null;
      if (!captainUserId) throw new Error('your Discord login expired. Please log in again and resubmit.');

      btn.textContent = '🛡️ UPLOADING LOGO...';
      logoUrl = await uploadTeamLogo(captainUserId, __logoBlob).catch((err) => {
        console.error('Team logo upload failed:', err);
        throw new Error('the team logo could not be uploaded. Please try again.');
      });
      btn.textContent = '🛡️ TRANSMITTING...';

      // Show the crest alongside the roster in the admin channel.
      if (payload.embeds[0]) payload.embeds[0].thumbnail = { url: logoUrl };
    }

    // 1. Send to Discord (admin channel — all sign-ups)
    const discordRes = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // 1b. Solo entries also post to the looking-for-players channel (best-effort)
    if (lftPayload) {
      fetch(LFT_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lftPayload)
      }).catch(() => {});
    }

    // 2. Send to Google Sheets
    if (SPREADSHEET_SCRIPT_URL) {
      const sheetData = currentMode === 'solo' ? {
        type: 'solo',
        timestamp: new Date().toLocaleString(),
        ign: getVal('ign'),
        steam: getVal('steamId'),
        dotabuff: getVal('steamId') ? `https://www.dotabuff.com/players/${getVal('steamId')}` : '',
        discord: getVal('discordUser'),
        rank: getRankLabel('solo'),
        mmr: getMmr('solo'),
        position: getSoloPositions().join(', '),
        availability: getAvailability().length ? getAvailability().join(' | ') : 'No availability selected'
      } : {
        type: 'team',
        timestamp: new Date().toLocaleString(),
        teamName: getVal('teamName'),
        captain: getCaptainIndex(),
        captainIgn: getVal(`p${getCaptainIndex()}-ign`),
        captainDiscord: getVal(`p${getCaptainIndex()}-discord`),
        logo: logoUrl || '',
        players: [1,2,3,4,5].map(i => ({
          ign: getVal(`p${i}-ign`),
          steam: getVal(`p${i}-steam`),
          discord: getVal(`p${i}-discord`),
          dotabuff: getVal(`p${i}-steam`) ? `https://www.dotabuff.com/players/${getVal(`p${i}-steam`)}` : '',
          rank: getRankLabel(`p${i}`),
          mmr: getMmr(`p${i}`),
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
        steamId: getVal('steamId'),
        discord: getVal('discordUser'),
        rank: getRankLabel('solo'),
        mmr: getMmr('solo'),
        positions: getSoloPositions()
      }).catch(()=>{});
    } else {
      const playersData = [];
      for(let i=1;i<=5;i++) playersData.push({
        ign: getVal(`p${i}-ign`),
        sid: getVal(`p${i}-steam`),
        discord: getVal(`p${i}-discord`),
        rank: getRankLabel(`p${i}`),
        mmr: getMmr(`p${i}`),
        pos: getRadio(`pos-p${i}`)
      });
      // captainUserId came from the fresh session fetched at step 0.
      const teamResult = await insertSupabaseTeam(getVal('teamName'), playersData, getCaptainIndex(), captainUserId, logoUrl).catch((err) => ({ error: err }));
      if (teamResult?.error?.code === '23505') {
        // Rare race (e.g. two tabs submitting at once) — the DB caught a duplicate captain that slipped past the UI gate.
        btn.disabled = false;
        btn.textContent = '⚔ Submit Entry ⚔';
        showToast("You've already registered a team on this Discord account.");
        await refreshTeamGate();
        return;
      }

      // Public name → logo lookup that Team Info reads (team_registrations is private).
      await saveTeamLogoRecord(captainUserId, getVal('teamName'), logoUrl)
        .catch((err) => console.error('Failed to save team logo record:', err));
    }

    if(discordRes.ok) {
      document.getElementById('formContent').style.display = 'none';
      document.getElementById('successMsg').style.display = 'flex';
      localStorage.removeItem(DRAFT_KEY);
      const formCard = document.getElementById('formCard');
      if (formCard) formCard.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const errBody = await discordRes.text().catch(() => '(unreadable)');
      console.error('Discord webhook failed:', discordRes.status, errBody);
      throw new Error(`Discord ${discordRes.status}: ${errBody}`);
    }
  } catch (e) {
    console.error('Submission error:', e);
    alert(`Transmission failed — ${e.message}`);
    btn.disabled = false;
    btn.textContent = '⚔ Submit Entry ⚔';
  }
}

function init() {
  document.body.classList.add('team-gate-pending');

  bindMmrInput('solo');
  buildPosGrid('posGrid-solo', 'solo', true);
  buildPlayerCards();
  buildAvailabilityGrid();
  initTeamGate();
  initTeamLogo();

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

      if (i === 1) {
        const tname = getVal('teamName');
        validateField('teamName');
        if (!tname) ok = false;
      }

      const ign = getVal(`p${i}-ign`), sid = getVal(`p${i}-steam`), mmr = getMmr(`p${i}`), pos = getRadio(`pos-p${i}`);
      validateField(`p${i}-ign`); validateField(`p${i}-steam`); validateField(`p${i}-discord`);

      if(!ign || sid.length !== 17 || !mmr || !pos) ok = false;
      if(i === getCaptainIndex() && !getVal(`p${i}-discord`)) ok = false;
      setInvalid(`f-mmr-p${i}`, !mmr);
      setInvalid(`f-posErr-p${i}`, !pos);
      
      if (ok) {
        currentPlayerStep++;
        updateStepper();
      } else {
        showToast('Please fill out all required fields correctly.');
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
    if (e.target?.name === 'teamCaptain') updateCaptainUI();
    if (e.target?.type === 'radio') saveDraft();
  });

  // Read the stored draft up front: setMode() saves one as a side effect, so by
  // the time loadDraft() runs the still-empty form has already overwritten it.
  const storedDraft = localStorage.getItem(DRAFT_KEY);

  setMode('team'); // default to team entry (most registrants already have a team)

  const forceMode = localStorage.getItem('sl_force_mode');
  if (forceMode) {
    setMode(forceMode);
    localStorage.removeItem('sl_force_mode');
  } else {
    loadDraft(storedDraft);
  }

  updateCaptainUI(false); // sync captain markers with the (possibly restored) selection, without flagging fields

  prefillFromProfile().catch(() => {});
  refreshTeamGate().catch(() => { document.body.classList.remove('team-gate-pending'); });
}

document.addEventListener('DOMContentLoaded', init);
window.SecretLeagueRegister = { setMode, handleSubmit };
