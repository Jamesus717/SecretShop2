// Match cards: what Owen's Discord bot (and admins) post, read from news_posts
// in Supabase (written only by functions/api/news.js). Cards are made with
// tools/stat-designer, so a change there changes what shows here.
//
// Shared by three pages:
//   - home: the "Latest" sidebar (initNewsFeed) and card buttons on results
//   - /news: every card (news.js)
//   - /playoffs: card buttons on played matches
// All of them open cards in the same full-size view (openCard), which also
// holds the series' highlights video when an admin has added one.
//
// ?mocknews=1 reads mock-data/news-posts.json instead, for local work
// (python -m http.server has no Supabase table to read).

import { supabaseClient } from './supabase.js';

const SUPABASE_URL = 'https://nqcbfsnscqoaznypovyx.supabase.co';
const BUCKET = 'news-cards';
const SIDEBAR_POSTS = 12;
const RECENT_POSTS = 100;          // a whole season's series cards, for matching results
const MOCK = new URLSearchParams(location.search).has('mocknews');
const COLUMNS = 'id, created_at, kind, title, image_path, thumb_path, division, teams, match_ids, youtube_id, hidden';

export const DIV_LABELS = { upper: 'Upper', mid: 'Mid', lower: 'Lower' };
export const KIND_LABELS = {
  result: 'Result', match: 'Scoreboard', elimination: 'Eliminations',
  bracket: 'Bracket', hero: 'Hero', team: 'Team', other: 'News'
};

