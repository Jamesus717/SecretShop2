import { supabaseClient } from './supabase.js';
import { getSession, signInWithDiscord, signOut } from './auth.js';

const discordLogoSvg = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.3 4.4a19.7 19.7 0 0 0-4.8-1.5l-.2.4a18.3 18.3 0 0 1 3.6 1.1c-1.6-.8-3.3-1.3-5.1-1.6a17.8 17.8 0 0 0-3.6 0c-1.8.3-3.5.8-5.1 1.6a18.3 18.3 0 0 1 3.6-1.1l-.2-.4a19.7 19.7 0 0 0-4.8 1.5A19.4 19.4 0 0 0 1.8 17a19.8 19.8 0 0 0 6.1 3l.7-1.2a12.2 12.2 0 0 1-1.9-.9l.5-.4c1.1.5 2.3.9 3.5 1.1a16 16 0 0 0 2.6 0c1.2-.2 2.4-.6 3.5-1.1l.5.4c-.6.4-1.2.7-1.9.9l.7 1.2a19.8 19.8 0 0 0 6.1-3 19.4 19.4 0 0 0-1.6-12.6ZM9.3 14.8c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm5.4 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"/></svg>`;

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

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.remove('show'), 2600);
}

function getDisplayName(user) {
  const md = user?.user_metadata || {};
  return md.full_name || md.name || md.preferred_username || 'Discord User';
}

function getAvatarUrl(user) {
  const md = user?.user_metadata || {};
  return md.avatar_url || md.picture || '';
}

function getRadio(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || '';
}

function setRadio(name, value) {
  if (!value) return;
  const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (el) el.checked = true;
}

function buildRankGrid() {
  const root = document.getElementById('profile-rank-grid');
  if (!root) return;
  root.innerHTML = RANKS.map((r) => {
    const id = `rank-profile-${r.label}`;
    return `
      <div class="rank-option">
        <input type="radio" id="${id}" name="rank-profile" value="${r.label}">
        <label for="${id}">
          <img src="${r.icon}" class="rank-icon" alt="${r.label}">
          <div>${r.label}</div>
        </label>
      </div>
    `;
  }).join('');
}

function buildPosGrid() {
  const root = document.getElementById('profile-pos-grid');
  if (!root) return;
  root.innerHTML = POSITIONS.map((p) => {
    const id = `pos-profile-${p.val}`;
    return `
      <div class="pos-option">
        <input type="radio" id="${id}" name="pos-profile" value="${p.val}">
        <label for="${id}">${p.label}</label>
      </div>
    `;
  }).join('');
}

function validateSteamId(v) {
  if (!v) return true;
  return /^\d{17}$/.test(v);
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function statusClass(status) {
  if (status === 'approved') return 'status-approved';
  if (status === 'rejected') return 'status-rejected';
  return 'status-pending';
}

function renderRegistrations(rows) {
  const root = document.getElementById('profile-registrations');
  if (!root) return;
  if (!rows.length) {
    root.innerHTML = `
      <div class="reg-card">
        <div class="reg-title">No registrations yet</div>
        <div class="reg-meta">Head to <a href="register.html">Register</a> to submit an entry.</div>
      </div>
    `;
    return;
  }

  root.innerHTML = rows.map((r) => {
    return `
      <div class="reg-card">
        <div class="reg-top">
          <div class="reg-title">${r.type === 'team' ? 'Team Registration' : 'Solo Registration'} · ${r.label}</div>
          <div class="status-pill ${statusClass(r.status)}">${r.status || 'pending'}</div>
        </div>
        <div class="reg-meta">Registered ${formatDate(r.created_at)}</div>
      </div>
    `;
  }).join('');
}

async function loadRegistrations(discordUsername) {
  const out = [];
  if (!discordUsername) return out;

  const solo = await supabaseClient
    .from('solo_registrations')
    .select('id,status,created_at')
    .eq('discord_username', discordUsername)
    .order('created_at', { ascending: false });

  (solo.data || []).forEach((r) => out.push({ ...r, type: 'solo', label: 'Solo' }));

  const team = await supabaseClient
    .from('team_registrations')
    .select('id,status,created_at,team_name')
    .contains('players', [{ discord_username: discordUsername }])
    .order('created_at', { ascending: false });

  (team.data || []).forEach((r) => out.push({ ...r, type: 'team', label: r.team_name || 'Team' }));

  out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return out;
}

async function loadProfile(user) {
  const { data } = await supabaseClient.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return data || null;
}

async function saveProfile(user) {
  const ign = (document.getElementById('profile-ign')?.value || '').trim();
  const steam = (document.getElementById('profile-steam')?.value || '').trim().replace(/\D/g, '');
  const rank = getRadio('rank-profile') || null;
  const pos = getRadio('pos-profile') || null;

  const steamField = document.getElementById('profile-steam-field');
  steamField?.classList.toggle('invalid', !validateSteamId(steam));
  if (!validateSteamId(steam)) {
    toast('Steam ID must be exactly 17 digits.');
    return;
  }

  const payload = {
    id: user.id,
    ign: ign || null,
    steam_id: steam || null,
    rank,
    primary_position: pos ? Number(pos) : null,
    updated_at: new Date().toISOString()
  };

  const res = await supabaseClient.from('profiles').upsert(payload, { onConflict: 'id' });
  if (res.error) {
    toast('Save failed. Please try again.');
    return;
  }
  toast('Profile saved.');
}

async function init() {
  buildRankGrid();
  buildPosGrid();

  const loginBtn = document.getElementById('profile-login-btn');
  if (loginBtn) {
    const icon = loginBtn.querySelector('.discord-login-icon');
    if (icon) icon.innerHTML = discordLogoSvg;
    loginBtn.addEventListener('click', () => signInWithDiscord());
  }

  const session = await getSession();
  const loggedOut = document.getElementById('profile-logged-out');
  const loggedIn = document.getElementById('profile-logged-in');

  if (!session) {
    if (loggedOut) loggedOut.style.display = 'block';
    if (loggedIn) loggedIn.style.display = 'none';
    return;
  }

  if (loggedOut) loggedOut.style.display = 'none';
  if (loggedIn) loggedIn.style.display = 'block';

  const user = session.user;
  const avatarUrl = getAvatarUrl(user);
  const name = getDisplayName(user);
  const avatarEl = document.getElementById('profile-avatar');
  if (avatarEl) {
    if (avatarUrl) avatarEl.src = avatarUrl;
    else avatarEl.style.display = 'none';
  }
  const nameEl = document.getElementById('profile-discord-name');
  if (nameEl) nameEl.textContent = name;

  const profile = await loadProfile(user);
  if (profile) {
    if (profile.ign) document.getElementById('profile-ign').value = profile.ign;
    if (profile.steam_id) document.getElementById('profile-steam').value = profile.steam_id;
    if (profile.rank) setRadio('rank-profile', profile.rank);
    if (profile.primary_position) setRadio('pos-profile', String(profile.primary_position));
  }

  document.getElementById('profile-steam')?.addEventListener('input', (e) => {
    e.target.value = (e.target.value || '').replace(/\D/g, '');
  });

  document.getElementById('profile-save-btn')?.addEventListener('click', () => saveProfile(user).catch(() => toast('Save failed.')));
  document.getElementById('profile-logout-btn')?.addEventListener('click', () => signOut());

  const discordUsername = profile?.discord_username || name;
  const regs = await loadRegistrations(discordUsername);
  renderRegistrations(regs);
}

document.addEventListener('DOMContentLoaded', () => init().catch(() => toast('Profile failed to load.')));

