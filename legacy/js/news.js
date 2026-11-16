// /news: every match card, newest first, 24 at a time, filterable by
// division. Cards, the full-size view and the admin upload all come from
// js/newsfeed.js, the same as the home sidebar.

import {
  loadNewsPosts, itemHtml, bindCardLinks, onPostChange, openUpload, backfillThumbs, isAdminPage
} from './newsfeed.js?v=20261008';

const PAGE = 24;
let division = '';
let posts = [];
let done = false;
let loading = false;
let failed = false;

const $ = (id) => document.getElementById(id);

function render() {
  $('nwGrid').innerHTML = posts.map(itemHtml).join('');
  const status = $('nwStatus');
  status.hidden = posts.length > 0 && !failed;
  status.textContent = failed ? "Couldn't load cards. Try refreshing."
    : loading ? 'Loading cards…' : 'No cards here yet.';
  $('nwMore').hidden = done || loading || !posts.length;
}

async function loadMore({ reset = false } = {}) {
  if (loading) return;
  loading = true;
  failed = false;
  if (reset) { posts = []; done = false; }
  render();
  try {
    const before = posts.length ? posts[posts.length - 1].created_at : null;
    const page = await loadNewsPosts({ limit: PAGE, before, division: division || null });
    posts = posts.concat(page);
    done = page.length < PAGE;
  } catch (e) {
    console.error('Could not load cards:', e);
    failed = true;
  } finally {
    loading = false;
    render();
  }
  backfillThumbs(posts, render);
}

function init() {
  const grid = $('nwGrid');
  if (!grid) return;
  bindCardLinks(grid);
  onPostChange(render);

  $('nwMore').addEventListener('click', () => loadMore());
  $('nwAdd').addEventListener('click', () => openUpload(() => loadMore({ reset: true })));
  document.querySelector('.nw-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-div]');
    if (!btn || btn.dataset.div === division) return;
    division = btn.dataset.div;
    document.querySelectorAll('.nw-filter').forEach((b) => b.classList.toggle('is-on', b === btn));
    loadMore({ reset: true });
  });

  // Admin status lands after first paint (auth.js); thumbnail anything missing then.
  new MutationObserver(() => { if (isAdminPage()) backfillThumbs(posts, render); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-admin'] });

  loadMore();
}

document.addEventListener('DOMContentLoaded', init);
