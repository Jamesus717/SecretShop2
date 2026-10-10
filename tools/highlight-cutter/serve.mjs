// Local server for the highlight cutter. launch.bat runs this; you can also run
//   node tools/highlight-cutter/serve.mjs [port]
//
// Serves the repo root (so the page can use the site's logo and crests) plus a
// small JSON API under /api/ that does the heavy lifting with ffmpeg / yt-dlp.
// Big files (VODs, renders) live in D:\Videos\SecretShop — see lib/util.mjs.
//
// Needs Node 18+, ffmpeg + ffprobe on PATH, and yt-dlp for Twitch downloads.

import http from 'node:http';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, readdir, mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { join, normalize, extname, sep, basename, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { HERE, DATA, MEDIA, OUT, ASSETS, PROJECTS, POSTING, MUSIC, YTDLP, run, probe, readJSON, writeJSON, startJob, getJob, listJobs, probeEncoder, enc } from './lib/util.mjs';
import { cutSegment, thumbnail, posterFrames, concat, cleanup } from './lib/render.mjs';
import { getScan, scanSource, summarize, loadGame, locate, planGame, planLong, renderLong, renderShorts } from './lib/pipeline.mjs';
import { fmtClock } from './lib/moments.mjs';
import { netconStatus } from './lib/replay.mjs';
import { recordReplayClips } from './lib/replay.mjs';
import { channels as bufferChannels, posts as bufferPosts, deletePost as bufferDelete, publish, music, IMAGE_EXT, VIDEO_EXT as POST_VIDEO_EXT, AUDIO_EXT } from './lib/social.mjs';

const ROOT = normalize(join(HERE, '..', '..'));
const PORT = +(process.argv[2] || process.env.PORT || 8735);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.mov': 'video/quicktime', '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
};
const VIDEO_EXT = /\.(mp4|mkv|mov|webm|ts|flv)$/i;

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const body = (req, limit = 30e6) => new Promise((ok, bad) => {
  const chunks = []; let n = 0;
  req.on('data', (d) => { n += d.length; if (n > limit) { bad(new Error('too big')); req.destroy(); } else chunks.push(d); });
  req.on('end', () => ok(Buffer.concat(chunks)));
  req.on('error', bad);
});
const json = async (req) => { const b = await body(req); return b.length ? JSON.parse(b.toString()) : {}; };
const inside = (dir, p) => { const r = resolve(p); return r.toLowerCase().startsWith(resolve(dir).toLowerCase() + sep); };

// --- projects ------------------------------------------------------------------

