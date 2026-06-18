import { supabaseClient } from './supabase.js';

const discordLogoSvg = `<svg viewBox="0 0 24 24" aria-hidden="true" style="width:16px;height:16px;margin-right:6px;"><path fill="currentColor" d="M20.3 4.4a19.7 19.7 0 0 0-4.8-1.5l-.2.4a18.3 18.3 0 0 1 3.6 1.1c-1.6-.8-3.3-1.3-5.1-1.6a17.8 17.8 0 0 0-3.6 0c-1.8.3-3.5.8-5.1 1.6a18.3 18.3 0 0 1 3.6-1.1l-.2-.4a19.7 19.7 0 0 0-4.8 1.5A19.4 19.4 0 0 0 1.8 17a19.8 19.8 0 0 0 6.1 3l.7-1.2a12.2 12.2 0 0 1-1.9-.9l.5-.4c1.1.5 2.3.9 3.5 1.1a16 16 0 0 0 2.6 0c1.2-.2 2.4-.6 3.5-1.1l.5.4c-.6.4-1.2.7-1.9.9l.7 1.2a19.8 19.8 0 0 0 6.1-3 19.4 19.4 0 0 0-1.6-12.6ZM9.3 14.8c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm5.4 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"/></svg>`;

function canUseOAuthHere() {
  return window.location.protocol !== 'file:';
}

function getDisplayName(user) {
  const md = user?.user_metadata || {};
  return md.full_name || md.name || md.preferred_username || 'Discord User';
}

async function upsertProfileFromSession(session) {
  const user = session?.user;
  if (!user) return;

  const md = user.user_metadata || {};
  const payload = {
    id: user.id,
    discord_id: md.provider_id || null,
    discord_username: md.full_name || md.name || null,
    discord_avatar: md.avatar_url || md.picture || null
  };

  await supabaseClient.from('profiles').upsert(payload, { onConflict: 'id' });
}

function renderLoggedOut(container) {
  container.innerHTML = `
    <a class="nav-item" id="nav-login-btn" style="color: #8ea1e1; border-color: rgba(142, 161, 225, 0.4);">
      ${discordLogoSvg} Login with Discord
    </a>
  `;

  const btn = container.querySelector('#nav-login-btn');
  btn?.addEventListener('click', () => signInWithDiscord());
}

function renderLoggedIn(container, session) {
  const user = session.user;
  const name = getDisplayName(user);
  
  const isProfileActive = window.location.pathname.endsWith('profile.html');

  container.innerHTML = `
    <a class="nav-item ${isProfileActive ? 'active' : ''}" href="profile.html" data-nav="profile.html" style="color: var(--accent2); border-color: rgba(85, 107, 47, 0.5);">Profile (${name})</a>
    <a class="nav-item" id="nav-logout-btn" style="color: var(--red); border-color: rgba(255, 77, 77, 0.3);">Logout</a>
  `;

  container.querySelector('#nav-logout-btn')?.addEventListener('click', () => signOut());
}

export async function signInWithDiscord() {
  if (!canUseOAuthHere()) {
    alert('Discord login requires serving the site from http://localhost (not opening the HTML file directly).');
    return;
  }

  await supabaseClient.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: window.location.origin + '/profile.html' }
  });
}

export async function signOut() {
  await supabaseClient.auth.signOut();
}

export async function getSession() {
  const { data } = await supabaseClient.auth.getSession();
  return data?.session || null;
}

export async function checkPendingRegistration(supabase, userId) { 
  try { 
    const { data } = await supabase 
      .from('solo_registrations') // Assuming this is the table based on previous messages
      .select('status') 
      .eq('id', userId) 
      .eq('status', 'pending') 
      .limit(1); 
    
    if (data && data.length > 0) { 
      // Find the Registration nav link and add the dot 
      const regLink = document.querySelector('[data-nav="register.html"]'); 
      if (regLink) { 
        regLink.classList.add('has-notification'); 
      } 
    } 
  } catch (e) { 
    // Silently fail — this is cosmetic only 
  } 
}

export async function initAuth() {
  const container = document.getElementById('nav-auth');
  const session = await getSession();

  // Check admin status (undefined = not yet checked, false = checked & not admin)
  window.__isAdmin = false;
  if (session) {
    try {
      const { data: adminRow } = await supabaseClient
        .from('admin_users')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      window.__isAdmin = !!adminRow;
      if (window.__isAdmin) {
        document.documentElement.setAttribute('data-admin', 'true');
      }
    } catch (e) { /* non-fatal */ }
  }

  if (container) {
    if (session) renderLoggedIn(container, session);
    else renderLoggedOut(container);
  }

  if (session) {
    try {
      await upsertProfileFromSession(session);
      await checkPendingRegistration(supabaseClient, session.user.id);
    } catch (_) {}
  }

  supabaseClient.auth.onAuthStateChange(async (_event, nextSession) => {
    const c = document.getElementById('nav-auth');
    if (c) {
      if (nextSession) renderLoggedIn(c, nextSession);
      else renderLoggedOut(c);
    }

    if (nextSession) {
      try {
        await upsertProfileFromSession(nextSession);
        await checkPendingRegistration(supabaseClient, nextSession.user.id);
      } catch (_) {}
    }
  });
}
