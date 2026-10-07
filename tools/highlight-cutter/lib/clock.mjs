// Reads the Dota spectator HUD clock out of video frames, so game time (what
// OpenDota reports) can be mapped onto VOD time — through the draft, pauses,
// caster segments and instant replays.
//
// No OCR dependency: the clock is always the same white font in the same spot,
// so each character is matched against templates in clock-templates.json.
// Those were captured from a real VOD by `node lib/clock.mjs calibrate …`
// (see the bottom of this file). Frames of any size are scaled to 1080p first.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { HERE, FFMPEG } from './util.mjs';

// Clock box at 1920×1080: centred above the sun/moon icon's text line.
export const BOX = { x: 924, y: 25, w: 72, h: 11 };
const TEMPLATE_FILE = join(HERE, 'lib', 'clock-templates.json');
const GLYPH = { w: 8, h: 12 }; // every glyph is resampled to this before matching

// --- frame → glyphs -------------------------------------------------------

// White text: every channel bright. The gold HUD frame has little blue, so it drops out.
export function mask(rgb) {
  const { w, h } = BOX;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    m[i] = Math.min(r, g, b) > 120 && Math.max(r, g, b) - Math.min(r, g, b) < 70 ? 1 : 0;
  }
  return m;
}

// Split into glyphs on empty columns. Each glyph: { x0, x1, y0, y1, bits }.
export function glyphs(m) {
  const { w, h } = BOX;
  const colOn = (x) => { for (let y = 0; y < h; y++) if (m[y * w + x]) return true; return false; };
  const out = [];
  let x = 0;
  while (x < w) {
    while (x < w && !colOn(x)) x++;
    if (x >= w) break;
    const x0 = x;
    while (x < w && colOn(x)) x++;
    let x1 = x - 1;
    // Two digits can touch ("44"). Digits are ≤7px wide, so split anything
    // wider at its emptiest column near the middle.
    if (x1 - x0 + 1 >= 10) {
      let cut = x0 + 4, least = Infinity;
      for (let c = x0 + 3; c <= x1 - 3; c++) {
        let n = 0; for (let yy = 0; yy < h; yy++) n += m[yy * w + c];
        if (n < least) { least = n; cut = c; }
      }
      x1 = cut - 1; x = cut;
    }
    let y0 = h, y1 = -1;
    for (let yy = 0; yy < h; yy++) for (let xx = x0; xx <= x1; xx++) if (m[yy * w + xx]) { y0 = Math.min(y0, yy); y1 = Math.max(y1, yy); }
    out.push({ x0, x1, y0, y1, n: count(m, x0, x1, y0, y1) });
  }
  return out.map((g) => ({ ...g, bits: resample(m, g) }));
}
const count = (m, x0, x1, y0, y1) => { let n = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) n += m[y * BOX.w + x]; return n; };

function resample(m, g) {
  const out = new Float32Array(GLYPH.w * GLYPH.h);
  const gw = g.x1 - g.x0 + 1, gh = g.y1 - g.y0 + 1;
  for (let y = 0; y < GLYPH.h; y++) for (let x = 0; x < GLYPH.w; x++) {
    const sx = g.x0 + Math.min(gw - 1, Math.floor((x + 0.5) * gw / GLYPH.w));
    const sy = g.y0 + Math.min(gh - 1, Math.floor((y + 0.5) * gh / GLYPH.h));
    out[y * GLYPH.w + x] = m[sy * BOX.w + sx];
  }
  return out;
}

// --- glyphs → time ----------------------------------------------------------

let templates = null;
function loadTemplates() {
  if (templates) return templates;
  if (!existsSync(TEMPLATE_FILE)) throw new Error('clock-templates.json missing — run the calibrate command');
  templates = JSON.parse(readFileSync(TEMPLATE_FILE, 'utf8'));
  return templates;
}

