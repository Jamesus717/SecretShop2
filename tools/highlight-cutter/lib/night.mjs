// The night run: series → VOD → scan → load → overlays → Shorts, and approved queue
// clips → Shorts, with no page open. One series failing never stops the next.
//
// It only ever makes files. Nothing here imports social.mjs, and guardNetwork()
// refuses Buffer, R2 and anything that isn't a plain read, so a night run can't
// post even by mistake. A person looks at night-<date>.md in the morning and
// posts from the Post tab.
//
// In the data folder:
//   night\queue.json        series to do by hand, see README
//   night\state.json        what's done, and what to try again tomorrow
//   night\night-<date>.json + .md   what this night made, and what went wrong

import { join, resolve, sep, basename } from 'node:path';
import { mkdir, readdir, rm, stat, statfs, unlink, writeFile } from 'node:fs/promises';
import { DATA, MEDIA, PROJECTS, probe, readJSON, writeJSON, probeEncoder } from './util.mjs';
import { getScan, scanSource, loadGame, gameBudget, locate, renderShorts, renderClip } from './pipeline.mjs';
import { getMatch } from './opendota.mjs';
import { whisperModel } from './captions.mjs';
import { download } from './download.mjs';
import { overlaysFor, clipOverlay } from './overlay.mjs';
import { scheduleSeries, ukDate } from './schedule.mjs';
import { approvedClips, fetchClip } from './inbox.mjs';
import { findMoment, shortCopy, clipCopy, slug } from './postcopy.mjs';

const NIGHT = join(DATA, 'night');
const STATE = join(NIGHT, 'state.json');
const MIN_FREE = 12e9;      // a VOD is 4–7 GB, plus room for its renders
const GIVE_UP_DAYS = 14;    // Valve has dropped the replay by then
const CLIP_MAX = 59;

// Reads, and the one write the cutter has always done: asking OpenDota to parse a
// replay. Everything else is refused, whatever asked for it. Global, so it covers
// every module, and on for the whole of a night run. It only sees fetch(): what
// really keeps posting out is that nothing here imports social.mjs (its R2 upload
// uses node:https). mark-posted is a separate, manual command and isn't guarded.
export function guardNetwork({ offline = false } = {}) {
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = (init.method || input.method || 'GET').toUpperCase();
    const parse = method === 'POST' && url.hostname === 'api.opendota.com' && url.pathname.startsWith('/api/request/');
    if (offline) throw new Error(`Dry run: no network (${url.hostname})`);
    if (/(^|\.)buffer\.com$|r2\.cloudflarestorage\.com$/i.test(url.hostname) || (method !== 'GET' && !parse)) {
      throw new Error(`Night run refused ${method} ${url.hostname}`);
    }
    return real(input, init);
  };
}

// The date games were played on: a 02:00 run is about the evening before.
export const nightOf = (now = new Date()) => ukDate(new Date(now.getTime() - 12 * 36e5).toISOString());

const seriesKey = (s) => s.matchIds.map(String).join('+');
const inMedia = (f) => resolve(f).startsWith(resolve(MEDIA) + sep);
const reasonOf = (e) => String(e?.message || e).split('\n')[0].slice(0, 300);

// Series for tonight: left over from before, then the hand-made queue, then the
// schedule. In that order, so a retry keeps its place and a hand edit beats the sheet.
export function mergeSeries(state, queue, scheduled) {
  const out = new Map();
  for (const [k, v] of Object.entries(state.series || {})) if (v.status === 'retry') out.set(k, v.item);
  for (const s of [...queue, ...scheduled]) {
    const ids = (s.matchIds || []).filter((x) => /^\d{6,12}$/.test(String(x)));
    if (!ids.length) continue;
    const k = seriesKey({ matchIds: ids });
    const done = state.series?.[k]?.status;
    if (done === 'done' || done === 'gave-up') continue;
    if (!out.has(k)) out.set(k, { ...s, matchIds: ids.map(String) });
    else if (s.vod && !out.get(k).vod) out.get(k).vod = s.vod;
  }
  return [...out.values()];
}

// --- projects (same files as the page) ------------------------------------------

