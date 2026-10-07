// Highlight cutter page. Talks to serve.mjs; all state lives in the project
// JSON on disk, so the page can be reloaded at any point.

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = (s) => { const n = Math.round(Math.abs(s)); return `${s < 0 ? '-' : ''}${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const hms = (s) => { s = Math.round(s); const h = Math.floor(s / 3600); return h ? `${h}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : clock(s); };
const gb = (n) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`);
const LEAGUE = 'SecretLeague';
const SITE = 'secretshopdota.co.uk';

async function api(path, opts = {}) {
  const res = await fetch(`/api/${path}`, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.raw ? {} : { 'content-type': 'application/json' },
    body: opts.raw || (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202) throw new Error(data.error || `HTTP ${res.status}`);
  if (res.status === 202) throw new Error(data.error);
  return data;
}

let state = null;   // /api/state
let cur = null;     // hydrated project { project, games, long }
const jobs = {};    // label -> job id being watched

// --- jobs ---------------------------------------------------------------------

function watch(job, el, onDone) {
  const tick = async () => {
    const j = await api(`job/${job.id}`).catch(() => null);
    if (!j) return;
    el.innerHTML = j.status === 'error'
      ? `<p class="err">${esc(j.message)}</p>`
      : `<small>${esc(j.message)}</small><div class="progress"><i style="width:${Math.round(j.progress * 100)}%"></i></div>`;
    if (j.status === 'running') setTimeout(tick, 1000);
    else if (j.status === 'done') { el.innerHTML = ''; onDone && onDone(j.result); }
  };
  tick();
}

// --- sidebar ------------------------------------------------------------------

async function loadState() {
  state = await api('state');
  $('#dataDir').textContent = state.data;
  $('#projects').innerHTML = state.projects.length
    ? state.projects.map((p) => `<div class="list-item ${cur?.project.id === p.id ? 'on' : ''}" data-id="${esc(p.id)}"><span>${esc(p.title)}</span><small>${p.games} game${p.games === 1 ? '' : 's'}</small></div>`).join('')
    : '<small>No series yet.</small>';
  $('#media').innerHTML = state.media.map((m) => `
    <div class="file">
      <b>${esc(m.name)}</b>
      <div class="row" style="margin-top:4px;justify-content:space-between">
        <span><small>${gb(m.size)}</small> ${m.scanned ? '<span class="badge ok">scanned</span>' : '<span class="badge">not scanned</span>'}</span>
        <span class="row">
          <button class="btn small" data-short="${esc(m.path)}" title="Turn this whole video into one Short (e.g. a submitted Twitch clip)">Make Short</button>
          <button class="btn small" data-scan="${esc(m.path)}" title="Read the game clock so a series can use this video">${m.scanned ? 'Rescan' : 'Scan'}</button>
          <button class="btn small danger" data-del="${esc(m.path)}" title="Delete this file from disk">Delete</button>
        </span>
      </div>
      <div data-scanjob="${esc(m.path)}"></div>
    </div>`).join('') || '<small>No videos yet.</small>';
  const d = state.dota;
  $('#status').innerHTML = `
    <div>Encoder: <span class="badge ${state.encoder === 'libx264' ? '' : 'ok'}">${state.encoder === 'libx264' ? 'CPU (x264)' : 'GPU (NVENC)'}</span></div>
    ${state.encoder === 'libx264' ? '<small>Updating the NVIDIA driver to 610+ lets renders use the GPU.</small>' : ''}
    <div>Dota console: <span class="badge ${d.netcon ? 'ok' : ''}">${d.netcon ? `listening on ${d.port}` : 'not running'}</span></div>
    <small>Only needed to record replays of games that weren't streamed.</small>`;
}