// Titles and team names come from the bot, which builds them from sheets
// people type into — escape all of it.
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Paths come from news.js as YYYY-MM/<uuid>[-thumb].<ext>. Anything else
// isn't ours, so don't build a URL from it.
function storageUrl(path) {
  if (!path) return null;
  if (MOCK) return /^[\w./-]+$/.test(path) && !path.includes('..') ? path : null;
  return /^\d{4}-\d{2}\/[0-9a-f-]{36}(-thumb)?\.(png|webp|jpg)$/.test(path)
    ? `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
    : null;
}
export const imageUrl = (p) => storageUrl(p.image_path);
// The bot's full cards are ~3MB PNGs; lists use the small copy when there is one.
export const thumbUrl = (p) => storageUrl(p.thumb_path) || imageUrl(p);

export function isAdminPage() {
  return document.documentElement.getAttribute('data-admin') === 'true';
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

// ---------- loading ----------
// RLS returns hidden posts to admins only, so admins can unhide them.
// `before` (an ISO date) pages backwards for /news's "Load more".
export async function loadNewsPosts({ limit = SIDEBAR_POSTS, before = null, division = null } = {}) {
  if (MOCK) {
    const res = await fetch('mock-data/news-posts.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`mock news HTTP ${res.status}`);
    let rows = await res.json();
    if (division) rows = rows.filter((p) => p.division === division);
    if (before) rows = rows.filter((p) => p.created_at < before);
    return rows.filter((p) => imageUrl(p)).slice(0, limit);
  }
  let q = supabaseClient.from('news_posts').select(COLUMNS).order('created_at', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  if (division) q = q.eq('division', division);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).filter((p) => imageUrl(p));
}

// One shared fetch per page load for the pages that only need "recent cards"
// (home sidebar + result buttons, Playoffs buttons).
let recentPromise = null;
export function getRecentPosts({ fresh = false } = {}) {
  if (!recentPromise || fresh) {
    recentPromise = loadNewsPosts({ limit: RECENT_POSTS }).catch((e) => {
      console.warn('News cards unavailable:', e.message || e);
      recentPromise = null;
      return [];
    });
  }
  return recentPromise;
}

// ---------- matching a sheet result to its card ----------
// Team names differ between the sheet and Imprint ("N-Stitution" /
// "N-stitution", "Slob Team" / "SLOB Team"), so compare letters and digits only.
const teamKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The result card for a sheet match between teams a and b played on `date`
 * (YYYY-MM-DD), or null. Two teams can meet twice in a double-elimination
 * bracket, so only a card posted within CARD_WINDOW_DAYS after the match
 * counts (the bot posts straight after the games; this leaves room for an
 * admin uploading a few days late). Otherwise a rematch's card would also
 * show on their first meeting.
 */
const CARD_WINDOW_DAYS = 4;
export function findCardFor(posts, a, b, date) {
  const want = [teamKey(a), teamKey(b)].sort().join('|');
  if (!want.replace('|', '')) return null;
  const hits = posts.filter((p) => !p.hidden && (p.kind === 'result' || p.kind === 'match')
    && (p.teams || []).length === 2 && p.teams.map(teamKey).sort().join('|') === want);
  if (!hits.length) return null;
  const until = date ? new Date(Date.parse(`${date}T00:00:00Z`) + (CARD_WINDOW_DAYS + 1) * 86400000).toISOString() : null;
  const onOrAfter = hits.filter((p) => !date || (p.created_at.slice(0, 10) >= date && p.created_at < until))
    .sort((x, y) => x.created_at.localeCompare(y.created_at));
  // Result cards are kind 'result'; prefer those over single-game scoreboards.
  return onOrAfter.find((p) => p.kind === 'result') || onOrAfter[0] || null;
}

const POSTS_BY_ID = new Map();
function remember(posts) { for (const p of posts) POSTS_BY_ID.set(String(p.id), p); }

/** A small "CARD" button for a result row. Clicks are handled by bindCardLinks(). */
export function cardLinkHtml(post, cls = '') {
  if (!post) return '';
  remember([post]);
  return `<button type="button" class="news-card-link ${cls}" data-news-card="${esc(post.id)}"
    title="Open the result card${post.youtube_id ? ' and highlights' : ''}">${post.youtube_id ? '▶ ' : ''}CARD</button>`;
}

export function bindCardLinks(root) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-news-card]');
    if (!btn) return;
    const post = POSTS_BY_ID.get(btn.dataset.newsCard);
    if (post) openCard(post);
  });
}

// ---------- YouTube ----------
// A YouTube link or bare id -> the 11-character id. null = empty,
// undefined = not a YouTube video. Mirrors youtubeId() in functions/api/news.js.
export function youtubeId(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(s); } catch { return undefined; }
  const host = u.hostname.replace(/^(www|m)\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v') || (/^\/(?:shorts|embed|live)\/([^/?#]+)/.exec(u.pathname) || [])[1];
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : undefined;
}

// ---------- list items ----------
export function divChip(division) {
  const label = DIV_LABELS[division];
  return label ? `<span class="news-div news-div--${division}">${label}</span>` : '';
}

export function itemHtml(p) {
  remember([p]);
  return `<li class="news-item${p.hidden ? ' news-item--hidden' : ''}">
    <button type="button" class="news-item__btn" data-news-card="${esc(p.id)}">
      <span class="news-item__frame">
        <img class="news-item__img" src="${esc(thumbUrl(p))}" alt="" loading="lazy" decoding="async">
        ${p.youtube_id ? '<span class="news-item__play" aria-label="Has highlights video">▶</span>' : ''}
      </span>
      <span class="news-item__title">${esc(p.title)}</span>
      <span class="news-item__meta">
        ${divChip(p.division)}
        <span>${esc(KIND_LABELS[p.kind] || 'News')}</span>
        <span>${esc(ago(p.created_at))}</span>
        ${p.hidden ? '<span class="news-item__hidden-tag">Hidden</span>' : ''}
      </span>
    </button>
  </li>`;
}

// ---------- full-size view ----------
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
  return `
    <div class="news-dialog__inner">
      <button type="button" class="news-dialog__close" data-close aria-label="Close">✕</button>
      <div class="news-dialog__media">
        <img class="news-dialog__img" src="${esc(imageUrl(p))}" alt="${esc(p.title)}">
      </div>
      <div class="news-dialog__body">
        <h2 class="news-dialog__title">${esc(p.title)}</h2>
        <div class="news-item__meta">
          ${divChip(p.division)}
          <span>${esc(KIND_LABELS[p.kind] || 'News')}</span>
          <span>${esc(fullDate(p.created_at))}</span>
        </div>
        ${p.youtube_id ? `<div class="news-dialog__switch">
          <button type="button" class="news-dialog__tab is-on" data-show="card">Card</button>
          <button type="button" class="news-dialog__tab" data-show="video">▶ Highlights</button>
        </div>` : ''}
        ${matchLinks(p.match_ids)}
        <div class="news-dialog__admin">
          <form class="news-dialog__yt" data-yt-form>
            <input type="url" name="yt" placeholder="YouTube link for this series' highlights" value="${p.youtube_id ? `https://youtu.be/${esc(p.youtube_id)}` : ''}">
            <button type="submit">Save video</button>
          </form>
          <button type="button" class="news-dialog__admin-btn" data-toggle-hidden>
            ${p.hidden ? 'Show on the site' : 'Hide from the site'}
          </button>
          <p class="news-dialog__msg" role="status"></p>
        </div>
      </div>
    </div>`;
}

let dialog = null;
let openPost = null;

// Empty it as well as closing it, so a playing video actually stops. (The
// dialog's own 'close' event does the same for Esc, but can fire late.)
function closeDialog() {
  if (!dialog) return;
  dialog.close();
  dialog.innerHTML = '';
  openPost = null;
}
const changeListeners = new Set();
/** Called with the post after an admin hides/unhides it or sets its video. */
export function onPostChange(fn) { changeListeners.add(fn); }

function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'news-dialog';
  document.body.appendChild(dialog);

  // Stop the video when the view closes, not just hide it.
  dialog.addEventListener('close', () => { dialog.innerHTML = ''; openPost = null; });

  dialog.addEventListener('click', async (e) => {
    // A click on the backdrop lands on the <dialog> itself.
    if (e.target === dialog || e.target.closest('[data-close]')) { closeDialog(); return; }

    const tab = e.target.closest('[data-show]');
    if (tab && openPost) {
      const media = dialog.querySelector('.news-dialog__media');
      dialog.querySelectorAll('[data-show]').forEach((b) => b.classList.toggle('is-on', b === tab));
      // youtube-nocookie, and only built on click: no YouTube request or
      // cookies for anyone who only looks at the card.
      media.innerHTML = tab.dataset.show === 'video'
        ? `<iframe class="news-dialog__video" src="https://www.youtube-nocookie.com/embed/${esc(openPost.youtube_id)}?autoplay=1&rel=0"
             title="${esc(openPost.title)} highlights" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
        : `<img class="news-dialog__img" src="${esc(imageUrl(openPost))}" alt="${esc(openPost.title)}">`;
      return;
    }

    const toggle = e.target.closest('[data-toggle-hidden]');
    if (toggle && openPost) {
      // The button is only revealed by CSS for admins; RLS is what actually
      // stops anyone else, this just avoids a pointless request.
      if (!window.__isAdmin || MOCK) return;
      await saveField(toggle, { hidden: !openPost.hidden });
    }
  });

  dialog.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-yt-form]');
    if (!form || !openPost) return;
    e.preventDefault();
    const id = youtubeId(form.yt.value);
    if (id === undefined) { say("That isn't a YouTube video link.", true); return; }
    if (!window.__isAdmin || MOCK) return;
    await saveField(form.querySelector('button'), { youtube_id: id });
  });
  return dialog;
}