async function projectFor(item) {
  await mkdir(PROJECTS, { recursive: true });
  const want = item.matchIds.join('+');
  for (const f of await readdir(PROJECTS)) if (f.endsWith('.json')) {
    const p = await readJSON(join(PROJECTS, f), null);
    if (p?.games?.map((g) => g.matchId).join('+') === want) return p;
  }
  const id = `${slug(item.title).slice(0, 50)}-${Date.now().toString(36)}`;
  return {
    id, title: item.title, cards: { games: [], auto: {} },
    games: item.matchIds.map((matchId) => ({ matchId, source: '' })),
    settings: { targetSec: 1800, bestOf: item.bestOf || 3, shortFrame: 'zoom', shortMax: 59, ...(item.division ? { division: item.division } : {}) },
    createdAt: new Date().toISOString(),
  };
}
const saveProject = async (p) => { p.updatedAt = new Date().toISOString(); await writeJSON(join(PROJECTS, `${p.id}.json`), p); };

// --- one series -----------------------------------------------------------------

async function shortEntry(p, file) {
  const hit = findMoment(p, basename(file));
  const info = await probe(file);
  const st = await stat(file);
  return {
    file, thumb: file.replace(/\.mp4$/, '.jpg'), seconds: +info.duration.toFixed(1), size: st.size,
    ok: info.width === 1080 && info.height === 1920 && info.duration > 2,
    ...(hit ? { moment: hit.m.label, game: hit.gi + 1, ...shortCopy(p, hit) } : {}),
    status: 'awaiting approval',
  };
}

async function needsVod(game, vod) {
  if (game.source && await stat(game.source).catch(() => null)) return game.source;
  return /^https?:\/\//.test(vod || '') ? null : (vod && await stat(vod).catch(() => null) ? vod : undefined);
}

export async function runSeries(item, ctx) {
  const { log, captions, fetched } = ctx;
  const out = { title: item.title, key: seriesKey(item), shorts: [], problems: [] };

  // Cheap check first: no point fetching a 5 GB VOD for a game OpenDota hasn't parsed.
  for (const id of item.matchIds) {
    try { await getMatch(id); }
    catch (e) {
      if (e.code === 'UNPARSED') return { ...out, status: 'retry', reason: reasonOf(e) };
      throw e;
    }
  }
  const p = await projectFor(item);
  for (const g of p.games) {
    let src = await needsVod(g, item.vod);
    if (src === undefined) return { ...out, status: 'retry', reason: `No VOD: ${item.vod ? `${item.vod} is missing` : 'add a link to one video'}` };
    if (src === null) {
      // One VOD often holds a whole night, so a link is fetched once a run.
      if (!fetched.has(item.vod)) {
        const free = await statfs(DATA).then((s) => s.bavail * s.bsize).catch(() => Infinity);
        if (free < MIN_FREE) return { ...out, status: 'retry', reason: `Only ${(free / 1e9).toFixed(1)} GB free in the data folder` };
        log(`Downloading ${item.vod}`);
        const { file } = await download(item.vod, () => {});
        if (!file) throw new Error('yt-dlp didn\'t say where it put the VOD');
        fetched.set(item.vod, file);
      }
      src = fetched.get(item.vod);
    }
    g.source = src;
  }
  await saveProject(p);
  for (const src of new Set(p.games.map((g) => g.source))) {
    if (!(await getScan(src))) { log(`Scanning ${basename(src)}`); await scanSource(src, () => {}); }
  }
  let whole = true;
  const keys = [];
  for (const [gi, g] of p.games.entries()) {
    await loadGame(g, gameBudget(p));
    if ((await locate(g))?.detected) keys.push(...g.moments.filter((m) => m.short).map((m) => `g${gi + 1}-${m.id}`));
    else { whole = false; out.problems.push(`Game ${gi + 1} (${g.matchId}) didn't sync to the video, so it has no Shorts`); }
  }
  if (captions && p.settings.captions === undefined) p.settings.captions = true;
  const missing = await overlaysFor(p, { only: keys });
  if (missing.length) out.problems.push(`No crest file for ${missing.join(', ')}`);
  await saveProject(p);

  // One at a time, so a Short that fails doesn't take the rest with it.
  for (const k of keys) {
    try {
      log(`Rendering ${k}`);
      const { files } = await renderShorts(p, () => {}, { only: [k] });
      for (const f of files) out.shorts.push(await shortEntry(p, f));
    } catch (e) { whole = false; out.problems.push(`Short ${k} failed: ${reasonOf(e)}`); }
  }

  const bad = out.shorts.filter((s) => !s.ok).length;
  if (bad) { whole = false; out.problems.push(`${bad} Short(s) came out the wrong size or length`); }
  out.project = p.id;
  out.status = !out.shorts.length ? 'failed' : whole ? 'done' : 'partial';
  if (!out.shorts.length) out.reason = out.problems[0] || 'Nothing to render';
  return out;
}

