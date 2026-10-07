// Records highlights for games nobody streamed, by playing the replay in Dota
// and recording it with OBS. EXPERIMENTAL — needs a one-off setup (README):
//   • Dota 2 launch option:  -netconport 2121   (lets us type console commands)
//   • OBS → Tools → WebSocket Server Settings: enabled, port 4455. If it has a
//     password, put it in D:\Videos\SecretShop\config.json as
//     { "obs": { "password": "…" } }  (or set OBS_PASSWORD).
//   • OBS's current scene should show the Dota window/game capture at 16:9.
//
// Seeking: Dota has no "go to game time", only demo_gototick, and ticks don't
// map cleanly to the clock (draft, pauses). So we jump, read the HUD clock out
// of an OBS screenshot (same reader as the VOD sync), correct, and repeat.
// Recording is paused between clips, so the file is just the clips back to
// back; the normal clock scan then lines it up like any VOD.

import net from 'node:net';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';
import { mkdir, stat, rename, copyFile, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DATA, MEDIA, FFMPEG, readJSON, run } from './util.mjs';
import { readClock, BOX } from './clock.mjs';
import { getMatch } from './opendota.mjs';

const exec = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TICKS = 30; // Dota replays run at 30 ticks per second

async function config() {
  const c = await readJSON(join(DATA, 'config.json'), {});
  return {
    netconPort: +(process.env.DOTA_NETCON_PORT || c.netconPort || 2121),
    obsUrl: process.env.OBS_URL || c.obs?.url || 'ws://127.0.0.1:4455',
    obsPassword: process.env.OBS_PASSWORD || c.obs?.password || '',
    dotaDir: process.env.DOTA_DIR || c.dotaDir || null,
  };
}

// --- Dota console over TCP ---------------------------------------------------

class Netcon {
  static connect(port) {
    return new Promise((ok, bad) => {
      const s = net.createConnection({ host: '127.0.0.1', port }, () => ok(new Netcon(s)));
      s.setTimeout(1500, () => { s.destroy(); bad(new Error('timeout')); });
      s.on('error', bad);
    });
  }
  constructor(s) { this.s = s; s.setTimeout(0); this.log = ''; s.on('data', (d) => { this.log = (this.log + d).slice(-20000); }); }
  send(cmd) { this.s.write(cmd + '\n'); }
  close() { this.s.end(); }
}

export async function netconStatus() {
  const { netconPort } = await config();
  try { const c = await Netcon.connect(netconPort); c.close(); return { netcon: true, port: netconPort }; }
  catch { return { netcon: false, port: netconPort }; }
}

// --- OBS websocket v5 (just the bits we need) -------------------------------

class Obs {
  static connect(url, password) {
    return new Promise((ok, bad) => {
      if (typeof WebSocket === 'undefined') return bad(new Error('Node 22+ is needed for OBS control (built-in WebSocket)'));
      const ws = new WebSocket(url);
      const obs = new Obs(ws);
      const t = setTimeout(() => bad(new Error(`OBS didn't answer at ${url} — is the WebSocket server on?`)), 5000);
      ws.onerror = () => { clearTimeout(t); bad(new Error(`Couldn't reach OBS at ${url}`)); };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.op === 0) {
          const d = { rpcVersion: 1 };
          const a = msg.d.authentication;
          if (a) {
            if (!password) { clearTimeout(t); return bad(new Error('OBS wants a password — add it to config.json (see README)')); }
            const secret = createHash('sha256').update(password + a.salt).digest('base64');
            d.authentication = createHash('sha256').update(secret + a.challenge).digest('base64');
          }
          ws.send(JSON.stringify({ op: 1, d }));
        } else if (msg.op === 2) { clearTimeout(t); ok(obs); }
        else if (msg.op === 7) {
          const p = obs.pending.get(msg.d.requestId);
          if (p) { obs.pending.delete(msg.d.requestId); msg.d.requestStatus.result ? p.ok(msg.d.responseData || {}) : p.bad(new Error(`OBS ${msg.d.requestType}: ${msg.d.requestStatus.comment || msg.d.requestStatus.code}`)); }
        }
      };
      ws.onclose = (ev) => { clearTimeout(t); if (ev.code === 4009) bad(new Error('OBS rejected the password')); };
    });
  }
  constructor(ws) { this.ws = ws; this.pending = new Map(); this.n = 0; }
  req(requestType, requestData = {}) {
    const requestId = String(++this.n);
    return new Promise((ok, bad) => {
      this.pending.set(requestId, { ok, bad });
      this.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
    });
  }
  close() { this.ws.close(); }
}

