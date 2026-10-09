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
  if (cur?.project.id !== id) { $('#player')?.remove(); marking = null; }
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
  // The player survives re-renders, so saving a moment doesn't stop the video you're marking from.
  const player = $('#player') || makePlayer();
  main.innerHTML = `
    <div id="playerSlot"></div>
    <div class="row" style="justify-content:space-between;margin-bottom:14px">
      <input type="text" id="title" value="${esc(p.title)}" style="font-family:Cinzel,serif;font-size:20px;color:var(--ui-gold);flex:1;min-width:240px;background:transparent;border-color:transparent">
      <button class="btn" id="addGame">+ Add game</button>
    </div>
    ${p.games.map((g, i) => gameCard(g, i, games[i])).join('') || '<div class="card"><p class="muted">Add each game of the series with <b>+ Add game</b>, paste its match id, and pick the video it was played in.</p></div>'}
    ${cardsSection(p)}
    ${renderSection(p, long, target)}`;
  $('#playerSlot').replaceWith(player);
  bind();
  showMarks();
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
  // Custom moments are in VOD time; turn them into game time for the timeline and the time column.
  const gameT = (m, t) => (m.vod ? t - (sync?.offset ?? 0) : t);
  const when = (m) => {
    const a = m.start + (m.startAdj || 0), b = m.end + (m.endAdj || 0);
    if (!m.vod) return `${clock(a)} – ${clock(b)}`;
    if (sync?.offset == null || gameT(m, b) < 0) return `<span title="VOD ${hms(a)} – ${hms(b)}">before the horn</span>`;
    return `${clock(gameT(m, a))} – ${clock(gameT(m, b))}`;
  };
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
      ${g.moments ? '<button class="btn" data-act="repick" title="Forget your ticks and let it choose again (keeps the draft and custom moments)">Auto-pick again</button>' : ''}
      <select data-field="source" style="flex:1;min-width:200px">${sourceOptions(g.source)}</select>
      <button class="btn" data-act="record" title="Play this game's replay in Dota and record the highlights with OBS">Record replay…</button>
    </div>
    <div class="row" style="margin-top:6px">${status}<span data-gamejob></span>
      ${g.moments && sync && !sync.error ? `<span style="flex:1"></span>
        <button class="btn small" data-act="draft" title="${moments.some((m) => m.id === 'draft') ? 'Play the draft clip' : 'Add a clip of the finished draft screen'}">${moments.some((m) => m.id === 'draft') ? '▶ Draft' : '+ Draft'}</button>
        <button class="btn small" data-act="custom" title="Open the video and mark your own clip">+ Custom moment</button>` : ''}</div>
    ${moments.length ? `
      <div class="timeline">${moments.map((m) => { const a = Math.max(0, gameT(m, m.start)), b = Math.max(a, gameT(m, m.end)); return `<div class="blk ${m.long ? 'long' : ''} ${m.short ? 'short' : ''} ${m.custom ? 'custom' : ''}" data-play="${m.id}" title="${esc(m.label)}${m.custom ? '' : ` (${m.score})`}" style="left:${(a / dur) * 100}%;width:${((b - a) / dur) * 100}%"></div>`; }).join('')}${ticks.join('')}</div>
      <table class="moments">
        <tr><th title="In the YouTube video">YT</th><th title="Make a Short">Short</th><th>Game time</th><th>Moment</th><th>Score</th><th>Length</th><th>Trim start / end</th><th></th></tr>
        ${moments.map((m) => {
          const pl = plan.get(m.id);
          return `<tr class="${m.long ? 'picked' : ''}" data-m="${m.id}">
            <td><input type="checkbox" data-mf="long" ${m.long ? 'checked' : ''}></td>
            <td><input type="checkbox" data-mf="short" ${m.short ? 'checked' : ''}></td>
            <td class="num">${when(m)}</td>
            <td>${m.custom ? `<input type="text" data-mf="label" value="${esc(m.label)}" style="width:100%;min-width:160px;padding:1px 6px">` : esc(m.label)}</td>
            <td class="num">${m.custom ? `<span class="badge">${m.id === 'draft' ? 'draft' : 'custom'}</span>` : `<span class="score">${m.score}</span>`}</td>
            <td class="num">${pl ? `${Math.round(pl.len)}s` : `${Math.round(m.end - m.start)}s`}</td>
            <td class="num">
              <button class="btn small" data-adj="startAdj" data-d="-3" title="Start 3s earlier">−3</button><button class="btn small" data-adj="startAdj" data-d="3" title="Start 3s later">+3</button>
              &nbsp;
              <button class="btn small" data-adj="endAdj" data-d="-3" title="End 3s earlier">−3</button><button class="btn small" data-adj="endAdj" data-d="3" title="End 3s later">+3</button>
              ${m.startAdj || m.endAdj ? `<button class="btn small" data-adj="reset" title="Undo trims">↺</button>` : ''}
            </td>
            <td class="num"><button class="btn small" data-play="${m.id}" ${pl?.segs?.length ? '' : 'disabled'}>▶</button>${m.custom ? `<button class="btn small danger" data-act="delMoment" title="Remove this moment">✕</button>` : ''}</td>
          </tr>`;
        }).join('')}
      </table>
      <p class="note">Ticked for YouTube: ${moments.filter((m) => m.long).length} clips, ${clock(longLen)}. Clip ends stretch while the casters are still loud, unless you trim the end yourself. Draft and custom moments play exactly as marked.</p>` : ''}
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

  document.querySelectorAll('[data-game]').forEach((card) => {
    const gi = +card.dataset.game;
    const g = p.games[gi];
    card.addEventListener('change', async (e) => {
      const f = e.target.dataset.field, mf = e.target.dataset.mf;
      if (f) { g[f] = e.target.value.trim(); await save(); if (f === 'matchId' && g.matchId) loadGame(gi, card); }
      if (mf) {
        const m = g.moments.find((x) => x.id === e.target.closest('[data-m]').dataset.m);
        if (mf === 'label') { m.label = e.target.value.trim() || m.label; if (marking?.id === m.id) marking.label = m.label; } else m[mf] = e.target.checked;
        save();
      }
    });
    card.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.dataset.act === 'load') loadGame(gi, card);
      if (t.dataset.act === 'repick' && confirm('Untick everything and let it pick again? The draft and custom moments are kept.')) { g.moments = g.moments.filter((m) => m.custom); await save(); loadGame(gi, card); }
      if (t.dataset.act === 'draft') addDraft(gi);
      if (t.dataset.act === 'custom') openFree(gi);
      if (t.dataset.act === 'delMoment') {
        const id = t.closest('[data-m]').dataset.m;
        if (!confirm('Remove this moment?')) return;
        g.moments = g.moments.filter((m) => m.id !== id);
        if (marking?.gi === gi && marking.id === id) marking.id = null;
        await save();
      }
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
// Also where custom moments are marked: scrub to a spot, Mark in / Mark out, Add.
// Custom moments are stored in VOD seconds (`vod: true`) because the draft has no
// game clock to sync on; lib/pipeline.mjs plays them exactly as marked.

let marking = null; // { gi, id (custom moment being edited, or null), from (auto moment it replaces), in, out, label }

function makePlayer() {
  const el = document.createElement('div');
  el.className = 'player'; el.id = 'player';
  el.innerHTML = `<video id="video" controls preload="none"></video>
    <div class="row" style="margin-top:4px"><small id="playing" style="flex:1"></small><button class="btn small" id="closePlayer">Close</button></div>
    <div class="row" style="margin-top:6px">
      <button class="btn small" id="markIn" title="Clip starts at the playhead">Mark in</button><small id="markInT">–</small>
      <button class="btn small" id="markOut" title="Clip ends at the playhead">Mark out</button><small id="markOutT">–</small>
      <input type="text" id="markLabel" placeholder="What happens (e.g. Huge Chrono)" style="flex:1;min-width:160px">
      <button class="btn small primary" id="markSave">Add moment</button>
    </div>`;
  const v = $('video', el);
  $('#closePlayer', el).addEventListener('click', () => { v.pause(); el.classList.remove('on'); marking = null; });
  $('#markIn', el).addEventListener('click', () => { marking.in = +v.currentTime.toFixed(1); if (marking.out != null && marking.out <= marking.in) marking.out = null; showMarks(); });
  $('#markOut', el).addEventListener('click', () => { marking.out = +v.currentTime.toFixed(1); if (marking.in != null && marking.in >= marking.out) marking.in = null; showMarks(); });
  $('#markLabel', el).addEventListener('input', (e) => { marking.label = e.target.value; });
  $('#markSave', el).addEventListener('click', saveMark);
  return el;
}

function showMarks() {
  const el = $('#player');
  if (!el || !marking) return;
  $('#markInT', el).textContent = marking.in != null ? hms(marking.in) : '–';
  $('#markOutT', el).textContent = marking.out != null ? hms(marking.out) : '–';
  if (document.activeElement !== $('#markLabel', el)) $('#markLabel', el).value = marking.label || '';
  $('#markSave', el).textContent = marking.id ? 'Update moment' : marking.from ? 'Save my version' : 'Add moment';
  $('#markSave', el).title = marking.from && !marking.id ? 'Saves this as a custom moment and unticks the auto clip it came from' : '';
  $('#markSave', el).disabled = marking.in == null || marking.out == null;
}

async function saveMark() {
  const g = cur.project.games[marking.gi];
  const { in: a, out: b } = marking;
  if (b - a < 1) return alert('The clip needs to be at least a second long.');
  let m = marking.id && g.moments.find((x) => x.id === marking.id);
  if (m) Object.assign(m, { start: a, end: b, startAdj: 0, endAdj: 0, label: marking.label?.trim() || m.label });
  else {
    m = { id: `c${Date.now().toString(36)}`, custom: true, vod: true, start: a, end: b, label: marking.label?.trim() || 'Custom moment', long: true, short: false, startAdj: 0, endAdj: 0 };
    g.moments.push(m);
    // Re-marked from an auto clip: the custom one takes its place, so the footage isn't in the video twice.
    const was = marking.from && g.moments.find((x) => x.id === marking.from);
    if (was) { m.long = was.long; m.short = was.short; was.long = false; was.short = false; }
  }
  // The moment just saved stays selected, so it can be nudged and updated again.
  marking = { gi: marking.gi, id: m.id, in: a, out: b, label: m.label };
  await save();
}

function loadVideo(g) {
  const v = $('#video');
  const src = `/api/video?path=${encodeURIComponent(g.source)}`;
  if (v.dataset.src !== src) { v.src = src; v.dataset.src = src; }
  $('#player').classList.add('on');
  $('#player').scrollIntoView({ block: 'nearest' });
  return v;
}

// Open the game's video with nothing selected, ready to mark a new moment.
function openFree(gi) {
  const g = cur.project.games[gi];
  const v = loadVideo(g);
  v.ontimeupdate = null;
  const sync = cur.games[gi]?.sync;
  const same = marking?.gi === gi;
  marking = { gi, id: null, in: null, out: null, label: '' };
  $('#playing').textContent = `Game ${gi + 1} · new moment: scrub to it, then Mark in / Mark out`;
  if (!same && sync?.vodStart != null) v.currentTime = sync.vodStart;
  showMarks();
}

// The finished draft screen, all ten heroes up while the casters talk through it.
// The clock reader first sees the clock at 0:00 (vodStart), after the 90s pre-game,
// so on our broadcasts the finished draft sits ~4:00 to ~1:40 before vodStart
// (checked on both games of the first VOD). Mark in / out moves it if not.
const DRAFT = { from: 130, to: 100 };

async function addDraft(gi) {
  const g = cur.project.games[gi];
  if (!g.moments.some((m) => m.id === 'draft')) {
    const at = cur.games[gi].sync.vodStart;
    g.moments.push({ id: 'draft', custom: true, vod: true, start: Math.max(0, at - DRAFT.from), end: Math.max(1, at - DRAFT.to), label: 'Draft', long: true, short: false, startAdj: 0, endAdj: 0 });
    await save();
  }
  play(gi, 'draft');
}

function play(gi, id) {
  const g = cur.project.games[gi];
  const pl = cur.games[gi]?.plan?.find((x) => x.id === id);
  const m = g.moments.find((x) => x.id === id);
  if (!pl?.segs?.length) return;
  const v = loadVideo(g);
  $('#playing').textContent = `Game ${gi + 1} · ${m.vod ? `VOD ${hms(pl.segs[0][0])}` : clock(m.start)} · ${m.label}`;
  // A custom moment opens for editing; an auto one is a starting point for a new custom one.
  marking = { gi, id: m.custom ? m.id : null, from: m.custom ? null : m.id, in: pl.segs[0][0], out: pl.segs.at(-1)[1], label: m.custom ? m.label : m.label.split(' · ')[0] };
  showMarks();
  let k = 0;
  const go = () => { v.currentTime = pl.segs[k][0]; v.play().catch(() => {}); };
  v.ontimeupdate = () => {
    // Seeking away by hand ends the clip preview, so you can scrub around to re-mark.
    if (v.currentTime < pl.segs[k][0] - 1 || v.currentTime > pl.segs[k][1] + 2) v.ontimeupdate = null;
    else if (v.currentTime >= pl.segs[k][1]) { k++; if (k < pl.segs.length) go(); else { v.pause(); v.ontimeupdate = null; } }
  };
  go();
}

// --- auto cards & overlays (drawn here, uploaded as PNG) ------------------------

const logo = new Image();
logo.src = '/assets/logo.png';
// Fonts + logo. Capped at 1.5s: a hidden tab can leave decode() pending, which would
// otherwise stop the page from ever wiring its buttons up.
const ready = () => Promise.race([Promise.all([document.fonts.ready, logo.decode().catch(() => {})]), new Promise((r) => setTimeout(r, 1500))]);

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

// Split text into lines that fit `max` px at the current font.
function wrap(x, s, max) {
  const lines = [];
  let line = '';
  for (const w of s.split(/\s+/).filter(Boolean)) {
    const t = line ? `${line} ${w}` : w;
    if (line && x.measureText(t).width > max) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

// Thumbnail overlay: the frame darkened, the moment in huge centred text.
function drawThumbOverlay(x, { top = '', title = '', foot = LEAGUE.toUpperCase() }) {
  x.fillStyle = 'rgba(8,5,2,.45)'; x.fillRect(0, 0, 1080, 1920);
  const mid = x.createLinearGradient(0, 560, 0, 1360);
  mid.addColorStop(0, 'rgba(8,5,2,0)'); mid.addColorStop(0.5, 'rgba(8,5,2,.55)'); mid.addColorStop(1, 'rgba(8,5,2,0)');
  x.fillStyle = mid; x.fillRect(0, 560, 1080, 800);
  x.drawImage(logo, 540 - 110, 130, 220, 220);
  // Biggest size that fits in three lines.
  const t = (title || '').toUpperCase();
  let size = 190, lines = [];
  for (; size > 70; size -= 8) {
    x.font = `900 ${size}px Cinzel`;
    lines = wrap(x, t, 980);
    if (lines.length <= 3 && lines.every((l) => x.measureText(l).width <= 1000)) break;
  }
  const lh = size * 1.05;
  const y0 = 960 - ((lines.length - 1) * lh) / 2;
  if (top) text(x, top, 540, y0 - lh / 2 - 70, 56, { weight: 700, max: 980 });
  x.font = `900 ${size}px Cinzel`; // text() above changed it
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineJoin = 'round'; x.lineWidth = Math.max(8, size / 9); x.strokeStyle = 'rgba(8,5,2,.95)';
  x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 30;
  lines.forEach((l, i) => x.strokeText(l, 540, y0 + i * lh));
  x.shadowBlur = 0; x.fillStyle = '#e6c16a';
  lines.forEach((l, i) => x.fillText(l, 540, y0 + i * lh));
  if (foot) text(x, foot, 540, 1700, 50, { color: '#eee6d6', max: 980 });
  text(x, SITE, 540, 1770, 38, { font: 'Rajdhani', weight: 600, color: '#b3a48d' });
}

async function thumbOverlay(p, gi, m) {
  await ready();
  const [c, x] = canvas(1080, 1920);
  const g = p.games[gi];
  drawThumbOverlay(x, { top: `${g.radiant}  vs  ${g.dire}`, title: m.label.split(' · ')[0], foot: `${LEAGUE.toUpperCase()} · GAME ${gi + 1}` });
  return blob(c);
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
      p.cards.auto[`thumb-g${gi + 1}-${m.id}`] = await upload(await thumbOverlay(p, gi, m), `${id}-thumb-g${gi + 1}-${m.id}`);
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
  $('#outputs').innerHTML = files.length ? '<h3>Rendered</h3>' + files.map((f) => `<div class="row" style="justify-content:space-between"><a href="/api/video?path=${encodeURIComponent(f.path)}" target="_blank">${esc(f.name)}</a><span class="row"><small>${gb(f.size)}</small>${/.mp4$/i.test(f.name) && !/-youtube.mp4$/i.test(f.name) ? `<button class="btn small" data-post="${esc(f.path)}" title="Open the Post tab with this picked">Post…</button>` : ''}</span></div>`).join('') : '';
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
        <div class="row" id="viewBtns" style="justify-content:center;margin-top:8px">
          <button class="btn small primary" data-view="short">Short</button>
          <button class="btn small" data-view="thumb">Thumbnail</button>
        </div>
        <p class="note" style="text-align:center">Live preview. The thumbnail uses the frame the video is paused on.</p>
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
          <button class="btn" id="exportThumb" title="Uses the frame the video is on now; the big line is the text">Export thumbnail</button>
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
  let view = 'short';
  const redrawOverlay = async () => {
    await ready();
    const x = ov.getContext('2d'); x.clearRect(0, 0, 1080, 1920);
    if (view === 'thumb') drawThumbOverlay(x, s); else drawOverlay(x, s);
  };
  const showLen = () => {
    const end = s.end ?? v.duration;
    const len = (end || 0) - (s.start || 0);
    $('#clipLen').innerHTML = isFinite(len) ? `Length ${len.toFixed(1)}s${len > 60 ? ' — <span class="err">over a minute; YouTube Shorts allows up to 3 min, TikTok/Reels are fine</span>' : ''}` : '';
  };
  redrawOverlay();

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
    $('#clipOutputs').innerHTML = files.length ? '<h3>Exported Shorts</h3>' + files.map((f) => `<div class="row" style="justify-content:space-between"><a href="/api/video?path=${encodeURIComponent(f.path)}" target="_blank">${esc(f.name)}</a><span class="row"><small>${gb(f.size)}</small>${/.mp4$/i.test(f.name) && !/-youtube.mp4$/i.test(f.name) ? `<button class="btn small" data-post="${esc(f.path)}" title="Open the Post tab with this picked">Post…</button>` : ''}</span></div>`).join('') : '';
  };
  showClipOutputs();

  $('#viewBtns').addEventListener('click', async (e) => {
    if (!e.target.dataset.view) return;
    view = e.target.dataset.view;
    document.querySelectorAll('#viewBtns .btn').forEach((b) => b.classList.toggle('primary', b.dataset.view === view));
    if (view === 'thumb') v.pause();
    await redrawOverlay();
  });
  $('#exportThumb').addEventListener('click', async () => {
    const el = $('#shortJob');
    try {
      if (!s.title) throw new Error('Type the big line first. It is the thumbnail text.');
      el.innerHTML = '<small>Making thumbnail…</small>';
      const [c, x] = canvas(1080, 1920);
      await ready(); drawThumbOverlay(x, s);
      const overlay = await upload(await blob(c), `clip-${name.replace(/\.[^.]+$/, '')}-thumb-overlay`);
      const r = await api('thumb', { body: { file: path, t: v.currentTime, frame: s.frame, pan: s.frame === 'full' ? 0 : s.pan, overlay, title: s.title } });
      el.innerHTML = `<p>Saved ${esc(r.file.split(/[\\/]/).pop())}. Export the Short after this so it starts on the thumbnail (Discord previews the first frame).</p>`;
      showClipOutputs();
    } catch (e) { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  });

  $('#exportShort').addEventListener('click', async () => {
    const el = $('#shortJob');
    try {
      el.innerHTML = '<small>Drawing overlay…</small>';
      const [c, x] = canvas(1080, 1920);
      await ready(); drawOverlay(x, s);
      const overlay = await upload(await blob(c), `clip-${name.replace(/\.[^.]+$/, '')}-overlay`);
      const job = await api('short', { body: { file: path, start: s.start || 0, end: s.end, frame: s.frame, pan: s.frame === 'full' ? 0 : s.pan, overlay, title: s.title } });
      watch(job, el, (r) => { el.innerHTML = `<p>Done: ${esc(r.file.split(/[\\/]/).pop())} (${r.length.toFixed(1)}s)${r.thumb ? ', starting on its thumbnail' : '. No thumbnail yet, so Discord will preview it as a black frame: export one, then export the Short again'}</p>`; showClipOutputs(); });
    } catch (e) { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  });
}

// --- Post tab: TikTok / Instagram / YouTube Shorts through Buffer ------------------
// Pick what to post (dragged-in photos/videos, or rendered Shorts), write the
// caption once, tick the platforms. lib/social.mjs hosts the files and makes the
// Buffer posts; the list at the bottom is read back from Buffer.

const SERVICE = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube Shorts' };
const post = { picked: [], sound: 'app', cover: {} }; // picked: paths, in order; cover: path -> ms
const remember = (k, v) => { try { if (v === undefined) return localStorage.getItem(`hc-post:${k}`); localStorage.setItem(`hc-post:${k}`, v); } catch {} return null; };
const isImage = (p) => /\.(jpe?g|png|webp)$/i.test(p);
const mediaUrl = (p) => `/api/video?path=${encodeURIComponent(p)}`;

async function openPosting(select = []) {
  cur = null;
  cancelAnimationFrame(clipLoop);
  document.querySelectorAll('#projects .list-item').forEach((el) => el.classList.remove('on'));
  if (select.length) post.picked = select.slice();
  $('#main').innerHTML = `
    <h1 style="font-size:20px;margin-bottom:4px">Post</h1>
    <p class="muted" style="margin-bottom:14px">TikTok, Instagram and YouTube Shorts through Buffer. X is still by hand: <b>Copy caption</b> and drag the file in.</p>
    <div id="postStatus" class="card"><small>Checking Buffer…</small></div>
    <div class="post-grid">
      <div class="card">
        <h2>Media</h2>
        <label class="drop" id="drop"><input type="file" id="dropInput" multiple hidden accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,audio/*">
          Drag photos, videos or music here, or click to choose.<br><small>Music goes in the music folder, for photo posts.</small></label>
        <div id="dropJob"></div>
        <div id="library" class="library"></div>
      </div>
      <div class="card" id="compose"></div>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">Scheduled &amp; posted</h2><button class="btn small" id="refreshPosts">Refresh</button></div>
      <div id="postList" style="margin-top:10px"><small>Loading…</small></div>
    </div>`;

  const drop = $('#drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); uploadMedia([...e.dataTransfer.files]); });
  $('#dropInput').addEventListener('change', (e) => uploadMedia([...e.target.files]));
  $('#refreshPosts').addEventListener('click', showPosts);
  $('#library').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-delmedia]');
    if (del) {
      if (!confirm(`Delete ${del.dataset.delmedia.split(/[\\/]/).pop()} from disk?`)) return;
      await api('posting/media', { method: 'DELETE', body: { file: del.dataset.delmedia } });
      post.picked = post.picked.filter((p) => p !== del.dataset.delmedia);
      return showLibrary();
    }
    const tile = e.target.closest('[data-pick]');
    if (!tile) return;
    const p = tile.dataset.pick;
    if (post.picked.includes(p)) post.picked = post.picked.filter((x) => x !== p);
    // One video, or up to ten photos: picking the other kind starts over.
    else if (!isImage(p) || post.picked.some((x) => !isImage(x))) post.picked = [p];
    else post.picked = [...post.picked, p].slice(-10);
    showLibrary(); showCompose();
  });

  try { post.state = await api('posting/state'); } catch (e) { post.state = { buffer: { error: e.message } }; }
  showStatus();
  await showLibrary();
  showCompose();
  showPosts();
}

function showStatus() {
  const { buffer, storage } = post.state;
  const chans = buffer.channels || [];
  const missing = Object.keys(SERVICE).filter((s) => !chans.some((c) => c.service === s));
  $('#postStatus').innerHTML = `<div class="row">
      <span>Buffer: ${buffer.error ? `<span class="badge warn">${esc(buffer.error)}</span>` : `<span class="badge ok">${esc(buffer.organization)}</span>`}</span>
      ${chans.map((c) => `<span class="badge ${c.isDisconnected ? 'warn' : 'ok'}">${esc(SERVICE[c.service])}: ${esc(c.displayName || c.name)}${c.isDisconnected ? ' (reconnect in Buffer)' : ''}</span>`).join('')}
      ${!buffer.error && missing.length ? `<small>Not connected in Buffer: ${missing.map((s) => SERVICE[s]).join(', ')}</small>` : ''}
    </div>
    <div class="row" style="margin-top:6px">Media hosting: ${storage ? '<span class="badge ok">set up</span>' : '<span class="badge warn">not set up</span> <small>Buffer can only take files from a public link. See “Posting” in the README.</small>'}</div>`;
}

async function uploadMedia(files) {
  const el = $('#dropJob');
  for (const [i, f] of files.entries()) {
    el.innerHTML = `<small>Copying ${esc(f.name)} (${i + 1}/${files.length})…</small>`;
    try {
      const r = await api(`posting/upload?name=${encodeURIComponent(f.name)}`, { method: 'POST', raw: f });
      if (!/\.(mp3|m4a|wav|ogg)$/i.test(r.name)) post.picked = isImage(r.path) && post.picked.every(isImage) ? [...post.picked, r.path].slice(-10) : [r.path];
    } catch (e) { el.innerHTML = `<p class="err">${esc(f.name)}: ${esc(e.message)}</p>`; return; }
  }
  el.innerHTML = '';
  post.state.music = (await api('posting/state').catch(() => post.state)).music;
  await showLibrary(); showCompose();
}

async function showLibrary() {
  post.media = await api('posting/media').catch(() => []);
  const known = new Set(post.media.map((m) => m.path));
  post.picked = post.picked.filter((p) => known.has(p));
  $('#library').innerHTML = post.media.map((m) => {
    const n = post.picked.indexOf(m.path);
    const pic = m.kind === 'image' ? mediaUrl(m.path) : m.thumb ? mediaUrl(m.thumb) : null;
    return `<div class="tile ${n >= 0 ? 'on' : ''}" data-pick="${esc(m.path)}" title="${esc(m.name)}">
      ${pic ? `<img src="${pic}" alt="" loading="lazy">` : `<video src="${mediaUrl(m.path)}#t=1" preload="metadata" muted></video>`}
      ${n >= 0 ? `<b class="pick-n">${post.picked.length > 1 ? n + 1 : '✓'}</b>` : ''}
      <span class="tile-name">${m.kind === 'video' ? '▶ ' : ''}${esc(m.name)}</span>
      ${m.from === 'upload' ? `<button class="btn small danger tile-del" data-delmedia="${esc(m.path)}" title="Delete from disk">✕</button>` : ''}
    </div>`;
  }).join('') || '<small>Nothing yet. Drag something in, or render some Shorts.</small>';
}

function showCompose() {
  const box = $('#compose');
  if (!box) return;
  box.innerHTML = '<div></div>';
  const el = box.firstChild;
  const picked = post.picked;
  const chans = (post.state.buffer.channels || []).filter((c) => !c.isDisconnected);
  const photos = picked.length && picked.every(isImage);
  const video = picked.length === 1 && !isImage(picked[0]) ? (post.media.find((m) => m.path === picked[0]) || { path: picked[0] }) : null;
  const coverText = () => { const ms = post.cover[video.path] || 0; return ms ? `${(ms / 1000).toFixed(2)}s in` : 'first frame (the thumbnail)'; };
  const saved = JSON.parse(remember('channels') || 'null');
  const on = (c) => (saved ? saved.includes(c.id) : true);
  const tracks = post.state.music || [];
  el.innerHTML = `
    <h2>Compose</h2>
    ${picked.length ? `<div class="row picked">${picked.map((p) => (isImage(p) ? `<img src="${mediaUrl(p)}" alt="">` : `<video id="pVideo" src="${mediaUrl(p)}" controls preload="metadata"></video>`)).join('')}</div>`
      + (video ? `<div class="row" style="margin-top:6px"><span class="stack-label" style="flex-direction:row">Cover:</span> <b id="pCoverT">${coverText()}</b>
          <button class="btn small" id="pCoverSet" title="Pause the video on the frame you want first">Use the frame showing</button>
          <button class="btn small" id="pCoverReset">First frame</button></div>
        ${video.startsOnThumb === false && !(post.cover[video.path] > 0) ? '<p class="note err">This one starts on black (it was exported before its thumbnail). Pick a cover frame, or export the thumbnail and then the Short again.</p>' : ''}
        <p class="note">TikTok and Instagram use this frame as the cover. Shorts made here start on their thumbnail, so <b>First frame</b> is that thumbnail. Buffer can't take a separate cover image, and YouTube picks its own (change it in the YouTube app).</p>` : '')
      : '<p class="muted">Pick a video, or up to ten photos, from the left.</p>'}
    <div class="stack" style="margin-top:10px">
      <label class="stack-label">Caption <textarea id="pCaption" rows="4" placeholder="What happened. Hashtags go below.">${esc(post.caption || '')}</textarea></label>
      <label class="stack-label">Hashtags <input type="text" id="pTags" value="${esc(remember('tags') ?? '#dota2 #secretleague #dota')}"></label>
      <label class="stack-label">Title <small>YouTube (needed) and TikTok photo posts. Blank uses the caption's first line.</small><input type="text" id="pTitle" maxlength="100" value="${esc(post.title || '')}"></label>
      <div><div class="stack-label">Post to</div>
        <div class="row" id="pChannels">${chans.map((c) => `<label class="chip"><input type="checkbox" value="${esc(c.id)}" data-service="${c.service}" ${on(c) ? 'checked' : ''}> ${esc(SERVICE[c.service])} <small>${esc(c.displayName || c.name)}</small></label>`).join('') || '<small class="err">No TikTok, Instagram or YouTube channels connected in Buffer.</small>'}</div>
      </div>
      ${photos ? `<div class="sound"><div class="stack-label">Sound <small>Buffer can't attach a sound through its API, on any platform.</small></div>
        <label><input type="radio" name="pSound" value="app" ${post.sound === 'app' ? 'checked' : ''}> <b>Pick one in the app</b>: Buffer sends a reminder to your phone at posting time, and you post it from TikTok/Instagram with a trending sound.</label>
        <input type="text" id="pSoundNote" placeholder="Sound to use (goes on the Instagram reminder), optional" value="${esc(post.soundNote || '')}" style="margin:2px 0 6px 22px;width:calc(100% - 22px)">
        <label><input type="radio" name="pSound" value="track" ${post.sound === 'track' ? 'checked' : ''} ${tracks.length ? '' : 'disabled'}> <b>Our track</b>: posts automatically as a short video with
          <select id="pTrack">${tracks.map((t) => `<option ${t === post.track ? 'selected' : ''}>${esc(t)}</option>`).join('') || '<option>no music yet: drag some in</option>'}</select>
          for <input type="number" id="pSeconds" min="3" max="60" value="${post.seconds || 10}" style="width:56px">s</label>
        <label><input type="radio" name="pSound" value="none" ${post.sound === 'none' ? 'checked' : ''}> <b>No sound</b>: posts automatically as photos.</label>
        <p class="note">YouTube only takes video, so it always gets the photos as a short video (silent unless you pick our track). Only use music you have the rights to: TikTok and Instagram mute tracks that are claimed.</p>
      </div>` : ''}
      <div><div class="stack-label">When</div>
        <div class="row">
          ${[['queue', 'Next free slot in Buffer'], ['now', 'Now'], ['at', 'At']].map(([v, l]) => `<label><input type="radio" name="pWhen" value="${v}" ${(post.when || 'queue') === v ? 'checked' : ''}> ${l}</label>`).join('')}
          <input type="datetime-local" id="pAt" value="${esc(post.at || '')}">
        </div>
      </div>
      <div class="row">
        <button class="btn primary" id="pSend" ${picked.length && chans.length && post.state.storage ? '' : 'disabled'}>Send to Buffer</button>
        <button class="btn" id="pCopy" title="For posting to X by hand">Copy caption</button>
        ${picked.length === 1 ? '<button class="btn" id="pShow">Show file</button>' : ''}
      </div>
      <div id="postJob"></div>
    </div>`;

  // Keep what's typed across re-renders of this card.
  const keep = () => {
    post.caption = $('#pCaption').value; post.title = $('#pTitle').value; post.at = $('#pAt').value;
    post.when = el.querySelector('[name=pWhen]:checked')?.value || 'queue';
    if (photos) {
      post.sound = el.querySelector('[name=pSound]:checked')?.value || 'app';
      post.soundNote = $('#pSoundNote').value; post.track = $('#pTrack').value; post.seconds = +$('#pSeconds').value || 10;
    }
    remember('tags', $('#pTags').value);
    remember('channels', JSON.stringify([...el.querySelectorAll('#pChannels input:checked')].map((i) => i.value)));
  };
  el.addEventListener('input', keep);
  el.addEventListener('change', keep);
  $('#pAt').addEventListener('focus', () => { el.querySelector('[name=pWhen][value=at]').checked = true; keep(); });
  const fullCaption = () => [$('#pCaption').value.trim(), $('#pTags').value.trim()].filter(Boolean).join('\n\n');
  $('#pCopy').addEventListener('click', async () => { await navigator.clipboard.writeText(fullCaption()); $('#pCopy').textContent = 'Copied'; setTimeout(() => { if ($('#pCopy')) $('#pCopy').textContent = 'Copy caption'; }, 1500); });
  $('#pCoverSet')?.addEventListener('click', () => { post.cover[video.path] = Math.round($('#pVideo').currentTime * 1000); showCompose(); });
  $('#pCoverReset')?.addEventListener('click', () => { post.cover[video.path] = 0; showCompose(); });
  $('#pShow')?.addEventListener('click', () => window.open(mediaUrl(picked[0]), '_blank'));
  $('#pSend').addEventListener('click', async () => {
    keep();
    const job = $('#postJob');
    const channelIds = [...el.querySelectorAll('#pChannels input:checked')].map((i) => i.value);
    try {
      if (post.when === 'at' && !(new Date(post.at) > new Date())) throw new Error('Pick a time in the future');
      if (!channelIds.length) throw new Error('Tick at least one platform');
      const yt = el.querySelector('#pChannels input[data-service=youtube]:checked');
      if (yt && !post.title.trim() && !post.caption.trim()) throw new Error('YouTube needs a title');
      const where = channelIds.map((id) => SERVICE[el.querySelector(`#pChannels input[value="${CSS.escape(id)}"]`).dataset.service]).join(', ');
      const when = post.when === 'now' ? 'right now' : post.when === 'at' ? new Date(post.at).toLocaleString() : 'in the next free Buffer slot';
      if (!confirm(`Post to ${where}, ${when}?`)) return;
      const r = await api('posting/publish', { body: {
        files: picked, caption: fullCaption(), title: post.title.trim(), channelIds,
        when: { mode: post.when, at: post.when === 'at' ? new Date(post.at).toISOString() : null },
        sound: photos ? post.sound : null, track: post.track, seconds: post.seconds, soundNote: post.soundNote, coverMs: video ? post.cover[video.path] || 0 : 0,
      } });
      watch(r, job, (res) => {
        job.innerHTML = res.results.map((x) => `<div>${x.ok ? '<span class="badge ok">sent to Buffer</span>' : '<span class="badge warn">failed</span>'} ${esc(SERVICE[x.service])} <small>${esc(x.channel)}</small>
          ${x.ok ? `<small>${x.reminder ? 'reminder: post it from the app when your phone pings' : x.dueAt ? `due ${esc(new Date(x.dueAt).toLocaleString())}` : esc(x.status)}</small>` : `<span class="err">${esc(x.error)}</span>`}</div>`).join('');
        showPosts();
      });
    } catch (e) { job.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  });
}