// --- queue clips ----------------------------------------------------------------

export async function runClips(state, ctx) {
  const { log, captions, deleteVods, save = async () => {} } = ctx;
  const out = [];
  const todo = (await approvedClips()).filter((c) => state.clips?.[c.id]?.status !== 'rendered');
  for (const clip of todo) {
    const entry = { clipId: clip.id, submitter: clip.submitter_name || '', source: clip.link || clip.file_path || '', ...clipCopy(clip), status: 'awaiting approval' };
    try {
      log(`Clip ${clip.id}`);
      const file = await fetchClip(clip);
      const info = await probe(file);
      // Rendering squashes everything into 16:9 first, so a portrait clip needs a person.
      if (info.height > info.width) throw new Error('Portrait video: frame it by hand in the Short editor');
      const overlay = await clipOverlay();
      const r = await renderClip({ file, end: Math.min(info.duration, CLIP_MAX), overlay, title: `queue-${clip.id}`, captions }, () => {});
      const made = await probe(r.file);
      Object.assign(entry, { file: r.file, thumb: r.thumb, seconds: +made.duration.toFixed(1), ok: made.width === 1080 && made.height === 1920 && made.duration > 1, trimmed: info.duration > CLIP_MAX });
      state.clips = { ...state.clips, [clip.id]: { status: 'rendered', file: r.file, at: new Date().toISOString() } };
      await save(); // one clip at a time, so a kill doesn't render the queue twice
      if (deleteVods && inMedia(file)) await unlink(file);
    } catch (e) {
      Object.assign(entry, { status: 'failed', ok: false, reason: reasonOf(e) });
    }
    out.push(entry);
  }
  return out;
}

// --- the morning report ---------------------------------------------------------

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function reportText(n) {
  const L = [`# Night ${n.date}`, ''];
  if (n.dryRun) L.push('**Dry run: nothing was downloaded, rendered or sent.**', '');
  L.push(`Nothing here has been posted. Check each one, then post it from the Post tab.`, '');
  const all = [...n.series.flatMap((s) => s.shorts), ...n.clips.filter((c) => c.file)];
  L.push(`${all.length} Short(s) waiting for a look. ${n.series.filter((s) => s.status === 'retry').length} series to try again, ${n.series.filter((s) => s.status === 'failed').length} failed, ${n.clips.filter((c) => c.status === 'failed').length} clip(s) failed.`, '');
  for (const s of n.series) {
    L.push(`## ${clean(s.title)}: ${s.status}${s.planned ? ` (${s.planned})` : ''}`);
    if (s.reason) L.push(`- Why: ${clean(s.reason)}`);
    for (const p of s.problems || []) L.push(`- Problem: ${clean(p)}`);
    for (const x of s.shorts || []) L.push(`- ${x.ok ? '' : '**CHECK** '}${clean(x.title || basename(x.file))} (${x.seconds}s): \`${x.file}\``);
    L.push('');
  }
  if (n.clips.length) {
    L.push('## Queue clips', '');
    for (const c of n.clips) L.push(c.file ? `- ${c.ok ? '' : '**CHECK** '}#${c.clipId} ${clean(c.title)} (${c.seconds}s${c.trimmed ? ', cut to 59s' : ''}): \`${c.file}\`` : `- #${c.clipId} failed: ${clean(c.reason)}`);
    L.push('', 'Once a clip is really posted: `node night.mjs mark-posted <id> <post url>`', '');
  }
  for (const w of n.notes) L.push(`- Note: ${clean(w)}`);
  return `${L.join('\n').trimEnd()}\n`;
}

// --- the run --------------------------------------------------------------------

async function lock() {
  const file = join(NIGHT, 'lock');
  await mkdir(NIGHT, { recursive: true });
  // 'wx' fails if the file exists, so two runs starting together can't both win.
  for (let tries = 0; ; tries++) {
    try { await writeFile(file, String(process.pid), { flag: 'wx' }); break; }
    catch (e) {
      if (e.code !== 'EEXIST' || tries > 2) throw e;
      const was = +await readJSON(file, 0);
      if (was && was !== process.pid) {
        try { process.kill(was, 0); throw Object.assign(new Error(`Another night run is going (pid ${was})`), { code: 'LOCKED' }); }
        catch (k) { if (k.code === 'LOCKED') throw k; } // that process has gone: the lock is stale
      }
      await rm(file, { force: true });
    }
  }
  return async () => { if (+await readJSON(file, 0) === process.pid) await rm(file, { force: true }); };
}