$('#projects').addEventListener('click', (e) => { const it = e.target.closest('[data-id]'); if (it) openProject(it.dataset.id); });
$('#newProject').addEventListener('click', async () => {
  const title = prompt('Series name (e.g. "Slob Team vs N-stitution — Upper Div")');
  if (!title) return;
  const p = await api('project', { body: { title } });
  await loadState(); openProject(p.id);
});
$('#dlGo').addEventListener('click', async () => {
  const url = $('#dlUrl').value.trim();
  try {
    const job = await api('download', { body: { url } });
    $('#dlUrl').value = '';
    watch(job, $('#dlJob'), loadState);
  } catch (e) { $('#dlJob').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
});
$('#openMedia').addEventListener('click', (e) => { e.preventDefault(); api('open-folder', { body: { which: 'media' } }); });
$('#media').addEventListener('click', async (e) => {
  const scan = e.target.dataset.scan, del = e.target.dataset.del;
  if (e.target.dataset.short) return openClip(e.target.dataset.short);
  if (scan) {
    const job = await api('scan', { body: { file: scan } });
    watch(job, document.querySelector(`[data-scanjob="${CSS.escape(scan)}"]`), async () => { await loadState(); if (cur) openProject(cur.project.id); });
  }
  if (del) {
    const users = state.projects.length ? ' Any series using it will need the video again before rendering.' : '';
    if (!confirm(`Delete ${del.split(/[\\/]/).pop()} from disk?${users}\n\nRendered videos are kept.`)) return;
    await api('media', { method: 'DELETE', body: { file: del } });
    await loadState(); if (cur) openProject(cur.project.id);
  }
});

// --- project ------------------------------------------------------------------

async function openProject(id) {
  cancelAnimationFrame(clipLoop);
  cur = await api(`project/${id}`);
  render();
  loadState();
}

async function save() {
  cur = await api(`project/${cur.project.id}`, { method: 'PUT', body: cur.project });
  render();
}

function sourceOptions(selected) {
  const opts = state.media.map((m) => `<option value="${esc(m.path)}" ${m.path === selected ? 'selected' : ''}>${esc(m.name)}${m.scanned ? '' : ' (not scanned)'}</option>`);
  if (selected && !state.media.some((m) => m.path === selected)) opts.unshift(`<option value="${esc(selected)}" selected>${esc(selected.split(/[\\/]/).pop())} (missing)</option>`);
  return `<option value="">— choose video —</option>${opts.join('')}`;
}

function render() {
  const { project: p, games, long } = cur;
  const main = $('#main');
  const target = p.settings.targetSec || 1800;
  main.innerHTML = `
    <div class="player" id="player"><video id="video" controls preload="none"></video><div class="row" style="margin-top:4px"><small id="playing"></small><button class="btn small" id="closePlayer">Close</button></div></div>
    <div class="row" style="justify-content:space-between;margin-bottom:14px">
      <input type="text" id="title" value="${esc(p.title)}" style="font-family:Cinzel,serif;font-size:20px;color:var(--ui-gold);flex:1;min-width:240px;background:transparent;border-color:transparent">
      <button class="btn" id="addGame">+ Add game</button>
    </div>
    ${p.games.map((g, i) => gameCard(g, i, games[i])).join('') || '<div class="card"><p class="muted">Add each game of the series with <b>+ Add game</b>, paste its match id, and pick the video it was played in.</p></div>'}
    ${cardsSection(p)}
    ${renderSection(p, long, target)}`;
  bind();
}

function gameCard(g, i, info) {
  const sync = info?.sync;
  const plan = info?.plan ? new Map(info.plan.map((x) => [x.id, x])) : new Map();
  const dur = g.duration || 1;
  let status = '';
  if (!g.matchId) status = '<span class="badge">enter a match id</span>';
  else if (!g.moments) status = '<span class="badge">press Load match</span>';
  else if (!g.source) status = '<span class="badge">choose a video</span>';
  else if (!info?.scanned) status = '<span class="badge warn">video not scanned yet</span>';
  else if (sync?.error) status = `<span class="badge warn">${esc(sync.error)}</span>`;
  else if (sync) status = `<span class="badge ok">synced: VOD ${hms(sync.vodStart)} → ${hms(sync.vodEnd)}${sync.pauses ? `, ${sync.pauses} pause${sync.pauses > 1 ? 's' : ''} skipped` : ''}</span>`;

  const moments = g.moments || [];
  const longLen = moments.filter((m) => m.long).reduce((s, m) => s + (plan.get(m.id)?.len || m.end - m.start), 0);
  const ticks = [];
  for (let t = 0; t <= dur; t += 300) ticks.push(`<span class="tick" style="left:${(t / dur) * 100}%">${clock(t)}</span>`);
  return `
  <div class="card" data-game="${i}">
    <div class="row" style="justify-content:space-between">
      <h3>Game ${i + 1}${g.radiant ? ` · ${esc(g.radiant)} vs ${esc(g.dire)}` : ''}${g.winner ? ` <small>(${esc(g.winner)} won)</small>` : ''}</h3>
      <button class="btn small danger" data-act="removeGame">Remove</button>
    </div>
    <div class="row" style="margin-top:8px">
      <input type="text" data-field="matchId" value="${esc(g.matchId || '')}" placeholder="Match id" style="width:130px">
      <button class="btn" data-act="load">${g.moments ? 'Reload match' : 'Load match'}</button>
      ${g.moments ? '<button class="btn" data-act="repick" title="Forget your ticks and let it choose again">Auto-pick again</button>' : ''}
      <select data-field="source" style="flex:1;min-width:200px">${sourceOptions(g.source)}</select>
      <button class="btn" data-act="record" title="Play this game's replay in Dota and record the highlights with OBS">Record replay…</button>
    </div>
    <div class="row" style="margin-top:6px">${status}<span data-gamejob></span></div>
    ${moments.length ? `
      <div class="timeline">${moments.map((m) => `<div class="blk ${m.long ? 'long' : ''} ${m.short ? 'short' : ''}" data-play="${m.id}" title="${esc(clock(m.start))} ${esc(m.label)} (${m.score})" style="left:${(Math.max(0, m.start) / dur) * 100}%;width:${((m.end - Math.max(0, m.start)) / dur) * 100}%"></div>`).join('')}${ticks.join('')}</div>
      <table class="moments">
        <tr><th title="In the YouTube video">YT</th><th title="Make a Short">Short</th><th>Game time</th><th>Moment</th><th>Score</th><th>Length</th><th>Trim start / end</th><th></th></tr>
        ${moments.map((m) => {
          const pl = plan.get(m.id);
          return `<tr class="${m.long ? 'picked' : ''}" data-m="${m.id}">
            <td><input type="checkbox" data-mf="long" ${m.long ? 'checked' : ''}></td>
            <td><input type="checkbox" data-mf="short" ${m.short ? 'checked' : ''}></td>
            <td class="num">${clock(m.start + (m.startAdj || 0))} – ${clock(m.end + (m.endAdj || 0))}</td>
            <td>${esc(m.label)}</td>
            <td class="num"><span class="score">${m.score}</span></td>
            <td class="num">${pl ? `${Math.round(pl.len)}s` : `${Math.round(m.end - m.start)}s`}</td>
            <td class="num">
              <button class="btn small" data-adj="startAdj" data-d="-3" title="Start 3s earlier">−3</button><button class="btn small" data-adj="startAdj" data-d="3" title="Start 3s later">+3</button>
              &nbsp;
              <button class="btn small" data-adj="endAdj" data-d="-3" title="End 3s earlier">−3</button><button class="btn small" data-adj="endAdj" data-d="3" title="End 3s later">+3</button>
              ${m.startAdj || m.endAdj ? `<button class="btn small" data-adj="reset" title="Undo trims">↺</button>` : ''}
            </td>
            <td><button class="btn small" data-play="${m.id}" ${pl?.segs?.length ? '' : 'disabled'}>▶</button></td>
          </tr>`;
        }).join('')}
      </table>
      <p class="note">Ticked for YouTube: ${moments.filter((m) => m.long).length} clips, ${clock(longLen)}. Clip ends stretch while the casters are still loud, unless you trim the end yourself.</p>` : ''}
  </div>`;
}

function slot(key, label, name) {
  return `<div class="slot" data-slot="${key}">
    ${name ? `<img src="/api/asset/${encodeURIComponent(name)}?v=${Date.now()}" alt="">` : '<div class="empty">Drop a PNG</div>'}
    <div>${esc(label)}</div>
    <div class="row" style="justify-content:center;margin-top:4px">
      <label class="btn small">Choose…<input type="file" accept="image/png" hidden data-file="${key}"></label>
      ${name ? `<button class="btn small" data-clear="${key}">Clear</button>` : ''}
    </div>
  </div>`;
}

function cardsSection(p) {
  const c = p.cards || {};
  const per = p.games.map((g, i) => slot(`games.${i}.before`, `Before game ${i + 1} (default: auto title card)`, c.games?.[i]?.before) + slot(`games.${i}.after`, `After game ${i + 1} (e.g. Result card)`, c.games?.[i]?.after)).join('');
  return `<div class="card">
    <h2>Cards</h2>
    <p class="note" style="margin-bottom:10px">Export cards from the <a href="/tools/stat-designer/" target="_blank" style="color:var(--ui-gold)">Stat Designer</a> in 16:9 and drop them here. Empty “before game” slots get an auto title card. The padding card fills the video up to the target length so the runtime doesn't give away how many games there were.</p>
    <div class="slots">${slot('intro', 'Intro (e.g. VS card)', c.intro)}${per}${slot('outro', 'Outro', c.outro)}${slot('padding', 'Padding (default: auto)', c.padding)}</div>
  </div>`;
}

function renderSection(p, long, target) {
  const s = p.settings;
  let summary = '';
  if (long?.error) summary = `<p class="err">${esc(long.error)}</p>`;
  else if (long) {
    const over = long.total > long.target;
    summary = `<p>Highlights + cards: <b>${hms(long.total)}</b> of <b>${hms(long.target)}</b> — ${over ? `<span class="err">${hms(long.total - long.target)} over; untick some clips or raise the target</span>` : `${hms(long.padding)} of padding card at the end`}</p>`;
  }
  const shorts = p.games.reduce((n, g) => n + (g.moments || []).filter((m) => m.short).length, 0);
  return `<div class="card">
    <h2>Render</h2>
    <div class="row">
      <label>YouTube length <input type="text" id="target" value="${esc(hms(target))}" style="width:80px"></label>
      <label title="Used to split the length between games when picking clips">Series <select id="bestOf">${[1, 2, 3, 5].map((n) => `<option value="${n}" ${(s.bestOf || 3) === n ? 'selected' : ''}>Bo${n}</option>`).join('')}</select></label>
      <label>Shorts framing <select id="shortFrame">
        ${['tight', 'zoom', 'full'].map((f) => `<option value="${f}" ${s.shortFrame === f ? 'selected' : ''}>${{ tight: 'Tight (square, biggest)', zoom: 'Zoom (crops the side HUD)', full: 'Full frame (smallest)' }[f]}</option>`).join('')}
      </select></label>
    </div>
    <div style="margin-top:8px">${summary}</div>
    <div class="row" style="margin-top:8px">
      <button class="btn primary" id="renderLong">Render YouTube video</button>
      <button class="btn primary" id="renderShorts" ${shorts ? '' : 'disabled'}>Render ${shorts} Short${shorts === 1 ? '' : 's'}</button>
      <button class="btn" id="previewOverlay" ${shorts ? '' : 'disabled'}>Preview a Short overlay</button>
      <button class="btn" id="openOut">Open output folder</button>
    </div>
    <div id="renderJob" style="margin-top:8px"></div>
    <div id="outputs" class="outputs stack" style="margin-top:10px"></div>
  </div>`;
}

// --- events -------------------------------------------------------------------

function bind() {
  const p = cur.project;
  $('#title').addEventListener('change', (e) => { p.title = e.target.value; save().then(loadState); });
  $('#addGame').addEventListener('click', () => { p.games.push({ matchId: '', source: p.games.at(-1)?.source || '' }); save(); });
  $('#closePlayer').addEventListener('click', () => { $('#video').pause(); $('#player').classList.remove('on'); });

  document.querySelectorAll('[data-game]').forEach((card) => {
    const gi = +card.dataset.game;
    const g = p.games[gi];
    card.addEventListener('change', async (e) => {
      const f = e.target.dataset.field, mf = e.target.dataset.mf;
      if (f) { g[f] = e.target.value.trim(); await save(); if (f === 'matchId' && g.matchId) loadGame(gi, card); }
      if (mf) { const m = g.moments.find((x) => x.id === e.target.closest('[data-m]').dataset.m); m[mf] = e.target.checked; save(); }
    });
    card.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.dataset.act === 'load') loadGame(gi, card);
      if (t.dataset.act === 'repick' && confirm('Untick everything and let it pick again?')) { delete g.moments; await save(); loadGame(gi, card); }
      if (t.dataset.act === 'removeGame' && confirm(`Remove game ${gi + 1}?`)) { p.games.splice(gi, 1); p.cards.games?.splice(gi, 1); save(); }
      if (t.dataset.act === 'record') recordGame(gi, card);
      if (t.dataset.adj) {
        const m = g.moments.find((x) => x.id === t.closest('[data-m]').dataset.m);
        if (t.dataset.adj === 'reset') { m.startAdj = 0; m.endAdj = 0; } else m[t.dataset.adj] = (m[t.dataset.adj] || 0) + +t.dataset.d;
        await save();
      }
      if (t.dataset.play) play(gi, t.dataset.play);
    });
  });

  // Card slots: drop or choose a PNG.
  document.querySelectorAll('[data-slot]').forEach((el) => {
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) setCard(el.dataset.slot, f); });
  });
  document.querySelectorAll('[data-file]').forEach((inp) => inp.addEventListener('change', () => inp.files[0] && setCard(inp.dataset.file, inp.files[0])));
  document.querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', () => { setPath(p.cards, b.dataset.clear, null); save(); }));

  $('#target').addEventListener('change', (e) => {
    const parts = e.target.value.split(':').map(Number);
    const sec = parts.reduce((s, n) => s * 60 + n, 0);
    if (sec > 60) { p.settings.targetSec = sec; save(); }
  });
  $('#shortFrame').addEventListener('change', (e) => { p.settings.shortFrame = e.target.value; save(); });
  $('#bestOf').addEventListener('change', (e) => { p.settings.bestOf = +e.target.value; save(); });
  $('#openOut').addEventListener('click', () => api('open-folder', { body: { which: 'output' } }));
  $('#renderLong').addEventListener('click', () => doRender('long'));
  $('#renderShorts').addEventListener('click', () => doRender('shorts'));
  $('#previewOverlay').addEventListener('click', previewOverlay);
  showOutputs();
}

