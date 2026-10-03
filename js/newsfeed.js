// Home page "Latest" sidebar: match cards Owen's Discord bot posts, read from
// news_posts in Supabase (written only by functions/api/news.js). Cards are
// made with tools/stat-designer, so a change there changes what shows here.
//
// Stays hidden when there's nothing to show — no posts yet, or
// news-migration.sql not run — so the home page looks exactly as before until
// the bot is hooked up.
//
// ?mocknews=1 reads mock-data/news-posts.json instead, for local work
// (python -m http.server has no Supabase table to read).

import { supabaseClient } from './supabase.js';

const SUPABASE_URL = 'https://nqcbfsnscqoaznypovyx.supabase.co';
const BUCKET = 'news-cards';
const MAX_POSTS = 12;
const MOCK = new URLSearchParams(location.search).has('mocknews');

const DIV_LABELS = { upper: 'Upper', mid: 'Mid', lower: 'Lower' };
const KIND_LABELS = {
  result: 'Result', match: 'Scoreboard', elimination: 'Eliminations',
  bracket: 'Bracket', hero: 'Hero', team: 'Team', other: 'News'
};

// Titles and team names come from the bot, which builds them from sheets
// people type into — escape all of it.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Paths come from news.js as YYYY-MM/<uuid>.<ext>. Anything else isn't ours,
// so don't build a URL from it.
function imageUrl(path) {
  if (MOCK) return /^[\w./-]+$/.test(path) && !path.includes('..') ? path : null;
  return /^\d{4}-\d{2}\/[0-9a-f-]{36}\.(png|webp|jpg)$/.test(path)
    ? `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
    : null;
}

function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(mins)) return '';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fullDate(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

async function loadPosts() {
  if (MOCK) {
    const res = await fetch('mock-data/news-posts.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`mock news HTTP ${res.status}`);
    return res.json();
  }
  // RLS returns hidden posts to admins only, so admins can unhide them.
  const { data, error } = await supabaseClient
    .from('news_posts')
    .select('id, created_at, kind, title, image_path, division, teams, match_ids, hidden')
    .order('created_at', { ascending: false })
    .limit(MAX_POSTS);
  if (error) throw error;
  return data || [];
}

function itemHtml(p) {
  const src = imageUrl(p.image_path);
  if (!src) return '';
  const div = DIV_LABELS[p.division];
  return `<li class="news-item${p.hidden ? ' news-item--hidden' : ''}">
    <button type="button" class="news-item__btn" data-id="${esc(p.id)}">
      <img class="news-item__img" src="${esc(src)}" alt="" loading="lazy" decoding="async">
      <span class="news-item__title">${esc(p.title)}</span>
      <span class="news-item__meta">
        ${div ? `<span class="home-div home-div--${p.division}">${div}</span>` : ''}
        <span>${esc(KIND_LABELS[p.kind] || 'News')}</span>
        <span>${esc(ago(p.created_at))}</span>
        ${p.hidden ? '<span class="news-item__hidden-tag">Hidden</span>' : ''}
      </span>
    </button>
  </li>`;
}

function matchLinks(ids) {
  if (!ids || !ids.length) return '';
  const rows = ids.map((id, i) => {
    const safe = String(id).replace(/\D/g, '');
    if (!safe) return '';
    const label = ids.length > 1 ? `Game ${i + 1}` : 'Match';
    return `<li><span>${label}</span>
      <a href="https://www.opendota.com/matches/${safe}" target="_blank" rel="noopener noreferrer">OpenDota</a>
      <a href="https://www.dotabuff.com/matches/${safe}" target="_blank" rel="noopener noreferrer">Dotabuff</a>
    </li>`;
  }).join('');
  return `<ul class="news-dialog__links">${rows}</ul>`;
}

function dialogHtml(p) {
  const div = DIV_LABELS[p.division];
  return `
    <div class="news-dialog__inner">
      <button type="button" class="news-dialog__close" data-close aria-label="Close">✕</button>
      <img class="news-dialog__img" src="${esc(imageUrl(p.image_path))}" alt="${esc(p.title)}">
      <div class="news-dialog__body">
        <h2 class="news-dialog__title">${esc(p.title)}</h2>
        <div class="news-item__meta">
          ${div ? `<span class="home-div home-div--${p.division}">${div}</span>` : ''}
          <span>${esc(KIND_LABELS[p.kind] || 'News')}</span>
          <span>${esc(fullDate(p.created_at))}</span>
        </div>
        ${matchLinks(p.match_ids)}
        <button type="button" class="news-dialog__admin" data-toggle-hidden>
          ${p.hidden ? 'Show on home page' : 'Hide from home page'}
        </button>
      </div>
    </div>`;
}

export async function initNewsFeed() {
  const host = document.getElementById('homeNews');
  if (!host) return;

  let posts;
  try {
    posts = (await loadPosts()).filter((p) => imageUrl(p.image_path));
  } catch (e) {
    // Most likely news-migration.sql hasn't been run yet. Nothing to show.
    console.warn('News feed unavailable:', e.message || e);
    return;
  }
  if (!posts.length) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'news-dialog';
  document.body.appendChild(dialog);
  let open = null;

  const render = () => {
    host.innerHTML = `
      <div class="section-label">Latest</div>
      <ul class="news-list">${posts.map(itemHtml).join('')}</ul>`;
  };
  render();
  host.hidden = false;
  document.getElementById('homeLayout')?.classList.add('home-layout--news');

  host.addEventListener('click', (e) => {
    const btn = e.target.closest('.news-item__btn');
    if (!btn) return;
    open = posts.find((p) => String(p.id) === btn.dataset.id);
    if (!open) return;
    dialog.innerHTML = dialogHtml(open);
    dialog.showModal();
  });

  dialog.addEventListener('click', async (e) => {
    // A click on the backdrop lands on the <dialog> itself.
    if (e.target === dialog || e.target.closest('[data-close]')) { dialog.close(); return; }

    const toggle = e.target.closest('[data-toggle-hidden]');
    if (!toggle || !open) return;
    // The button is only revealed by CSS for admins; RLS is what actually
    // stops anyone else, this just avoids a pointless request.
    if (!window.__isAdmin || MOCK) return;
    toggle.disabled = true;
    const next = !open.hidden;
    const { error } = await supabaseClient.from('news_posts').update({ hidden: next }).eq('id', open.id);
    toggle.disabled = false;
    if (error) {
      toggle.textContent = `Couldn't save: ${error.message}`;
      return;
    }
    open.hidden = next;
    render();
    dialog.close();
  });
}
