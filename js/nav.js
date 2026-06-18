import { initAuth } from './auth.js';
import { bindThemeToggle, initTheme } from './theme.js';

function getCurrentPage() {
  const p = window.location.pathname.split('/').pop() || 'index.html';
  return p === '' ? 'index.html' : p;
}

function setActiveLink(root) {
  const current = getCurrentPage();
  root.querySelectorAll('[data-nav]').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('data-nav') === current);
  });
}

function renderNav() {
  const host = document.getElementById('main-nav-container');
  if (!host) return;

  host.innerHTML = `
    <header class="site-header"> 
      <div class="site-header__brand"> 
        <img src="assets/logo.png" alt="SecretLeague Logo" class="site-header__logo"> 
        <span class="site-header__name">SecretLeague</span> 
      </div> 
      <nav class="site-header__nav" id="main-nav"> 
        <a class="nav-item" href="index.html" data-nav="index.html">Home</a> 
        <a class="nav-item" href="register.html" data-nav="register.html">Registration</a> 
        <a class="nav-item" href="balancer.html" data-nav="balancer.html">BortyGPT</a> 
        <a class="nav-item" href="tournament.html" data-nav="tournament.html">Tournament</a>
        <span id="nav-auth" style="display:contents"></span> 
      </nav> 
      <button class="theme-toggle" id="theme-toggle" title="Toggle Theme"> 
        <svg class="moon-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.1,22c-4.9,0-9-4.1-9-9s4.1-9,9-9c0.6,0,1.1,0.1,1.7,0.2c0.3,0.1,0.5,0.4,0.4,0.7c-0.1,0.3-0.4,0.5-0.7,0.4c-0.4-0.1-0.9-0.1-1.3-0.1c-4.3,0-7.8,3.5-7.8,7.8s3.5,7.8,7.8,7.8c3.2,0,6.1-2,7.2-4.9c0.1-0.3,0.4-0.5,0.7-0.4c0.3,0.1,0.5,0.4,0.4,0.7C19.4,19.3,16,22,12.1,22z"/></svg>
        <svg class="sun-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12,18c-3.3,0-6-2.7-6-6s2.7-6,6-6s6,2.7,6,6S15.3,18,12,18z M12,7c-2.8,0-5,2.2-5,5s2.2,5,5,5s5-2.2,5-5S14.8,7,12,7z M12,4c-0.3,0-0.5-0.2-0.5-0.5v-2c0-0.3,0.2-0.5,0.5-0.5s0.5,0.2,0.5,0.5v2C12.5,3.8,12.3,4,12,4z M12,24c-0.3,0-0.5-0.2-0.5-0.5v-2c0-0.3,0.2-0.5,0.5-0.5s0.5,0.2,0.5,0.5v2C12.5,23.8,12.3,24,12,24z M5.6,6.3c-0.1,0-0.3-0.1-0.4-0.2l-1.4-1.4c-0.2-0.2-0.2-0.5,0-0.7s0.5-0.2,0.7,0l1.4,1.4c0.2,0.2,0.2,0.5,0,0.7C5.9,6.2,5.8,6.3,5.6,6.3z M19.8,20.5c-0.1,0-0.3-0.1-0.4-0.2l-1.4-1.4c-0.2-0.2-0.2-0.5,0-0.7s0.5-0.2,0.7,0l1.4,1.4c0.2,0.2,0.2,0.5,0,0.7C20.1,20.4,20,20.5,19.8,20.5z M4,12.5H2c-0.3,0-0.5-0.2-0.5-0.5s0.2-0.5,0.5-0.5h2c0.3,0,0.5,0.2,0.5,0.5S4.3,12.5,4,12.5z M22,12.5h-2c-0.3,0-0.5-0.2-0.5-0.5s0.2-0.5,0.5-0.5h2c0.3,0,0.5,0.2,0.5,0.5S22.3,12.5,22,12.5z M6.3,18.4l-1.4,1.4c-0.2,0.2-0.5,0.2-0.7,0s-0.2-0.5,0-0.7l1.4-1.4c0.2-0.2,0.5-0.2,0.7,0S6.5,18.2,6.3,18.4z M20.5,4.2l-1.4,1.4c-0.2,0.2-0.5,0.2-0.7,0s-0.2-0.5,0-0.7l1.4-1.4c0.2-0.2,0.5-0.2,0.7,0S20.7,4,20.5,4.2z"/></svg>
      </button> 
    </header>
  `;

  setActiveLink(host);

  // Intercept nav clicks for fade transition 
  host.querySelectorAll('a.nav-item').forEach(link => { 
    link.addEventListener('click', (e) => { 
      const href = link.getAttribute('href'); 
      if (!href || href.startsWith('http') || href.startsWith('#')) return; 
      e.preventDefault(); 
      document.body.classList.add('page-exit'); 
      setTimeout(() => { window.location.href = href; }, 180); 
    }); 
  }); 
}

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  renderNav();
  bindThemeToggle();
  await initAuth();
});