async function showPosts() {
  const el = $('#postList');
  if (!el) return;
  let list;
  try { list = await api('posting/posts'); } catch (e) { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  const STATUS = { scheduled: '', sending: 'ok', sent: 'ok', error: 'warn', draft: '', needs_approval: 'warn' };
  el.innerHTML = list.length ? `<table class="moments posts">${list.map((p) => {
    const a = p.assets?.[0];
    const t = p.sentAt || p.dueAt;
    return `<tr>
      <td>${a ? `<img src="${esc(a.thumbnail || a.source)}" alt="" loading="lazy">` : ''}</td>
      <td><b>${esc(SERVICE[p.channelService] || p.channelService)}</b><br><small>${t ? esc(new Date(t).toLocaleString()) : 'queued'}</small></td>
      <td class="post-text">${esc(p.text.split('\n')[0] || '(no caption)')}${p.error ? `<br><span class="err">${esc(p.error.message)}</span>` : ''}</td>
      <td><span class="badge ${STATUS[p.status] || ''}">${esc(p.status.replace('_', ' '))}</span>${p.schedulingType === 'notification' ? ' <span class="badge" title="Buffer pings your phone; you post it from the app">reminder</span>' : ''}</td>
      <td class="num">${p.externalLink ? `<a href="${esc(p.externalLink)}" target="_blank" rel="noopener">View</a>` : ''}
        ${['scheduled', 'draft', 'error', 'needs_approval'].includes(p.status) ? `<button class="btn small danger" data-unpost="${esc(p.id)}">Delete</button>` : ''}</td>
    </tr>`;
  }).join('')}</table>` : '<small>Nothing in the last two weeks.</small>';
  el.querySelectorAll('[data-unpost]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this post from Buffer? It won\'t go out.')) return;
    try { await api(`posting/posts/${b.dataset.unpost}`, { method: 'DELETE' }); showPosts(); }
    catch (e) { alert(e.message); }
  }));
}

$('#openPosting').addEventListener('click', () => openPosting());
// "Post…" next to any rendered Short opens the Post tab with it picked.
document.addEventListener('click', (e) => { const p = e.target.closest('[data-post]'); if (p) openPosting([p.dataset.post]); });

loadState().then(() => {
  const last = new URLSearchParams(location.search).get('p');
  if (last) openProject(last);
});