async function loadGame(gi, card) {
  const el = card.querySelector('[data-gamejob]');
  el.innerHTML = '<small>Fetching from OpenDota…</small>';
  try { cur = await api(`project/${cur.project.id}/game/${gi}/load`, { method: 'POST' }); render(); }
  catch (e) { el.innerHTML = `<span class="err">${esc(e.message)}</span>`; }
}

async function recordGame(gi, card) {
  const g = cur.project.games[gi];
  if (!g.moments) return alert('Load the match first, and tick the clips you want — only those get recorded.');
  if (!state.dota.netcon) return alert(`Dota isn't listening for console commands.\n\nIn Steam: Dota 2 → Properties → Launch options, add:\n  -netconport ${state.dota.port}\nThen start Dota and OBS (WebSocket server on) and try again. See the README.`);
  if (!confirm('Dota will play this replay and OBS will record the ticked clips. Don\'t touch Dota or OBS until it finishes. Start?')) return;
  const job = await api(`project/${cur.project.id}/game/${gi}/record`, { method: 'POST' });
  watch(job, card.querySelector('[data-gamejob]'), async (r) => {
    // Scan the new recording so it lines up like a VOD.
    const scan = await api('scan', { body: { file: r.file } });
    watch(scan, card.querySelector('[data-gamejob]'), () => openProject(cur.project.id));
  });
}