// Returns seconds (negative before the horn) or null when it isn't a clock.
export function readClock(rgb) {
  const T = loadTemplates();
  const gs = glyphs(mask(rgb));
  // Colon: tiny glyph. Minus: short and wide, vertically centred.
  let text = '';
  for (const g of gs) {
    const gw = g.x1 - g.x0 + 1, gh = g.y1 - g.y0 + 1;
    if (gh <= 3 && gw >= 3) { text += '-'; continue; }
    if (gh >= 4 && gw <= 3 && g.n <= 8) { text += ":"; continue; }
    if (gh < T.minHeight || gh > T.maxHeight || gw > T.maxWidth) return null;
    let best = null, bestD = Infinity;
    for (const [digit, list] of Object.entries(T.digits)) for (const t of list) {
      let d = 0;
      for (let i = 0; i < t.length; i++) d += Math.abs(t[i] - g.bits[i]);
      if (d < bestD) { bestD = d; best = digit; }
    }
    if (bestD > T.maxDistance) return null;
    text += best;
  }
  const m = /^(-?)(\d{1,3}):(\d\d)$/.exec(text);
  if (!m || +m[3] > 59) return null;
  const s = +m[2] * 60 + +m[3];
  return m[1] ? -s : s;
}

// --- scanning a whole video -------------------------------------------------