const projFile = (id) => {
  if (!/^[a-z0-9-]{1,80}$/.test(id)) throw Object.assign(new Error('bad project id'), { status: 400 });
  return join(PROJECTS, `${id}.json`);
};
async function listProjects() {
  await mkdir(PROJECTS, { recursive: true });
  const out = [];
  for (const f of await readdir(PROJECTS)) if (f.endsWith('.json')) {
    const p = await readJSON(join(PROJECTS, f), null);
    if (p) out.push({ id: p.id, title: p.title, games: p.games.length, updatedAt: p.updatedAt });
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
const loadProject = async (id) => {
  const p = await readJSON(projFile(id), null);
  if (!p) throw Object.assign(new Error('no such project'), { status: 404 });
  return p;
};
const saveProject = async (p) => { p.updatedAt = new Date().toISOString(); await writeJSON(projFile(p.id), p); return p; };

// Everything the page needs to draw a project: the saved file plus sync status
// and VOD timings for each moment.
async function hydrate(p) {
  const games = [];
  for (const g of p.games) {
    const loc = await locate(g).catch(() => null);
    const plan = loc?.detected ? await planGame(g).catch(() => null) : null;
    games.push({
      sync: loc ? (loc.detected ? { vodStart: loc.detected.vodStart, vodEnd: loc.detected.vodEnd, offset: loc.detected.runs[0].offset, pauses: loc.detected.runs.length - 1 } : { error: 'No game in this video has a matching length' }) : null,
      scanned: !!(g.source && await getScan(g.source).catch(() => null)),
      plan,
    });
  }
  const long = await planLong(p).catch((e) => ({ error: e.message }));
  return { project: p, games, long: long.error ? long : { total: long.total, target: long.target, padding: long.padding, pieces: long.parts.length } };
}

// --- sources --------------------------------------------------------------------

async function listMedia() {
  await mkdir(MEDIA, { recursive: true });
  const out = [];
  for (const f of await readdir(MEDIA)) {
    if (!VIDEO_EXT.test(f)) continue;
    const s = await stat(join(MEDIA, f));
    const path = join(MEDIA, f);
    out.push({ path, name: f, size: s.size, scanned: !!(await getScan(path).catch(() => null)), downloaded: true });
  }
  return out;
}

// Links being downloaded right now. Two downloads of the same VOD write the same
// fragment files and break each other, so a second press of Download is refused.
const downloading = new Set();

function download(url, update) {
  return new Promise((ok, bad) => {
    // Twitch: 1080p60 when there is one. Names are stable (site-id), so downloading
    // the same VOD again after a failure resumes rather than starting over.
    const tpl = join(MEDIA, '%(extractor_key)s-%(id)s.%(ext)s');
    // --print makes yt-dlp quiet, which also hides its progress, so ask for it back
    // in a fixed format. It can arrive on either stream.
    const args = ['-f', 'bv*[height<=1080]+ba/b[height<=1080]/b', '-N', '8', '--newline', '--merge-output-format', 'mp4',
      '--progress', '--progress-template', 'download:HCPROG %(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
      '--print', 'after_move:filepath', '-o', tpl, url];
    const p = spawn(YTDLP, args, { windowsHide: true });
    let file = '', err = '';
    update(0, 'Starting… (Twitch can take a minute to begin)');
    const onLine = (l) => {
      const m = /HCPROG\s*([\d.]+)%\|\s*([^|]*)\|\s*(\S+)/.exec(l);
      if (m) update(+m[1] / 100, `Downloading ${m[1]}%${/\d/.test(m[2]) ? ` at ${m[2].trim()}` : ''}${/\d/.test(m[3]) ? `, ${m[3]} left` : ''}`);
      else if (/^[A-Z]:\\/.test(l.trim())) file = l.trim();
    };
    // Chunks don't end on line breaks, so keep the unfinished tail for the next one.
    const lines = (stream, also) => {
      let rest = '';
      stream.on('data', (d) => {
        const parts = (rest + d).split(/\r?\n|\r/);
        rest = parts.pop();
        parts.forEach((l) => { onLine(l); also?.(l); });
      });
      stream.on('end', () => rest && onLine(rest));
    };
    lines(p.stdout);
    lines(p.stderr, (l) => { if (!l.includes('HCPROG')) err = `${err}${l}\n`.slice(-1500); });
    p.on('error', (e) => bad(new Error(`Couldn't start yt-dlp (${e.message}). Install it with: winget install yt-dlp.yt-dlp`)));
    p.on('close', (c) => (c ? bad(new Error(`yt-dlp failed: ${err.slice(-400)}`)) : ok({ file })));
  });
}

// Range-capable file streaming, for <video> previews of 5 GB VODs.
async function streamFile(req, res, file) {
  const s = await stat(file);
  const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (range) {
    const start = range[1] ? +range[1] : s.size - +range[2];
    const end = range[1] && range[2] ? +range[2] : s.size - 1;
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${s.size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'content-type': type, 'content-length': s.size, 'accept-ranges': 'bytes' });
    createReadStream(file).pipe(res);
  }
}

// Only files the app knows about can be streamed or deleted.
async function knownSource(p) {
  if (inside(MEDIA, p) || inside(OUT, p) || inside(POSTING, p) || inside(MUSIC, p)) return true;
  for (const pr of await listProjects()) {
    const full = await loadProject(pr.id);
    if (full.games.some((g) => g.source && resolve(g.source) === resolve(p))) return true;
  }
  return false;
}

// Output name for a submitted clip: <video name>[-<title>], so a Short and its
// thumbnail sort next to each other.
const clipName = (file, title) => {
  const slug = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  return [basename(file).replace(/\.[^.]+$/, ''), title && slug(title)].filter(Boolean).join('-');
};

// --- posting -------------------------------------------------------------------

// Shorts rendered here open on their thumbnail; older ones (and clips exported
// before their thumbnail) fade in from black, which makes a black cover. Frame 0
// brighter than video black means it's the thumbnail. Remembered per file version.
const firstFrame = new Map();
async function startsOnThumb(file, st) {
  const id = `${file}|${st.size}|${st.mtimeMs}`;
  if (!firstFrame.has(id)) {
    const r = await run('ffmpeg', ['-hide_banner', '-i', file, '-frames:v', '1', '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-an', '-f', 'null', '-'], { quiet: true }).catch(() => null);
    const y = /YAVG=([\d.]+)/.exec(r?.err || '');
    firstFrame.set(id, y ? +y[1] > 20 : null);
  }
  return firstFrame.get(id);
}

// Everything that can be posted: files dragged into the Post tab, plus rendered
// Shorts and clips (with their thumbnail, when there is one).
async function postable() {
  const out = [];
  const walk = async (d, from) => { for (const f of await readdir(d, { withFileTypes: true }).catch(() => [])) {
    const full = join(d, f.name);
    if (f.isDirectory()) { if (!f.name.startsWith('_')) await walk(full, from); continue; }
    const image = IMAGE_EXT.test(f.name), video = POST_VIDEO_EXT.test(f.name);
    // In output, JPGs are Short thumbnails: shown on their video, not offered on their own.
    if (!video && !(image && from === 'upload')) continue;
    if (from === 'render' && /-youtube\.mp4$/i.test(f.name)) continue; // 16:9 series videos aren't for Shorts
    const st = await stat(full);
    const jpg = full.replace(/(-short)?\.mp4$/i, (m, s) => (s ? '-thumb.jpg' : '.jpg'));
    const thumb = video && (await stat(jpg).catch(() => null)) ? jpg : null;
    out.push({ path: full, name: f.name, from, kind: image ? 'image' : 'video', size: st.size, mtime: st.mtimeMs, thumb, startsOnThumb: video ? await startsOnThumb(full, st) : null });
  } };
  await walk(POSTING, 'upload');
  await walk(OUT, 'render');
  return out.sort((a, b) => b.mtime - a.mtime);
}

// --- routes ---------------------------------------------------------------------

async function api(req, res, url) {
  const path = url.pathname.slice(5);
  const m = (re) => re.exec(path);
  let r;

  if (path === 'state') {
    return send(res, 200, { data: DATA, encoder: enc.video[1], projects: await listProjects(), media: await listMedia(), jobs: listJobs(), dota: await netconStatus() });
  }
  if (path === 'project' && req.method === 'POST') {
    const { title } = await json(req);
    const id = (String(title || 'series').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'series') + '-' + Date.now().toString(36);
    const p = { id, title: title || 'New series', games: [], cards: { games: [], auto: {} }, settings: { targetSec: 1800, bestOf: 3, shortFrame: 'zoom', shortMax: 59 }, createdAt: new Date().toISOString() };
    return send(res, 200, await saveProject(p));
  }
  if ((r = m(/^project\/([a-z0-9-]+)$/))) {
    if (req.method === 'GET') return send(res, 200, await hydrate(await loadProject(r[1])));
    if (req.method === 'PUT') {
      const incoming = await json(req);
      const p = await loadProject(r[1]);
      Object.assign(p, { title: incoming.title, games: incoming.games, cards: incoming.cards, settings: incoming.settings });
      await saveProject(p);
      return send(res, 200, await hydrate(p));
    }
  }
  // Fetch OpenDota data for one game and (re)build its moments.
  if ((r = m(/^project\/([a-z0-9-]+)\/game\/(\d+)\/load$/)) && req.method === 'POST') {
    const p = await loadProject(r[1]);
    const g = p.games[+r[2]];
    if (!g) return send(res, 404, { error: 'no such game' });
    // Budget per game assumes the series goes the distance (Bo3 → a third each).
    try { await loadGame(g, (p.settings.targetSec || 1800) / (p.settings.bestOf || 3) - 30); }
    catch (e) { return send(res, e.code === 'UNPARSED' ? 202 : 502, { error: e.message }); }
    await saveProject(p);
    return send(res, 200, await hydrate(p));
  }
  if (path === 'scan' && req.method === 'POST') {
    const { file } = await json(req);
    if (!(await knownSource(file)) && !VIDEO_EXT.test(file)) return send(res, 400, { error: 'not a video' });
    return send(res, 200, startJob('scan', (u) => scanSource(file, u)));
  }
  if (path === 'scan' && req.method === 'GET') {
    return send(res, 200, summarize(await getScan(url.searchParams.get('file'))) || null);
  }
  if (path === 'download' && req.method === 'POST') {
    const { url: u } = await json(req);
    if (!/^https?:\/\//.test(u || '')) return send(res, 400, { error: 'Paste a full https:// link' });
    await mkdir(MEDIA, { recursive: true });
    const key = u.trim().toLowerCase().replace(/[?#].*$/, '').replace(/\/$/, '');
    if (downloading.has(key)) return send(res, 409, { error: 'That one is already downloading. Its progress is shown under Videos' });
    downloading.add(key);
    return send(res, 200, startJob('download', (up) => download(u, up).finally(() => downloading.delete(key))));
  }
  if (path === 'media' && req.method === 'DELETE') {
    const { file } = await json(req);
    if (!inside(MEDIA, file)) return send(res, 400, { error: 'Only files the app downloaded (in the media folder) can be deleted here' });
    await unlink(file);
    return send(res, 200, { ok: true, media: await listMedia() });
  }
  if ((r = m(/^job\/(\d+)$/))) return send(res, 200, getJob(r[1]) || { status: 'missing' });
  if (path === 'video') {
    const file = url.searchParams.get('path');
    if (!file || !(await knownSource(file))) return send(res, 403, { error: 'unknown file' });
    return streamFile(req, res, file);
  }
  // Uploaded / page-drawn PNGs (cards, overlays).
  if (path === 'asset' && req.method === 'POST') {
    const name = (url.searchParams.get('name') || `card-${Date.now()}`).replace(/[^\w.-]/g, '_').replace(/\.png$/i, '') + '.png';
    const buf = await body(req);
    if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return send(res, 400, { error: 'PNG only' });
    await mkdir(ASSETS, { recursive: true });
    await writeFile(join(ASSETS, name), buf);
    return send(res, 200, { name });
  }
  if ((r = m(/^asset\/([\w.-]+\.png)$/))) {
    const f = join(ASSETS, r[1]);
    return streamFile(req, res, f).catch(() => send(res, 404, { error: 'missing' }));
  }
  if ((r = m(/^project\/([a-z0-9-]+)\/render$/)) && req.method === 'POST') {
    const { kind, only } = await json(req);
    const p = await loadProject(r[1]);
    if (kind === 'long') return send(res, 200, startJob('render-long', (u) => renderLong(p, u)));
    if (kind === 'shorts') return send(res, 200, startJob('render-shorts', (u) => renderShorts(p, u, { only })));
    return send(res, 400, { error: 'kind must be long or shorts' });
  }
  // One video straight to a Short (submitted Twitch clips): no match data, just
  // framing, an optional trim and the page-drawn header/footer.
  if (path === 'short' && req.method === 'POST') {
    const { file, start = 0, end, frame = 'zoom', pan = 0, overlay, title } = await json(req);
    if (!file || !(await knownSource(file))) return send(res, 403, { error: 'unknown file' });
    if (!['tight', 'zoom', 'full'].includes(frame)) return send(res, 400, { error: 'bad framing' });
    return send(res, 200, startJob('short', async (u) => {
      const len = (await probe(file)).duration;
      const a = Math.max(0, +start || 0), b = Math.min(len, +end || len);
      if (b - a < 1) throw new Error('The trim leaves less than a second');
      u(0.05, `Rendering ${Math.round(b - a)}s Short…`);
      const work = join(OUT, 'clips', '_work');
      await mkdir(work, { recursive: true });
      const out = join(OUT, 'clips', clipName(file, title) + '-short.mp4');
      const body = join(work, 'body.mp4');
      await cutSegment({ src: file, start: a, end: b, out: body, layout: '9x16', frame, pan, overlay: overlay ? join(ASSETS, basename(overlay)) : null });
      // If its thumbnail has been exported, it goes first so Discord previews it instead of a black frame.
      const thumb = join(OUT, 'clips', clipName(file, title) + '-thumb.jpg');
      const hasThumb = !!(await stat(thumb).catch(() => null));
      const parts = hasThumb ? [await posterFrames({ image: thumb, out: join(work, 'poster.mp4') }), body] : [body];
      await concat(parts, out, work);
      await cleanup(work);
      return { file: out, length: b - a, thumb: hasThumb };
    }));
  }
  // The matching thumbnail: the frame at `t`, same framing, big centred text.
  if (path === 'thumb' && req.method === 'POST') {
    const { file, t = 0, frame = 'zoom', pan = 0, overlay, title } = await json(req);
    if (!file || !(await knownSource(file))) return send(res, 403, { error: 'unknown file' });
    if (!overlay) return send(res, 400, { error: 'overlay missing' });
    await mkdir(join(OUT, 'clips'), { recursive: true });
    const out = join(OUT, 'clips', clipName(file, title) + '-thumb.jpg');
    await thumbnail({ src: file, t: +t || 0, out, frame, pan, overlay: join(ASSETS, basename(overlay)) });
    return send(res, 200, { file: out });
  }
  // Automated replay recording for games nobody streamed.
  if ((r = m(/^project\/([a-z0-9-]+)\/game\/(\d+)\/record$/)) && req.method === 'POST') {
    const p = await loadProject(r[1]);
    const gi = +r[2];
    return send(res, 200, startJob('record', async (u) => {
      const result = await recordReplayClips(p.games[gi], u);
      const fresh = await loadProject(p.id);
      fresh.games[gi].source = result.file;
      await saveProject(fresh);
      return result;
    }));
  }
  // Shorts banner presets (edited in the page's banner editor).
  if (path === 'banners' && req.method === 'GET') return send(res, 200, await readJSON(join(DATA, 'banners.json'), { presets: [] }));
  if (path === 'banners' && req.method === 'PUT') {
    const { presets } = await json(req);
    if (!Array.isArray(presets) || !presets.length) return send(res, 400, { error: 'keep at least one preset' });
    await writeJSON(join(DATA, 'banners.json'), { presets });
    return send(res, 200, { ok: true });
  }
  // Teams with a crest file on the site, for the team-name suggestions.
  if (path === 'team-files') {
    const files = await readdir(join(ROOT, 'assets', 'teaminfoimgs')).catch(() => []);
    return send(res, 200, files.filter((f) => /\.(png|webp|jpe?g)$/i.test(f)).map((f) => f.replace(/\.[^.]+$/, '').replace(/_/g, ' ')));
  }
  if (path === 'posting/state') {
    let buffer;
    try { buffer = await bufferChannels(); } catch (e) { buffer = { error: e.message }; }
    const st = (await readJSON(join(DATA, 'config.json'), {})).storage || {};
    return send(res, 200, { buffer, storage: !!(st.endpoint && st.bucket && st.accessKeyId && st.secretAccessKey && st.publicUrl), music: await music() });
  }
  if (path === 'posting/media' && req.method === 'GET') return send(res, 200, await postable());
  if (path === 'posting/media' && req.method === 'DELETE') {
    const { file } = await json(req);
    if (!inside(POSTING, file)) return send(res, 400, { error: 'Only files dragged into the Post tab can be deleted here' });
    await unlink(file);
    return send(res, 200, { ok: true });
  }
  // Drag-and-drop upload, streamed straight to disk (videos can be big). Music goes to the music folder.
  if (path === 'posting/upload' && req.method === 'POST') {
    const raw = basename(url.searchParams.get('name') || 'upload');
    const ext = extname(raw).toLowerCase();
    if (!IMAGE_EXT.test(ext) && !POST_VIDEO_EXT.test(ext) && !AUDIO_EXT.test(ext)) return send(res, 400, { error: 'Photos (jpg, png, webp), videos (mp4, mov) or music (mp3, m4a, wav, ogg) only' });
    const dir = AUDIO_EXT.test(ext) ? MUSIC : POSTING;
    await mkdir(dir, { recursive: true });
    const dest = join(dir, raw.replace(/[^\w.-]+/g, '_'));
    await new Promise((ok, bad) => { const w = createWriteStream(dest); req.pipe(w); w.on('finish', ok); w.on('error', bad); req.on('error', bad); });
    return send(res, 200, { path: dest, name: basename(dest) });
  }
  if (path === 'posting/publish' && req.method === 'POST') {
    const opts = await json(req);
    for (const f of opts.files || []) if (!(await knownSource(f))) return send(res, 403, { error: 'unknown file' });
    return send(res, 200, startJob('post', (u) => publish(opts, u)));
  }
  if (path === 'posting/posts' && req.method === 'GET') {
    try { return send(res, 200, await bufferPosts()); } catch (e) { return send(res, 502, { error: e.message }); }
  }
  if ((r = m(/^posting\/posts\/([\w-]+)$/)) && req.method === 'DELETE') {
    try { return send(res, 200, await bufferDelete(r[1])); } catch (e) { return send(res, 502, { error: e.message }); }
  }
  if (path === 'outputs') {
    const id = url.searchParams.get('project');
    const dir = join(OUT, id || '');
    const files = [];
    const walk = async (d) => { for (const f of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (f.isDirectory() && !f.name.startsWith('_')) await walk(join(d, f.name));
      else if (/\.(mp4|jpg)$/.test(f.name)) { const s = await stat(join(d, f.name)); files.push({ path: join(d, f.name), name: f.name, size: s.size, mtime: s.mtimeMs }); }
    } };
    await walk(dir);
    return send(res, 200, files.sort((a, b) => b.mtime - a.mtime));
  }
  if (path === 'open-folder' && req.method === 'POST') {
    const { which } = await json(req);
    const dir = { media: MEDIA, output: OUT, data: DATA }[which] || DATA;
    await mkdir(dir, { recursive: true });
    spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref();
    return send(res, 200, { ok: true });
  }
  if (path === 'frame') {
    const file = url.searchParams.get('path');
    let t = +url.searchParams.get('t') || 0;
    if (!file || !(await knownSource(file))) return send(res, 403, { error: 'unknown file' });
    // Past the end (a guessed time on a short clip): take the middle instead.
    const len = (await probe(file).catch(() => null))?.duration;
    if (len && t > len - 0.5) t = len / 2;
    const { out } = await run('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=480:-2', '-f', 'image2', '-c:v', 'mjpeg', '-'], { stdout: true });
    return send(res, 200, out, 'image/jpeg');
  }
  return send(res, 404, { error: 'unknown endpoint' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname === '/') { res.writeHead(302, { location: '/tools/highlight-cutter/' }); return res.end(); }
    let p = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!p.startsWith(ROOT)) return send(res, 403, 'no', 'text/plain');
    if ((await stat(p).catch(() => null))?.isDirectory()) p = join(p, 'index.html');
    const buf = await readFile(p).catch(() => null);
    if (!buf) return send(res, 404, 'not found', 'text/plain');
    res.writeHead(200, { 'content-type': TYPES[extname(p).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.message });
  }
});

probeEncoder().then((v) => {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n  Highlight cutter: http://localhost:${PORT}/tools/highlight-cutter/`);
    console.log(`  Data folder:      ${DATA}`);
    console.log(`  Video encoder:    ${v}${v === 'libx264' ? '  (CPU — update the NVIDIA driver to 610+ for GPU encoding)' : ''}\n`);
  });
});
