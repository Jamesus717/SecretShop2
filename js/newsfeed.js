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

// ---------- Admin "+ Add card" ----------
// Any admin can post a card from the home page, e.g. one Owen sends over or
// one made in tools/stat-designer. It goes through the same /api/news
// endpoint as the bot, authorised by the admin's own session (checked against
// admin_users on the server, so hiding the button is only cosmetic).
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_WIDTH = 1920;

function isAdminPage() {
  return document.documentElement.getAttribute('data-admin') === 'true';
}

// A 2x export from the designer is 3840px wide and can pass 5MB. Shrink
// anything wider than 1920px (or heavier than 2.5MB) to a 1920px WEBP, which
// is still sharp at full-size view.
async function prepareImage(file) {
  const bmp = await createImageBitmap(file);
  if (bmp.width <= MAX_WIDTH && file.size <= 2.5 * 1024 * 1024) { bmp.close(); return file; }
  const scale = Math.min(1, MAX_WIDTH / bmp.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const toBlob = (type, q) => new Promise((res) => canvas.toBlob(res, type, q));
  let blob = await toBlob('image/webp', 0.92);
  // Older Safari can't encode WEBP and quietly hands back a PNG instead.
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/png');
  return blob;
}

function uploadFormHtml() {
  return `
    <form class="news-upload" method="dialog">
      <button type="button" class="news-dialog__close" data-close aria-label="Close">✕</button>
      <h2 class="news-dialog__title">Add a card</h2>
      <label class="news-upload__field">Image (PNG, WEBP or JPEG)
        <input type="file" name="image" accept="image/png,image/webp,image/jpeg" required>
      </label>
      <img class="news-upload__preview" alt="" hidden>
      <label class="news-upload__field">Title
        <input type="text" name="title" maxlength="140" required placeholder="Hurricane 2–1 FarmVille">
      </label>
      <div class="news-upload__row">
        <label class="news-upload__field">Type
          <select name="kind">
            <option value="result">Result</option>
            <option value="match">Scoreboard</option>
            <option value="elimination">Eliminations</option>
            <option value="bracket">Bracket</option>
            <option value="hero">Hero</option>
            <option value="team">Team</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label class="news-upload__field">Division
          <select name="division">
            <option value="">None</option>
            <option value="upper">Upper</option>
            <option value="mid">Mid</option>
            <option value="lower">Lower</option>
          </select>
        </label>
      </div>
      <label class="news-upload__field">Match IDs <span>optional, comma-separated, for OpenDota/Dotabuff links</span>
        <input type="text" name="match_ids" inputmode="numeric" placeholder="8995123456, 8995127890">
      </label>
      <label class="news-upload__field">Teams <span>optional, comma-separated</span>
        <input type="text" name="teams" placeholder="Hurricane, FarmVille">
      </label>
      <p class="news-upload__status" role="status"></p>
      <button type="submit" class="news-upload__submit">Post to home page</button>
    </form>`;
}

export async function initNewsFeed() {
  const host = document.getElementById('homeNews');
  const layout = document.getElementById('homeLayout');
  if (!host) return;

  let posts = [];
  let loadError = null;
  const refresh = async () => {
    try {
      posts = (await loadPosts()).filter((p) => imageUrl(p.image_path));
      loadError = null;
    } catch (e) {
      // Most likely news-migration.sql hasn't been run yet.
      console.warn('News feed unavailable:', e.message || e);
      loadError = e;
    }
  };
  await refresh();

  const dialog = document.createElement('dialog');
  dialog.className = 'news-dialog';
  document.body.appendChild(dialog);
  let open = null;

  // Visitors only see the sidebar once there's a card; admins always do, so
  // they have somewhere to press "+ Add card" on an empty feed.
  const render = () => {
    const show = posts.length > 0 || isAdminPage();
    host.hidden = !show;
    layout?.classList.toggle('home-layout--news', show);
    if (!show) return;
    const body = posts.length
      ? `<ul class="news-list">${posts.map(itemHtml).join('')}</ul>`
      : `<p class="news-empty">${loadError ? "Couldn't load cards." : 'No cards yet. Only admins can see this box until one is added.'}</p>`;
    host.innerHTML = `
      <div class="home-news__head">
        <div class="section-label">Latest</div>
        <button type="button" class="news-add" data-add>+ Add card</button>
      </div>
      ${body}`;
  };
  render();
  // auth.js sets data-admin once its admin_users lookup lands, after this has run.
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['data-admin'] });

  host.addEventListener('click', (e) => {
    if (e.target.closest('[data-add]')) { openUpload(); return; }
    const btn = e.target.closest('.news-item__btn');
    if (!btn) return;
    open = posts.find((p) => String(p.id) === btn.dataset.id);
    if (!open) return;
    dialog.innerHTML = dialogHtml(open);
    dialog.showModal();
  });

  function openUpload() {
    open = null;
    dialog.innerHTML = uploadFormHtml();
    const form = dialog.querySelector('form');
    const status = form.querySelector('.news-upload__status');
    const preview = form.querySelector('.news-upload__preview');
    const say = (msg, bad) => { status.textContent = msg; status.classList.toggle('is-bad', !!bad); };

    form.image.addEventListener('change', () => {
      const f = form.image.files[0];
      if (preview.src) URL.revokeObjectURL(preview.src);
      preview.hidden = !f;
      if (f) preview.src = URL.createObjectURL(f);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (MOCK) { say('Mock mode (?mocknews=1) can\'t post. Try it on the live site.', true); return; }
      const submit = form.querySelector('.news-upload__submit');
      submit.disabled = true;
      try {
        const { data } = await supabaseClient.auth.getSession();
        const token = data && data.session && data.session.access_token;
        if (!token) throw new Error('You\'re signed out. Sign in again and retry.');

        say('Preparing image…');
        const image = await prepareImage(form.image.files[0]);
        if (image.size > MAX_UPLOAD_BYTES) throw new Error('That image is still over 5MB after shrinking. Export at 1x instead.');

        const fd = new FormData();
        fd.append('image', image, 'card');
        for (const k of ['title', 'kind', 'division', 'match_ids', 'teams']) fd.append(k, form[k].value.trim());

        say('Uploading…');
        const res = await fetch('/api/news', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error || `Upload failed (HTTP ${res.status}).`);

        await refresh();
        render();
        dialog.close();
      } catch (err) {
        say(err.message || String(err), true);
      } finally {
        submit.disabled = false;
      }
    });

    dialog.showModal();
    form.image.focus();
  }

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