function setPath(obj, path, val) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= (/^\d+$/.test(keys[keys.indexOf(k) + 1]) ? [] : {});
  o[keys.at(-1)] = val;
}

async function upload(blob, name) {
  return (await api(`asset?name=${encodeURIComponent(name)}`, { method: 'POST', raw: blob })).name;
}

async function setCard(key, file) {
  if (file.type !== 'image/png') return alert('PNG files only (export them from the Stat Designer).');
  const name = await upload(file, `${cur.project.id}-${key.replace(/\./g, '-')}-${Date.now()}`);
  cur.project.cards ??= {};
  setPath(cur.project.cards, key, name);
  save();
}

// --- preview player -----------------------------------------------------------

function play(gi, id) {
  const g = cur.project.games[gi];
  const pl = cur.games[gi]?.plan?.find((x) => x.id === id);
  const m = g.moments.find((x) => x.id === id);
  if (!pl?.segs?.length) return;
  const v = $('#video');
  const src = `/api/video?path=${encodeURIComponent(g.source)}`;
  if (v.dataset.src !== src) { v.src = src; v.dataset.src = src; }
  $('#player').classList.add('on');
  $('#playing').textContent = `Game ${gi + 1} · ${clock(m.start)} · ${m.label}`;
  let k = 0;
  const go = () => { v.currentTime = pl.segs[k][0]; v.play().catch(() => {}); };
  v.ontimeupdate = () => {
    if (v.currentTime >= pl.segs[k][1]) { k++; if (k < pl.segs.length) go(); else { v.pause(); v.ontimeupdate = null; } }
  };
  go();
}

