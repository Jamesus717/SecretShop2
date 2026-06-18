export function initTheme() {
  const saved = localStorage.getItem('theme');
  const theme = saved || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.body.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}

export function bindThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', toggleTheme);
}

