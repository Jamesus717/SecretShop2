// /clips: the community clip queue (docs/clip-queue-design.md). Members send
// clips through Owen's Discord bot; any admin approves or rejects them here;
// Owen's PC pulls the approved ones, renders and posts them, and marks them
// posted.
//
// Everything goes through functions/api/clips with the admin's own session,
// which the server checks against admin_users — so this page shows nothing to
// anyone else, whatever the browser does. Not in the nav for visitors; auth.js
// adds a "Clips" link for admins.
//
// ?mock=1 reads mock-data/clip-submissions.json instead and keeps approvals in
// memory, for local work (python -m http.server has no /api).

import { supabaseClient } from './supabase.js';

const SUPABASE_URL = 'https://nqcbfsnscqoaznypovyx.supabase.co';
const SIGNED_FILE_PREFIX = `${SUPABASE_URL}/storage/v1/object/sign/clip-files/`;
const MOCK = new URLSearchParams(location.search).has('mock');
const EMPTY = {
  pending: 'Nothing waiting. New clips from the bot show up here.',
  approved: 'No approved clips waiting for Owen.',
  posted: 'Nothing posted yet.',
  rejected: 'No rejected clips.'
};

let status = 'pending';
let clips = [];
let loading = false;
let message = '';           // replaces the list: errors, "admins only"
let rejecting = null;       // id of the clip whose reject form is open
let busy = new Set();       // ids with a request in flight
let mockRows = null;

const $ = (id) => document.getElementById(id);