// One pass over keyframes only (Twitch puts one every ~2s), so a 2h VOD is
// a couple of minutes — mostly disk reading. Pass `audio` (an audio.mjs
// meter) to measure loudness in the same pass rather than reading the file twice.
// Resolves to [{ t, clock }] for every keyframe.
export function scanVideo(file, { onProgress, duration, audio } = {}) {
  return new Promise((resolve, reject) => {
    const { x, y, w, h } = BOX;
    const vf = ['scale=1920:1080', `crop=${w}:${h}:${x}:${y}`, 'showinfo'].join(',');
    const args = ['-hide_banner', '-nostats', '-skip_frame', 'nokey', '-i', file,
      '-map', '0:v:0', '-vf', vf, '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'];
    if (audio) args.push('-map', '0:a:0?', '-ac', '1', '-ar', String(audio.rate), '-f', 's16le', 'pipe:3');
    const p = spawn(FFMPEG, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] });
    if (audio) p.stdio[3].on('data', (d) => audio.push(d));
    const frameSize = w * h * 3;
    let buf = Buffer.alloc(0);
    const times = [];
    const frames = [];
    let errTail = '';
    p.stderr.on('data', (d) => {
      const s = d.toString();
      errTail = (errTail + s).slice(-2000);
      for (const m of s.matchAll(/pts_time:\s*([\d.]+)/g)) {
        times.push(+m[1]);
        if (onProgress && duration) onProgress(Math.min(1, +m[1] / duration));
      }
    });
    p.stdout.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= frameSize) {
        frames.push(readClock(buf.subarray(0, frameSize)));
        buf = buf.subarray(frameSize);
      }
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg scan failed: ${errTail.slice(-500)}`));
      const n = Math.min(times.length, frames.length);
      const out = [];
      for (let i = 0; i < n; i++) out.push({ t: +times[i].toFixed(2), clock: frames[i] });
      resolve(out);
    });
  });
}

// --- clock samples → mapping ------------------------------------------------

// Groups samples into "runs" where the clock ticks in step with the video
// (offset = vodTime - gameTime stays constant). Pauses end a run; instant
// replays show an earlier clock, so they're dropped: a run only counts if it
// reaches game time no earlier than what's already been shown live.
export function buildRuns(samples) {
  const runs = [];
  let cur = null;
  for (const s of samples) {
    if (s.clock == null) continue;
    const off = s.t - s.clock;
    if (cur && Math.abs(off - cur.offset) <= 2.5 && s.t - cur.vodEnd <= 12) {
      cur.vodEnd = s.t; cur.gameEnd = s.clock; cur.n++;
      cur.offset = (cur.offset * (cur.n - 1) + off) / cur.n;
      continue;
    }
    cur = { offset: off, vodStart: s.t, vodEnd: s.t, gameStart: s.clock, gameEnd: s.clock, n: 1 };
    runs.push(cur);
  }
  // Need at least 3 samples (~6s) to trust a run; one misread digit can't make one.
  const solid = runs.filter((r) => r.n >= 3);
  // Split into games: a long run whose clock is far behind what we've seen
  // means a new game began. Short ones that go backwards are instant replays.
  const games = [];
  let g = null;
  for (const r of solid) {
    if (!g || (r.gameStart < g.maxGame - 120 && r.n >= 30)) { g = { runs: [], maxGame: -Infinity }; games.push(g); }
    if (r.gameEnd < g.maxGame - 5) r.replay = true;
    g.runs.push(r);
    if (!r.replay) g.maxGame = Math.max(g.maxGame, r.gameEnd);
  }
  return games.map((gm) => ({
    runs: gm.runs.filter((r) => !r.replay).map(({ offset, vodStart, vodEnd, gameStart, gameEnd }) => ({ offset: +offset.toFixed(2), vodStart, vodEnd, gameStart, gameEnd })),
    replays: gm.runs.filter((r) => r.replay).length,
    gameStart: Math.min(...gm.runs.map((r) => r.gameStart)),
    gameEnd: gm.maxGame,
    vodStart: gm.runs[0].vodStart,
    vodEnd: gm.runs[gm.runs.length - 1].vodEnd,
  }));
}

// Game time → VOD time, using the run that covers it (or the nearest one;
// a fight that straddles a pause is cut at the pause by the caller).
export function gameToVod(runs, g) {
  let best = null, bestGap = Infinity;
  for (const r of runs) {
    const gap = g < r.gameStart ? r.gameStart - g : g > r.gameEnd + 2 ? g - r.gameEnd : 0;
    if (gap < bestGap) { bestGap = gap; best = r; }
    if (gap === 0) break;
  }
  return best ? { t: +(g + best.offset).toFixed(2), gap: bestGap } : null;
}

// --- calibration --------------------------------------------------------------
// node lib/clock.mjs calibrate <video> <vodSeconds> <clockSeconds> [lengthSeconds]
// Picks a stretch where you know the clock was running, reads 1 frame/second,
// and saves each digit it sees as a template. Check the stretch has no pause.

async function calibrate(file, vodAt, clockAt, len = 90) {
  const { x, y, w, h } = BOX;
  const args = ['-hide_banner', '-v', 'error', '-ss', String(vodAt), '-i', file, '-t', String(len), '-an',
    '-vf', `fps=1,scale=1920:1080,crop=${w}:${h}:${x}:${y}`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'];
  const chunks = [];
  await new Promise((res, rej) => { const p = spawn(FFMPEG, args); p.stdout.on('data', (d) => chunks.push(d)); p.on('close', (c) => (c ? rej(new Error('ffmpeg failed')) : res())); });
  const all = Buffer.concat(chunks);
  const size = w * h * 3;
  const digits = {};
  let minH = Infinity, maxH = 0, maxW = 0, used = 0;
  for (let i = 0; i * size < all.length; i++) {
    const s = clockAt + i;
    const want = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`.replace(':', '');
    const gs = glyphs(mask(all.subarray(i * size, (i + 1) * size))).filter((g) => !((g.y1 - g.y0) >= 3 && (g.x1 - g.x0) <= 2 && g.n <= 8));
    if (gs.length !== want.length) { console.log(`  skip ${want}: saw ${gs.length} glyphs`); continue; }
    used++;
    gs.forEach((g, k) => {
      const d = want[k];
      (digits[d] ||= []);
      const bits = Array.from(g.bits);
      if (!digits[d].some((t) => t.every((v, j) => v === bits[j]))) digits[d].push(bits);
      minH = Math.min(minH, g.y1 - g.y0 + 1); maxH = Math.max(maxH, g.y1 - g.y0 + 1); maxW = Math.max(maxW, g.x1 - g.x0 + 1);
    });
  }
  const T = { box: BOX, glyph: GLYPH, minHeight: minH - 1, maxHeight: maxH + 1, maxWidth: maxW + 2, maxDistance: 18, digits };
  writeFileSync(TEMPLATE_FILE, JSON.stringify(T));
  console.log(`used ${used} frames; digits: ${Object.keys(digits).sort().map((d) => `${d}×${digits[d].length}`).join(' ')}`);
}

if (process.argv[1] && process.argv[1].endsWith('clock.mjs') && process.argv[2] === 'calibrate') {
  const [, , , file, vodAt, clockAt, len] = process.argv;
  calibrate(file, +vodAt, +clockAt, len ? +len : 90).catch((e) => { console.error(e); process.exit(1); });
}