// --- auto cards & overlays (drawn here, uploaded as PNG) ------------------------

const logo = new Image();
logo.src = '/assets/logo.png';
const ready = () => Promise.all([document.fonts.ready, logo.decode().catch(() => {})]);

function canvas(w, h) { const c = $('#cv'); c.width = w; c.height = h; const x = c.getContext('2d'); x.clearRect(0, 0, w, h); return [c, x]; }
const blob = (c) => new Promise((r) => c.toBlob(r, 'image/png'));
function bg(x, w, h) {
  const g = x.createRadialGradient(w / 2, h * 0.45, 50, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, '#2c1e12'); g.addColorStop(1, '#0d0905');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
}
function text(x, s, X, Y, size, { font = 'Cinzel', weight = 700, color = '#eee6d6', align = 'center', max } = {}) {
  x.font = `${weight} ${size}px ${font}`; x.fillStyle = color; x.textAlign = align; x.textBaseline = 'middle';
  let sz = size;
  while (max && x.measureText(s).width > max && sz > 12) { sz -= 2; x.font = `${weight} ${sz}px ${font}`; }
  x.fillText(s, X, Y);
}
const teamsOf = (p) => { const g = p.games.find((g) => g.radiant); return g ? [g.radiant, g.dire] : ['', '']; };

async function titleCard(p, gi) {
  await ready();
  const [c, x] = canvas(1920, 1080);
  bg(x, 1920, 1080);
  x.drawImage(logo, 960 - 110, 150, 220, 220);
  const [a, b] = teamsOf(p);
  text(x, `GAME ${gi + 1}`, 960, 520, 150, { weight: 900, color: '#e6c16a' });
  text(x, a && b ? `${a}  vs  ${b}` : p.title, 960, 680, 64, { max: 1700 });
  text(x, LEAGUE.toUpperCase(), 960, 960, 34, { font: 'Rajdhani', color: '#b3a48d' });
  return blob(c);
}