// Names, teams and descriptions are typed by members into Discord — escape
// all of it.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Only ever link to https pages, and only play files from our own bucket.
function safeLink(u) {
  try { return new URL(u).protocol === 'https:' ? u : null; } catch { return null; }
}
function safeFileUrl(u) {
  if (MOCK) return typeof u === 'string' && /^mock-data\/[\w./-]+$/.test(u) && !u.includes('..') ? u : null;
  return typeof u === 'string' && u.startsWith(SIGNED_FILE_PREFIX) ? u : null;
}
function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function when(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

// ---------- server ----------
async function token() {
  const { data } = await supabaseClient.auth.getSession();
  return (data && data.session && data.session.access_token) || null;
}

async function api(path, { method = 'GET', body } = {}) {
  const t = await token();
  if (!t) { const e = new Error('signed out'); e.status = 401; throw e; }
  const res = await fetch(`/api/clips${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  });
  // A missing Pages Function comes back as Cloudflare's 200 HTML page, not
  // JSON — treat anything that isn't JSON as "not deployed".
  const out = await res.json().catch(() => null);
  if (!res.ok || !out) {
    const e = new Error((out && out.error) || `HTTP ${res.status}`);
    e.status = out ? res.status : 0;
    throw e;
  }
  return out;
}

async function mockLoad() {
  if (!mockRows) {
    const res = await fetch('mock-data/clip-submissions.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`mock clips HTTP ${res.status}`);
    mockRows = await res.json();
  }
  const rows = mockRows.filter((c) => c.status === status);
  rows.sort((a, b) => (status === 'pending' || status === 'approved' ? 1 : -1) * a.created_at.localeCompare(b.created_at));
  return rows;
}

function mockUpdate(id, patch) {
  const row = mockRows.find((c) => c.id === id);
  Object.assign(row, patch);
  return { id, status: row.status };
}

async function load() {
  loading = true;
  message = '';
  rejecting = null;
  render();
  try {
    clips = MOCK ? await mockLoad() : (await api(`?status=${status}&limit=100`)).clips;
  } catch (e) {
    console.error('Could not load clips:', e);
    clips = [];
    message = e.status === 401 ? 'Admins only. Sign in with an admin Discord account to see the queue.'
      : e.status === 0 ? "Couldn't reach the clip queue. It may not be deployed yet."
      : `Couldn't load clips: ${e.message}`;
  } finally {
    loading = false;
    render();
  }
}

async function act(id, kind, extra = {}) {
  if (busy.has(id)) return;
  busy.add(id);
  render();
  try {
    if (MOCK) {
      const now = new Date().toISOString();
      if (kind === 'posted') mockUpdate(id, { status: 'posted', posted_at: now });
      else mockUpdate(id, {
        status: kind === 'approve' ? 'approved' : 'rejected', reviewed_by: 'you (mock)', reviewed_via: 'site',
        reviewed_at: now, reject_reason: kind === 'reject' ? (extra.reason || null) : null
      });
    } else if (kind === 'posted') {
      await api(`/${id}/posted`, { method: 'POST', body: {} });
    } else {
      await api(`/${id}/review`, { method: 'POST', body: { decision: kind, reason: extra.reason || '' } });
    }
    // It has moved to another tab.
    clips = clips.filter((c) => c.id !== id);
    if (rejecting === id) rejecting = null;
  } catch (e) {
    console.error(`Could not ${kind} clip ${id}:`, e);
    alert(`Couldn't ${kind === 'posted' ? 'mark that clip posted' : `${kind} that clip`}: ${e.message}`);
    if (e.status === 409) { busy.delete(id); return load(); }
  } finally {
    busy.delete(id);
    render();
  }
}

// ---------- rendering ----------
function mediaHtml(c) {
  const file = safeFileUrl(c.file_url);
  if (file) return `<video class="cl-video" controls preload="metadata" src="${esc(file)}"></video>`;
  if (c.file_path) return '<p class="cl-note">Uploaded file (no longer stored).</p>';
  const link = safeLink(c.link);
  if (link) {
    return `<a class="cl-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open clip on ${esc(hostOf(link))} ↗</a>`;
  }
  return '<p class="cl-note">No clip link.</p>';
}

function reviewHtml(c) {
  const bits = [];
  if (c.reviewed_by) {
    const verb = c.status === 'rejected' ? 'Rejected' : 'Approved';
    bits.push(`${verb} by <strong>${esc(c.reviewed_by)}</strong>${c.reviewed_via === 'discord' ? ' in Discord' : ''} · ${esc(when(c.reviewed_at))}`);
  }
  if (c.reject_reason) bits.push(`Reason: ${esc(c.reject_reason)}`);
  if (c.posted_at) bits.push(`Posted ${esc(when(c.posted_at))}`);
  const posts = (c.post_urls || []).map(safeLink).filter(Boolean);
  if (posts.length) {
    bits.push(posts.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(hostOf(u))} ↗</a>`).join(' · '));
  }
  return bits.length ? `<p class="cl-review">${bits.join('<br>')}</p>` : '';
}

function actionsHtml(c) {
  const dis = busy.has(c.id) ? ' disabled' : '';
  if (rejecting === c.id) {
    return `
      <form class="cl-reject" data-reject-form="${c.id}">
        <label class="cl-reject__label" for="clReason${c.id}">Reason (optional, the member may see it)</label>
        <input class="cl-reject__input" id="clReason${c.id}" name="reason" maxlength="300" autocomplete="off">
        ${c.file_path ? '<p class="cl-note">The uploaded file is deleted. This can\'t be undone.</p>' : ''}
        <div class="cl-actions">
          <button type="submit" class="cl-btn cl-btn--reject"${dis}>Reject clip</button>
          <button type="button" class="cl-btn" data-cancel${dis}>Cancel</button>
        </div>
      </form>`;
  }
  if (c.status === 'pending') {
    return `<div class="cl-actions">
      <button type="button" class="cl-btn cl-btn--approve" data-act="approve" data-id="${c.id}"${dis}>Approve</button>
      <button type="button" class="cl-btn" data-act="reject" data-id="${c.id}"${dis}>Reject…</button>
    </div>`;
  }
  if (c.status === 'approved') {
    return `<div class="cl-actions">
      <button type="button" class="cl-btn" data-act="posted" data-id="${c.id}"${dis}>Mark posted</button>
      <button type="button" class="cl-btn" data-act="reject" data-id="${c.id}"${dis}>Reject…</button>
    </div>`;
  }
  return '';
}

function itemHtml(c) {
  const teams = (c.teams || []).map((t) => `<span class="cl-team">${esc(t)}</span>`).join('');
  const match = /^\d{6,12}$/.test(String(c.match_id ?? ''))
    ? `<a class="cl-match" href="https://www.opendota.com/matches/${c.match_id}" target="_blank" rel="noopener noreferrer">Match ${c.match_id} ↗</a>`
    : '';
  return `
    <li class="cl-item${busy.has(c.id) ? ' is-busy' : ''}">
      <div class="cl-item__head">
        <span class="cl-who">${esc(c.submitter_name)}</span>
        <time class="cl-when" datetime="${esc(c.created_at)}">${esc(when(c.created_at))}</time>
      </div>
      ${teams || match ? `<div class="cl-tags">${teams}${match}</div>` : ''}
      ${c.description ? `<p class="cl-desc">${esc(c.description)}</p>` : ''}
      ${mediaHtml(c)}
      ${reviewHtml(c)}
      ${actionsHtml(c)}
    </li>`;
}

function render() {
  $('clList').innerHTML = message || loading ? '' : clips.map(itemHtml).join('');
  const s = $('clStatus');
  s.textContent = loading ? 'Loading clips…' : message || EMPTY[status];
  s.hidden = !loading && !message && clips.length > 0;
  if (rejecting !== null) {
    const input = document.getElementById(`clReason${rejecting}`);
    if (input && document.activeElement !== input && !input.dataset.focused) {
      input.dataset.focused = '1';
      input.focus();
    }
  }
}

function init() {
  const list = $('clList');
  if (!list) return;

  document.querySelector('.cl-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-status]');
    if (!tab || tab.dataset.status === status || loading) return;
    status = tab.dataset.status;
    document.querySelectorAll('.cl-tab').forEach((b) => {
      b.classList.toggle('is-on', b === tab);
      b.setAttribute('aria-selected', String(b === tab));
    });
    load();
  });

  list.addEventListener('click', (e) => {
    if (e.target.closest('[data-cancel]')) { rejecting = null; render(); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const kind = btn.dataset.act;
    if (kind === 'reject') { rejecting = id; render(); return; }
    if (kind === 'posted' && !confirm('Mark this clip as posted? Owen\'s Highlight Cutter normally does this itself after posting.')) return;
    act(id, kind);
  });

  list.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-reject-form]');
    if (!form) return;
    e.preventDefault();
    act(Number(form.dataset.rejectForm), 'reject', { reason: form.elements.reason.value.trim() });
  });

  load();
}

init();