export async function runNight({ date = nightOf(), dryRun = false, schedule = true, inbox = true, deleteVods = false, log = () => {} } = {}) {
  guardNetwork({ offline: dryRun });
  const unlock = await lock();
  try {
    const state = await readJSON(STATE, { series: {}, clips: {} });
    const queue = (await readJSON(join(NIGHT, 'queue.json'), { series: [] })).series || [];
    const night = { date, dryRun, startedAt: new Date().toISOString(), series: [], clips: [], notes: [] };
    let scheduled = [];
    if (dryRun) night.notes.push('Dry run: skipped the schedule and the clip queue (they need the network)');
    else if (schedule) {
      try { scheduled = await scheduleSeries(date); }
      catch (e) { night.notes.push(`Couldn't read the schedule: ${reasonOf(e)}`); }
    }
    for (const s of scheduled.filter((x) => x.notCast)) night.notes.push(`${s.title}: not cast live, record it from the replay in the cutter`);
    const items = mergeSeries(state, queue, scheduled.filter((x) => !x.notCast));
    if (!items.length) night.notes.push('No series to do');
    if (!dryRun) { await probeEncoder(); }
    const captions = !!(await whisperModel());
    if (!captions) night.notes.push('No Whisper model, so no captions');

    const fetched = new Map(); // VOD link → file, this run
    for (const item of items) {
      const key = seriesKey(item);
      if (dryRun) {
        const local = item.vod && !/^https?:/.test(item.vod) ? await stat(item.vod).catch(() => null) : null;
        night.series.push({ title: item.title, key, status: 'planned', planned: item.vod ? (/^https?:/.test(item.vod) ? `would download ${item.vod}` : local ? `would use ${item.vod}` : `${item.vod} is missing`) : 'no VOD yet', shorts: [] });
        continue;
      }
      let r;
      try { r = await runSeries(item, { log, captions, fetched }); }
      catch (e) { r = { title: item.title, key, status: 'retry', reason: reasonOf(e), shorts: [], problems: [] }; }
      const was = state.series[key];
      const firstSeen = was?.firstSeen || new Date().toISOString();
      const tooOld = Date.now() - new Date(firstSeen).getTime() > GIVE_UP_DAYS * 864e5;
      // Nothing rendered (a game that didn't sync, a render that threw) may just be
      // tonight's luck: try again until it's too old, as with a replay not parsed yet.
      const again = r.status === 'retry' || r.status === 'failed';
      if (again && tooOld) { r.status = 'failed'; r.reason = `Gave up after ${GIVE_UP_DAYS} days: ${r.reason}`; }
      state.series[key] = { status: again && !tooOld ? 'retry' : r.status === 'failed' ? 'gave-up' : 'done', item, firstSeen, last: r.reason || '', project: r.project };
      night.series.push(r);
      await writeJSON(STATE, state); // after each one, so a crash loses nothing
    }

    // Only VODs this run fetched, in the media folder, with every series that uses them finished.
    if (deleteVods) for (const [url, file] of fetched) {
      const open = items.some((x) => x.vod === url && state.series[seriesKey(x)].status !== 'done')
        || night.series.some((x) => x.status === 'partial' && items.find((i) => seriesKey(i) === x.key)?.vod === url);
      if (!open && inMedia(file)) { await unlink(file); night.notes.push(`Deleted VOD ${basename(file)}`); }
    }

    if (inbox && !dryRun) {
      try { night.clips = await runClips(state, { log, captions, deleteVods, save: () => writeJSON(STATE, state) }); await writeJSON(STATE, state); }
      catch (e) { night.notes.push(`Couldn't read the clip queue: ${reasonOf(e)}`); }
    }

    night.finishedAt = new Date().toISOString();
    const base = join(NIGHT, `night-${date}${dryRun ? '-dry' : ''}`);
    await writeJSON(`${base}.json`, night);
    await writeFile(`${base}.md`, reportText(night));
    return { night, report: `${base}.md` };
  } finally { await unlock(); }
}