async function paddingCard(p) {
  await ready();
  const [c, x] = canvas(1920, 1080);
  bg(x, 1920, 1080);
  x.drawImage(logo, 960 - 160, 170, 320, 320);
  text(x, LEAGUE.toUpperCase(), 960, 600, 110, { weight: 900, color: '#e6c16a' });
  text(x, 'Thanks for watching', 960, 720, 54);
  text(x, 'Every series video is the same length, so the runtime never spoils how many games were played.', 960, 860, 30, { font: 'Rajdhani', weight: 600, color: '#b3a48d', max: 1600 });
  text(x, SITE, 960, 960, 34, { font: 'Rajdhani', color: '#b3a48d' });
  return blob(c);
}

// Gameplay height in a 1080×1920 Short for each framing (matches FG in lib/render.mjs).
const FG_H = { tight: 1080, zoom: 884, full: 608 };
const FG_W = { tight: 1080, zoom: 1320, full: 1920 }; // source pixels kept across

// Header above the gameplay, footer below, on a 1080×1920 context.
// `top` is the small line (teams), `title` the big gold one; either can be blank.
function drawOverlay(x, { frame = 'zoom', top = '', title = '', foot = LEAGUE.toUpperCase() }) {
  const band = (1920 - FG_H[frame]) / 2;
  const grad = x.createLinearGradient(0, 0, 0, band);
  grad.addColorStop(0, 'rgba(13,9,5,.92)'); grad.addColorStop(1, 'rgba(13,9,5,.55)');
  x.fillStyle = grad; x.fillRect(0, 0, 1080, band);
  const ls = Math.min(150, band * 0.38);
  x.drawImage(logo, 540 - ls / 2, band * 0.08, ls, ls);
  if (top) text(x, top, 540, band * 0.08 + ls + band * 0.12, Math.min(52, band * 0.12), { max: 980 });
  if (title) text(x, title.toUpperCase(), 540, band * 0.08 + ls + band * (top ? 0.3 : 0.2), Math.min(70, band * 0.15), { weight: 900, color: '#e6c16a', max: 1000 });
  x.fillStyle = '#e6c16a'; x.fillRect(0, band - 4, 1080, 4);
  x.fillRect(0, 1920 - band, 1080, 4);
  const bot = x.createLinearGradient(0, 1920 - band, 0, 1920);
  bot.addColorStop(0, 'rgba(13,9,5,.55)'); bot.addColorStop(1, 'rgba(13,9,5,.92)');
  x.fillStyle = bot; x.fillRect(0, 1920 - band + 4, 1080, band - 4);
  if (foot) text(x, foot, 540, 1920 - band * 0.62, Math.min(46, band * 0.11), { color: '#eee6d6', max: 1000 });
  text(x, SITE, 540, 1920 - band * 0.38, Math.min(36, band * 0.08), { font: 'Rajdhani', weight: 600, color: '#b3a48d' });
}

async function shortOverlay(p, gi, m) {
  await ready();
  const [c, x] = canvas(1080, 1920);
  const g = p.games[gi];
  drawOverlay(x, { frame: p.settings.shortFrame || 'zoom', top: `${g.radiant}  vs  ${g.dire}`, title: m.label.split(' · ')[0], foot: `${LEAGUE.toUpperCase()} · GAME ${gi + 1}` });
  return blob(c);
}

async function prepareAutoCards(kind) {
  const p = cur.project;
  p.cards ??= {}; p.cards.auto ??= {};
  const id = p.id;
  if (kind === 'long') {
    for (const gi of p.games.keys()) if (!p.cards.games?.[gi]?.before) p.cards.auto[`game${gi + 1}`] = await upload(await titleCard(p, gi), `${id}-auto-game${gi + 1}`);
    if (!p.cards.padding) p.cards.auto.padding = await upload(await paddingCard(p), `${id}-auto-padding`);
  } else {
    for (const [gi, g] of p.games.entries()) for (const m of (g.moments || []).filter((m) => m.short)) {
      p.cards.auto[`short-g${gi + 1}-${m.id}`] = await upload(await shortOverlay(p, gi, m), `${id}-short-g${gi + 1}-${m.id}`);
    }
  }
  await save();
}

async function previewOverlay() {
  const p = cur.project;
  const gi = p.games.findIndex((g) => (g.moments || []).some((m) => m.short));
  const m = p.games[gi].moments.find((m) => m.short);
  const b = await shortOverlay(p, gi, m);
  window.open(URL.createObjectURL(b), '_blank');
}