// Read the game clock off what OBS is showing right now.
async function clockNow(obs) {
  const { currentProgramSceneName: scene } = await obs.req('GetCurrentProgramScene');
  const { imageData } = await obs.req('GetSourceScreenshot', { sourceName: scene, imageFormat: 'png', imageWidth: 1920, imageHeight: 1080 });
  const png = Buffer.from(imageData.split(',')[1], 'base64');
  const tmp = join(DATA, 'cache', 'obs-shot.png');
  await mkdir(join(DATA, 'cache'), { recursive: true });
  await new Promise((ok, bad) => { const w = createWriteStream(tmp); w.on('finish', ok); w.on('error', bad); w.end(png); });
  const { out } = await run(FFMPEG, ['-v', 'error', '-i', tmp, '-vf', `crop=${BOX.w}:${BOX.h}:${BOX.x}:${BOX.y}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { stdout: true });
  return readClock(out);
}

// --- replay files ---------------------------------------------------------------

async function dotaReplayDir(cfg) {
  if (cfg.dotaDir) return join(cfg.dotaDir, 'game', 'dota', 'replays');
  const { stdout } = await exec('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath']).catch(() => ({ stdout: '' }));
  const steam = /SteamPath\s+REG_SZ\s+(.+)/.exec(stdout)?.[1]?.trim();
  if (!steam) throw new Error("Couldn't find Steam — set dotaDir in config.json");
  const vdf = await import('node:fs/promises').then((f) => f.readFile(join(steam, 'steamapps', 'libraryfolders.vdf'), 'utf8')).catch(() => '');
  const libs = [steam, ...[...vdf.matchAll(/"path"\s+"([^"]+)"/g)].map((m) => m[1].replace(/\\\\/g, '\\'))];
  for (const lib of libs) {
    const d = join(lib, 'steamapps', 'common', 'dota 2 beta');
    if (await stat(d).catch(() => null)) return join(d, 'game', 'dota', 'replays');
  }
  throw new Error("Couldn't find Dota 2 — set dotaDir in config.json");
}

async function ensureReplay(matchId, replays, update) {
  const dem = join(replays, `${matchId}.dem`);
  if (await stat(dem).catch(() => null)) return dem;
  const match = await getMatch(matchId);
  if (!match.replay_url) throw new Error('OpenDota has no replay link for this match');
  update(null, 'Downloading replay…');
  const res = await fetch(match.replay_url);
  if (!res.ok) throw new Error(`Replay download failed (${res.status}) — Valve keeps replays ~2 weeks`);
  const bz = join(MEDIA, 'replays', `${matchId}.dem.bz2`);
  await mkdir(join(MEDIA, 'replays'), { recursive: true });
  await new Promise(async (ok, bad) => {
    const w = createWriteStream(bz); w.on('finish', ok); w.on('error', bad);
    for await (const chunk of res.body) w.write(chunk);
    w.end();
  });
  update(null, 'Unpacking replay…');
  // Node has no bzip2; Python's standard library does.
  const py = `import bz2,shutil,sys\nwith bz2.open(sys.argv[1]) as a, open(sys.argv[2],'wb') as b: shutil.copyfileobj(a,b)`;
  await mkdir(replays, { recursive: true });
  await exec('python', ['-c', py, bz, dem], { maxBuffer: 1 << 20 });
  await unlink(bz).catch(() => {});
  return dem;
}

// --- the recorder ------------------------------------------------------------------

// Jump the replay to game time `target` (seconds). Leaves it paused there.
async function seek(dota, obs, target, state) {
  // First guess ~4 min of draft/pregame; after that, reuse the tick↔clock offset we learned.
  let tick = Math.max(0, state.offset != null ? target * TICKS + state.offset : (target + 240) * TICKS);
  for (let i = 0; i < 8; i++) {
    dota.send(`demo_gototick ${Math.round(tick)} 0 1`);
    await sleep(i ? 1800 : 3500);
    const c = await clockNow(obs).catch(() => null);
    if (c == null) { tick += 60 * TICKS; continue; } // still in draft/loading: go later
    const off = target - c;
    if (Math.abs(off) <= 1) { state.offset = tick - c * TICKS; return c; }
    tick += off * TICKS;
  }
  throw new Error(`Couldn't land on ${target}s — is the Dota HUD visible in OBS?`);
}

export async function recordReplayClips(game, update) {
  if (!game?.matchId || !game.moments?.length) throw new Error('Load the match first');
  const cfg = await config();
  const replays = await dotaReplayDir(cfg);
  await ensureReplay(game.matchId, replays, update);

  update(0.02, 'Connecting to Dota and OBS…');
  const dota = await Netcon.connect(cfg.netconPort).catch(() => { throw new Error(`Dota isn't listening on port ${cfg.netconPort} — start it with the launch option -netconport ${cfg.netconPort}`); });
  const obs = await Obs.connect(cfg.obsUrl, cfg.obsPassword);
  try {
    const clips = game.moments.filter((m) => m.long || m.short)
      .map((m) => ({ a: m.start + (m.startAdj || 0) - 2, b: m.end + (m.endAdj || 0) + 4, label: m.label }))
      .sort((x, y) => x.a - y.a);
    // Merge overlaps so nothing is recorded twice.
    const spans = [];
    for (const c of clips) { const l = spans[spans.length - 1]; if (l && c.a <= l.b + 3) l.b = Math.max(l.b, c.b); else spans.push({ ...c }); }

    update(0.04, 'Loading the replay in Dota…');
    dota.send(`playdemo replays/${game.matchId}`);
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { await sleep(3000); up = (await clockNow(obs).catch(() => null)) != null || i > 10; }

    const state = {};
    let recording = false;
    const total = spans.reduce((s, x) => s + x.b - x.a, 0);
    let done = 0;
    for (const [i, s] of spans.entries()) {
      update(0.05 + 0.9 * (done / total), `Clip ${i + 1}/${spans.length}: seeking to ${Math.floor(s.a / 60)}:${String(Math.max(0, Math.round(s.a) % 60)).padStart(2, '0')}`);
      await seek(dota, obs, s.a, state);
      if (!recording) { await obs.req('StartRecord'); recording = true; await sleep(600); }
      else await obs.req('ResumeRecord');
      dota.send('demo_resume');
      await sleep((s.b - s.a) * 1000);
      dota.send('demo_pause');
      await obs.req('PauseRecord');
      done += s.b - s.a;
    }
    update(0.97, 'Saving recording…');
    const { outputPath } = await obs.req('StopRecord');
    const dest = join(MEDIA, `replay-${game.matchId}${outputPath.slice(outputPath.lastIndexOf('.'))}`);
    await sleep(1500);
    await rename(outputPath, dest).catch(async () => { await copyFile(outputPath, dest); await unlink(outputPath).catch(() => {}); });
    return { file: dest, clips: spans.length };
  } finally {
    dota.close(); obs.close();
  }
}