function say(msg, bad) {
  const el = dialog && dialog.querySelector('.news-dialog__msg');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('is-bad', !!bad);
}

async function saveField(btn, patch) {
  btn.disabled = true;
  const { error } = await supabaseClient.from('news_posts').update(patch).eq('id', openPost.id);
  btn.disabled = false;
  if (error) { say(`Couldn't save: ${error.message}`, true); return; }
  const post = openPost;
  Object.assign(post, patch);
  for (const fn of changeListeners) fn(post);
  closeDialog();
}

export function openCard(post) {
  ensureDialog();
  openPost = post;
  dialog.innerHTML = dialogHtml(post);
  dialog.showModal();
}

// ---------- thumbnails ----------
// A ~640px WEBP is ~50KB against the bot's ~3MB PNG. Made in the browser
// (cards are public, and Supabase storage sends CORS headers, so the canvas
// isn't tainted).
const THUMB_WIDTH = 640;
async function canvasBlob(source, width, type, quality) {
  const bmp = await createImageBitmap(source);
  const scale = Math.min(1, width / bmp.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const toBlob = (t, q) => new Promise((res) => canvas.toBlob(res, t, q));
  let blob = await toBlob(type, quality);
  // Older Safari can't encode WEBP and quietly hands back a PNG instead.
  if (!blob || blob.type !== type) blob = await toBlob('image/png');
  return blob;
}
const makeThumb = (source) => canvasBlob(source, THUMB_WIDTH, 'image/webp', 0.8);

async function adminToken() {
  const { data } = await supabaseClient.auth.getSession();
  return (data && data.session && data.session.access_token) || null;
}

/**
 * Admins only: give posts that arrived without a thumbnail (the bot's, unless
 * Owen sends one) a small copy, so nobody else has to download the full PNG
 * just to see the sidebar. One at a time, quietly, after the page is drawn.
 */
let backfilling = false;
export async function backfillThumbs(posts, onDone) {
  if (backfilling || MOCK || !isAdminPage()) return;
  const todo = posts.filter((p) => !p.thumb_path);
  if (!todo.length) return;
  backfilling = true;
  try {
    const token = await adminToken();
    if (!token) return;
    for (const p of todo) {
      try {
        const res = await fetch(imageUrl(p), { mode: 'cors' });
        if (!res.ok) continue;
        const thumb = await makeThumb(await res.blob());
        const fd = new FormData();
        fd.append('thumb_for', String(p.id));
        fd.append('thumb', thumb, 'thumb');
        const up = await fetch('/api/news', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
        if (!up.ok) { console.warn('Thumbnail back-fill failed for post', p.id, up.status); continue; }
        const out = await up.json();
        p.thumb_path = out.thumb_url.split(`/${BUCKET}/`)[1];
        if (onDone) onDone(p);
      } catch (e) {
        console.warn('Thumbnail back-fill failed for post', p.id, e);
      }
    }
  } finally {
    backfilling = false;
  }
}

// ---------- admin "+ Add card" ----------
// Any admin can post a card, e.g. one Owen sends over or one made in
// tools/stat-designer. It goes through the same /api/news endpoint as the bot,
// authorised by the admin's own session (checked against admin_users on the
// server, so hiding the button is only cosmetic).
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// The full card: anything wider than 1920px or heavier than 1.5MB becomes a
// 1920px WEBP (a 2x designer export is 3840px and can pass 5MB).
async function prepareFull(file) {
  const bmp = await createImageBitmap(file);
  const small = bmp.width <= 1920 && file.size <= 1.5 * 1024 * 1024;
  bmp.close();
  return small ? file : canvasBlob(file, 1920, 'image/webp', 0.92);
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
      <label class="news-upload__field">Title <span>results are shown winner first</span>
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
      <label class="news-upload__field">Teams <span>optional, comma-separated — links the card to the result on Home and Playoffs</span>
        <input type="text" name="teams" placeholder="Hurricane, FarmVille">
      </label>
      <label class="news-upload__field">Match IDs <span>optional, comma-separated, for OpenDota/Dotabuff links</span>
        <input type="text" name="match_ids" inputmode="numeric" placeholder="8995123456, 8995127890">
      </label>
      <label class="news-upload__field">Highlights video <span>optional YouTube link</span>
        <input type="url" name="youtube" placeholder="https://youtu.be/…">
      </label>
      <p class="news-upload__status" role="status"></p>
      <button type="submit" class="news-upload__submit">Post to the site</button>
    </form>`;
}

/** Opens the upload form; onDone() runs after a successful post. */
export function openUpload(onDone) {
  ensureDialog();
  openPost = null;
  dialog.innerHTML = uploadFormHtml();
  const form = dialog.querySelector('form');
  const status = form.querySelector('.news-upload__status');
  const preview = form.querySelector('.news-upload__preview');
  const sayUp = (msg, bad) => { status.textContent = msg; status.classList.toggle('is-bad', !!bad); };

  form.image.addEventListener('change', () => {
    const f = form.image.files[0];
    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.hidden = !f;
    if (f) preview.src = URL.createObjectURL(f);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation(); // not the dialog's video form handler
    if (MOCK) { sayUp('Mock mode (?mocknews=1) can\'t post. Try it on the live site.', true); return; }
    const submit = form.querySelector('.news-upload__submit');
    submit.disabled = true;
    try {
      const token = await adminToken();
      if (!token) throw new Error('You\'re signed out. Sign in again and retry.');
      if (youtubeId(form.youtube.value) === undefined) throw new Error('That isn\'t a YouTube video link.');

      sayUp('Preparing image…');
      const file = form.image.files[0];
      const [image, thumb] = await Promise.all([prepareFull(file), makeThumb(file)]);
      if (image.size > MAX_UPLOAD_BYTES) throw new Error('That image is still over 5MB after shrinking. Export at 1x instead.');

      const fd = new FormData();
      fd.append('image', image, 'card');
      fd.append('thumb', thumb, 'thumb');
      for (const k of ['title', 'kind', 'division', 'match_ids', 'teams', 'youtube']) fd.append(k, form[k].value.trim());

      sayUp('Uploading…');
      const res = await fetch('/api/news', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || `Upload failed (HTTP ${res.status}).`);

      closeDialog();
      if (onDone) await onDone();
    } catch (err) {
      sayUp(err.message || String(err), true);
    } finally {
      submit.disabled = false;
    }
  });

  dialog.showModal();
  form.image.focus();
}

// ---------- home page "Latest" sidebar ----------
export async function initNewsFeed() {
  const host = document.getElementById('homeNews');
  const layout = document.getElementById('homeLayout');
  if (!host) return;

  let posts = [];
  let loadError = null;
  const refresh = async () => {
    try {
      posts = (await getRecentPosts({ fresh: true })).slice(0, SIDEBAR_POSTS);
      loadError = null;
    } catch (e) {
      loadError = e;
    }
  };
  posts = (await getRecentPosts()).slice(0, SIDEBAR_POSTS);

  // Visitors only see the sidebar once there's a card; admins always do, so
  // they have somewhere to press "+ Add card" on an empty feed.
  const render = () => {
    const show = posts.length > 0 || isAdminPage();
    host.hidden = !show;
    layout?.classList.toggle('home-layout--news', show);
    if (!show) return;
    const body = posts.length
      ? `<ul class="news-list">${posts.map(itemHtml).join('')}</ul>
         <a class="news-more" href="news.html">All cards →</a>`
      : `<p class="news-empty">${loadError ? "Couldn't load cards." : 'No cards yet. Only admins can see this box until one is added.'}</p>`;
    host.innerHTML = `
      <div class="home-news__head">
        <div class="section-label">Latest</div>
        <button type="button" class="news-add" data-add>+ Add card</button>
      </div>
      ${body}`;
  };
  render();

  // auth.js sets data-admin once its admin_users lookup lands, after this has
  // run: show the admin controls, then quietly thumbnail anything missing one.
  const onAdmin = () => { render(); backfillThumbs(posts, render); };
  new MutationObserver(onAdmin).observe(document.documentElement, { attributes: true, attributeFilter: ['data-admin'] });
  if (isAdminPage()) onAdmin();

  onPostChange(() => render());
  bindCardLinks(host);
  host.addEventListener('click', (e) => {
    if (e.target.closest('[data-add]')) openUpload(async () => { await refresh(); render(); });
  });
}