async function doRender(kind) {
  const el = $('#renderJob');
  try {
    el.innerHTML = '<small>Drawing cards…</small>';
    await prepareAutoCards(kind);
    const job = await api(`project/${cur.project.id}/render`, { body: { kind } });
    watch(job, $('#renderJob'), (r) => {
      $('#renderJob').innerHTML = `<p>Done: ${kind === 'long' ? `${esc(r.file.split(/[\\/]/).pop())} (${hms(r.length)})` : `${r.files.length} Shorts`}</p>`;
      showOutputs();
    });
  } catch (e) { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

async function showOutputs() {
  const files = await api(`outputs?project=${encodeURIComponent(cur.project.id)}`).catch(() => []);
  $('#outputs').innerHTML = files.length ? '<h3>Rendered</h3>' + files.map((f) => `<div class="row" style="justify-content:space-between"><a href="/api/video?path=${encodeURIComponent(f.path)}" target="_blank">${esc(f.name)}</a><small>${gb(f.size)}</small></div>`).join('') : '';
}

// --- single video → Short ---------------------------------------------------------
// For submitted Twitch clips: no match data, just framing, trim and header text.
// The preview draws the same geometry ffmpeg uses (lib/render.mjs), live.

let clipLoop = 0;
const clipKey = (path) => `hc-clip:${path.split(/[\\/]/).pop()}`;
function clipSettings(path) {
  try { return { frame: 'zoom', pan: 0, top: '', title: '', foot: LEAGUE.toUpperCase(), start: 0, end: null, ...JSON.parse(localStorage.getItem(clipKey(path)) || '{}') }; }
  catch { return { frame: 'zoom', pan: 0, top: '', title: '', foot: LEAGUE.toUpperCase(), start: 0, end: null }; }
}

async function openClip(path) {
  cur = null;
  cancelAnimationFrame(clipLoop);
  document.querySelectorAll('#projects .list-item').forEach((el) => el.classList.remove('on'));
  const s = clipSettings(path);
  const name = path.split(/[\\/]/).pop();
  $('#main').innerHTML = `
    <h1 style="font-size:20px;margin-bottom:4px">Make a Short</h1>
    <p class="muted" style="margin-bottom:14px">${esc(name)}</p>
    <div class="clip-grid">
      <div>
        <canvas id="clipPreview" width="540" height="960"></canvas>
        <p class="note" style="text-align:center">Live preview</p>
      </div>
      <div class="stack">
        <div class="card">
          <h2>Framing</h2>
          <div class="row" id="frameBtns">
            ${['tight', 'zoom', 'full'].map((f) => `<button class="btn ${s.frame === f ? 'primary' : ''}" data-frame="${f}">${{ tight: 'Tight', zoom: 'Zoom', full: 'Full frame' }[f]}</button>`).join('')}
          </div>
          <label class="row" style="margin-top:10px">Left / right <input type="range" id="pan" min="-100" max="100" value="${Math.round(s.pan * 100)}" style="flex:1"> <button class="btn small" id="panReset">Centre</button></label>
          <p class="note">Tight and Zoom crop the sides. Slide it if the action is off-centre.</p>
        </div>
        <div class="card">
          <h2>Text</h2>
          <div class="stack">
            <label class="stack-label">Small line <input type="text" id="tTop" value="${esc(s.top)}" placeholder="e.g. Slob Team vs N-stitution"></label>
            <label class="stack-label">Big line <input type="text" id="tTitle" value="${esc(s.title)}" placeholder="e.g. Clutch Chrono"></label>
            <label class="stack-label">Footer <input type="text" id="tFoot" value="${esc(s.foot)}" placeholder="SECRETLEAGUE"></label>
          </div>
        </div>
        <div class="card">
          <h2>Trim</h2>
          <video id="clipVideo" src="/api/video?path=${encodeURIComponent(path)}" controls preload="auto" style="width:100%;border-radius:4px;background:#000"></video>
          <div class="row" style="margin-top:8px">
            <label>Start <input type="number" id="tStart" step="0.1" min="0" value="${s.start || 0}" style="width:80px"></label><button class="btn small" id="setStart">= playhead</button>
            <label>End <input type="number" id="tEnd" step="0.1" min="0" value="${s.end ?? ''}" style="width:80px" placeholder="end"></label><button class="btn small" id="setEnd">= playhead</button>
          </div>
          <p class="note" id="clipLen"></p>
        </div>
        <div class="row">
          <button class="btn primary" id="exportShort">Export Short</button>
          <button class="btn" id="openOutClip">Open output folder</button>
        </div>
        <div id="shortJob"></div>
        <div id="clipOutputs" class="outputs stack"></div>
      </div>
    </div>`;

  const v = $('#clipVideo');
  const pc = $('#clipPreview'), px = pc.getContext('2d');
  const ov = document.createElement('canvas'); ov.width = 1080; ov.height = 1920;
  const persist = () => { try { localStorage.setItem(clipKey(path), JSON.stringify(s)); } catch {} };
  const redrawOverlay = async () => { await ready(); const x = ov.getContext('2d'); x.clearRect(0, 0, 1080, 1920); drawOverlay(x, s); };
  const showLen = () => {
    const end = s.end ?? v.duration;
    const len = (end || 0) - (s.start || 0);
    $('#clipLen').innerHTML = isFinite(len) ? `Length ${len.toFixed(1)}s${len > 60 ? ' — <span class="err">over a minute; YouTube Shorts allows up to 3 min, TikTok/Reels are fine</span>' : ''}` : '';
  };
  await redrawOverlay();

  // Same maths as the ffmpeg graph, at half size.
  const draw = () => {
    const W = 540, H = 960;
    px.fillStyle = '#000'; px.fillRect(0, 0, W, H);
    if (v.readyState >= 2) {
      const vw = v.videoWidth, vh = v.videoHeight;
      const bw = H * vw / vh;
      px.filter = 'blur(10px) brightness(.82) saturate(1.2)';
      px.drawImage(v, (W - bw) / 2, 0, bw, H);
      px.filter = 'none';
      const cw = FG_W[s.frame] * vw / 1920;
      const sx = (vw - cw) / 2 * (1 + s.pan);
      const dh = FG_H[s.frame] / 2;
      px.drawImage(v, sx, 0, cw, vh, 0, (H - dh) / 2, W, dh);
    }
    px.drawImage(ov, 0, 0, W, H);
    // Stay inside the trim while previewing.
    if (!v.paused && s.end && v.currentTime >= s.end) v.currentTime = s.start || 0;
    clipLoop = requestAnimationFrame(draw);
  };
  draw();
  v.addEventListener('loadedmetadata', () => { if (s.start) v.currentTime = s.start; showLen(); });

  $('#frameBtns').addEventListener('click', async (e) => {
    const f = e.target.dataset.frame; if (!f) return;
    s.frame = f; persist(); await redrawOverlay();
    document.querySelectorAll('#frameBtns .btn').forEach((b) => b.classList.toggle('primary', b.dataset.frame === f));
    $('#pan').disabled = f === 'full';
  });
  $('#pan').disabled = s.frame === 'full';
  $('#pan').addEventListener('input', (e) => { s.pan = +e.target.value / 100; persist(); });
  $('#panReset').addEventListener('click', () => { s.pan = 0; $('#pan').value = 0; persist(); });
  for (const [id, key] of [['#tTop', 'top'], ['#tTitle', 'title'], ['#tFoot', 'foot']]) {
    $(id).addEventListener('input', (e) => { s[key] = e.target.value; persist(); redrawOverlay(); });
  }
  const setTrim = () => {
    s.start = Math.max(0, +$('#tStart').value || 0);
    s.end = $('#tEnd').value === '' ? null : +$('#tEnd').value;
    persist(); showLen();
  };
  $('#tStart').addEventListener('change', setTrim);
  $('#tEnd').addEventListener('change', setTrim);
  $('#setStart').addEventListener('click', () => { $('#tStart').value = v.currentTime.toFixed(1); setTrim(); });
  $('#setEnd').addEventListener('click', () => { $('#tEnd').value = v.currentTime.toFixed(1); setTrim(); });
  $('#openOutClip').addEventListener('click', () => api('open-folder', { body: { which: 'output' } }));

  const showClipOutputs = async () => {
    const files = await api('outputs?project=clips').catch(() => []);
    $('#clipOutputs').innerHTML = files.length ? '<h3>Exported Shorts</h3>' + files.map((f) => `<div class="row" style="justify-content:space-between"><a href="/api/video?path=${encodeURIComponent(f.path)}" target="_blank">${esc(f.name)}</a><small>${gb(f.size)}</small></div>`).join('') : '';
  };
  showClipOutputs();

  $('#exportShort').addEventListener('click', async () => {
    const el = $('#shortJob');
    try {
      el.innerHTML = '<small>Drawing overlay…</small>';
      const [c, x] = canvas(1080, 1920);
      await ready(); drawOverlay(x, s);
      const overlay = await upload(await blob(c), `clip-${name.replace(/\.[^.]+$/, '')}-overlay`);
      const job = await api('short', { body: { file: path, start: s.start || 0, end: s.end, frame: s.frame, pan: s.frame === 'full' ? 0 : s.pan, overlay, title: s.title } });
      watch(job, el, (r) => { el.innerHTML = `<p>Done: ${esc(r.file.split(/[\\/]/).pop())} (${r.length.toFixed(1)}s)</p>`; showClipOutputs(); });
    } catch (e) { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  });
}

loadState().then(() => {
  const last = new URLSearchParams(location.search).get('p');
  if (last) openProject(last);
});
