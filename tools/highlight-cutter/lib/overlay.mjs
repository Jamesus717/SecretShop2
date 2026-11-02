// Short overlays without the browser, for the night script. app.js draws these on
// a canvas just before rendering; with no page open, ffmpeg draws the same layout
// (band above and below the gameplay, logo, teams, moment, crests, division pill)
// so a headless Short still has its banner. Flat bands, not gradients, and a
// system font unless Cinzel is dropped in <data>\fonts: close, not identical. A
// card drawn by the page always wins (see overlaysFor).
//
// Text comes from spreadsheets people type into, so it never goes in a filter
// string: each line is a text file in the work folder, read with expansion off.

import { join } from 'node:path';
import { mkdir, readdir, writeFile, rm, stat } from 'node:fs/promises';
import { HERE, DATA, ASSETS, FFMPEG, run, readJSON } from './util.mjs';
import { fgHeight } from './render.mjs';

const LEAGUE = 'SecretLeague';
const SITE = 'secretshopdota.co.uk';
const LOGO = join(HERE, '..', '..', 'assets', 'logo.png');
const CRESTS = join(HERE, '..', '..', 'assets', 'teaminfoimgs');
const GOLD = '0xe6c16a', CREAM = '0xeee6d6', DIM = '0xb3a48d', INK = '0x140e08', SCRIM = '0x0d0905';
// Rough width of a character at size 1, to shrink lines that wouldn't fit. Wide on purpose.
const CAPS_W = 0.78, MIXED_W = 0.6, ACTUAL_W = 0.48;

// Same presets and placeholders as the page (BANNER_DEFAULTS and fill() in app.js).
const BANNER_DEFAULTS = [
  { name: 'Series', top: '{teamA}  vs  {teamB}', title: '{moment}', foot: '{league} · GAME {game}', leagueLogo: true, crests: 'line', divisionBadge: true },
  { name: 'Community clip', top: 'Community clip', title: '', foot: '{league}', leagueLogo: true, crests: 'off' },
];
const DIVISIONS = { upper: { label: 'Upper Division', color: '0xd4af37' }, mid: { label: 'Mid Division', color: '0x4f9e8f' }, lower: { label: 'Lower Division', color: '0xd4665c' } };

export async function loadBanner(name) {
  const presets = (await readJSON(join(DATA, 'banners.json'), null))?.presets;
  const list = presets?.length ? presets : BANNER_DEFAULTS;
  return list.find((b) => b.name === name) || BANNER_DEFAULTS.find((b) => b.name === name) || list[0];
}

export const fill = (s, v) => String(s || '').split(' · ').map((part) => {
  let empty = false;
  const out = part.replace(/\{(teamA|teamB|moment|game|league|division)\}/g, (_, k) => {
    const x = String((k === 'division' ? DIVISIONS[v.division]?.label : v[k]) ?? '').trim();
    if (!x) empty = true;
    return x;
  });
  return empty ? '' : out.trim();
}).filter(Boolean).join(' · ');

// Letters and digits only, like logoKey() in js/teamlogo.js, which covers the
// differently-cased and accented file names the site's overrides list by hand.
const key = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export async function findCrest(name, dir = CRESTS) {
  const want = key(name);
  if (!want) return null;
  const hit = (await readdir(dir).catch(() => [])).find((f) => /\.(png|webp|jpe?g)$/i.test(f) && key(f.replace(/\.[^.]+$/, '')) === want);
  return hit ? join(dir, hit) : null;
}

// Cinzel when it's been dropped into the data folder, otherwise a bold Windows serif.
async function fontFile(name, fallback) {
  const own = join(DATA, 'fonts', name);
  return (await stat(own).catch(() => null)) ? own : `C:\\Windows\\Fonts\\${fallback}`;
}
const fontArg = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');
const fit = (text, size, max, w) => Math.max(14, Math.min(size, Math.floor(max / (Math.max(1, [...text].length) * w))));

// Builds one PNG from a list of drawing steps on a transparent 1080×1920 canvas.
async function drawPng(steps, images, out, work) {
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const inputs = ['-f', 'lavfi', '-i', 'color=c=black@0:s=1080x1920:d=1,format=rgba'];
  let graph = '[0:v]' + steps.filter((s) => !s.text).map((s) => s.box).join(',') + '[c0]';
  let n = 0, last = 'c0';
  let t = 0;
  const text = [];
  for (const s of steps.filter((x) => x.text)) {
    const name = `t${t++}.txt`;
    await writeFile(join(work, name), s.text);
    text.push(`drawtext=textfile=${name}:expansion=none:fontfile='${fontArg(s.font)}':fontsize=${s.size}:fontcolor=${s.color}${s.border ? `:borderw=${s.border}:bordercolor=0x080502` : ''}:x=(w-text_w)/2:y=${Math.round(s.y)}-text_h/2`);
  }
  for (const [i, img] of images.entries()) {
    inputs.push('-i', img.file);
    graph += `;[${i + 1}:v]format=rgba,scale=${img.size}:${img.size}:force_original_aspect_ratio=decrease[i${i}];[${last}][i${i}]overlay=${Math.round(img.x)}-w/2:${Math.round(img.y)}-h/2[c${++n}]`;
    last = `c${n}`;
  }
  if (text.length) { graph += `;[${last}]${text.join(',')}[c${++n}]`; last = `c${n}`; }
  await run(FFMPEG, ['-y', '-hide_banner', '-v', 'error', ...inputs, '-filter_complex', graph, '-map', `[${last}]`, '-frames:v', '1', 'overlay.png'], { cwd: work });
  await run(FFMPEG, ['-y', '-hide_banner', '-v', 'error', '-i', join(work, 'overlay.png'), '-c:v', 'png', out]);
  await rm(work, { recursive: true, force: true });
  return out;
}

const box = (x, y, w, h, color, alpha = 1) => ({ box: `drawbox=x=${Math.round(x)}:y=${Math.round(y)}:w=${Math.round(w)}:h=${Math.round(h)}:color=${color}@${alpha}:t=fill:replace=1` });

// Header above the gameplay, footer below: drawOverlay() in app.js.
export async function drawShortOverlay({ banner: b, values, crests = [null, null], frame = 'zoom', out, work }) {
  const v = { league: LEAGUE.toUpperCase(), ...values };
  const top = fill(b.top, v), title = fill(b.title, v).toUpperCase(), foot = fill(b.foot ?? '{league}', v);
  const [bold, light] = await Promise.all([fontFile('Cinzel-Bold.ttf', 'georgiab.ttf'), fontFile('Rajdhani-SemiBold.ttf', 'arialbd.ttf')]);
  const band = (1920 - fgHeight(frame)) / 2;
  const ls = Math.min(150, band * 0.38), y0 = band * 0.08;
  const steps = [
    box(0, 0, 1080, band - 4, SCRIM, 0.78), box(0, band - 4, 1080, 4, GOLD),
    box(0, 1920 - band, 1080, 4, GOLD), box(0, 1920 - band + 4, 1080, band - 4, SCRIM, 0.78),
  ];
  const images = b.leagueLogo === false ? [] : [{ file: LOGO, size: Math.round(ls), x: 540, y: y0 + ls / 2 }];
  const line = (text, y, size, color, w, font = bold) => { if (text) steps.push({ text, y, size: fit(text, size, 980, w), color, font }); };
  const topY = y0 + ls + band * 0.12, titleY = y0 + ls + band * (top ? 0.3 : 0.2);
  line(top, topY, Math.min(52, band * 0.12), CREAM, MIXED_W);
  line(title, titleY, Math.min(70, band * 0.15), GOLD, CAPS_W);
  const spot = b.crests || 'off';
  if (spot !== 'off') {
    const size = Math.round(Math.min(100, band * 0.2));
    const y = { header: y0 + ls / 2, line: topY, footer: 1920 - band * 0.62 }[spot] ?? topY;
    const w = (spot === 'line' ? Math.min(800, [...top].length * Math.min(52, band * 0.12) * ACTUAL_W) : 400) / 2 + size * 0.75;
    crests.forEach((file, i) => { if (file) images.push({ file, size, x: i ? Math.min(1020, 540 + w) : Math.max(60, 540 - w), y }); });
  }
  const div = b.divisionBadge && DIVISIONS[v.division];
  if (div) {
    const size = Math.round(Math.min(30, band * 0.065));
    const label = div.label.toUpperCase();
    const y = (title ? titleY : top ? topY : y0 + ls) + band * 0.15;
    const w = [...label].length * size * CAPS_W + size * 1.6, h = size * 1.7;
    steps.push(box(540 - w / 2, y - h / 2, w, h, div.color));
    steps.push({ text: label, y, size, color: INK, font: bold });
  }
  line(foot, 1920 - band * 0.62, Math.min(46, band * 0.11), CREAM, MIXED_W);
  line(SITE, 1920 - band * 0.38, Math.min(36, band * 0.08), DIM, MIXED_W, light);
  return drawPng(steps, images, out, work);
}

// The frame darkened, the moment huge in the middle: drawThumbOverlay() in app.js.
export async function drawThumbOverlay({ banner: b, values, crests = [null, null], out, work }) {
  const v = { league: LEAGUE.toUpperCase(), ...values };
  const top = fill(b.top, v), foot = fill(b.foot ?? '{league}', v);
  const [bold, light] = await Promise.all([fontFile('Cinzel-Bold.ttf', 'georgiab.ttf'), fontFile('Rajdhani-SemiBold.ttf', 'arialbd.ttf')]);
  const steps = [box(0, 0, 1080, 1920, '0x080502', 0.5)];
  const images = b.leagueLogo === false ? [] : [{ file: LOGO, size: 220, x: 540, y: 240 }];
  crests.forEach((file, i) => { if (file) images.push({ file, size: 180, x: i ? 790 : 290, y: 240 }); });
  const words = fill(b.title || '{moment}', v).toUpperCase().split(/\s+/).filter(Boolean);
  // Up to three lines, each as big as fits.
  const lines = [];
  const per = Math.ceil(words.length / 3);
  for (let i = 0; i < words.length; i += per || 1) lines.push(words.slice(i, i + (per || 1)).join(' '));
  const size = Math.min(150, ...lines.map((l) => fit(l, 150, 980, CAPS_W)));
  const y0 = 960 - ((lines.length - 1) * size * 1.05) / 2;
  if (top) steps.push({ text: top, y: y0 - size * 0.55 - 70, size: fit(top, 56, 980, MIXED_W), color: CREAM, font: bold });
  lines.forEach((text, i) => steps.push({ text, y: y0 + i * size * 1.05, size, color: GOLD, font: bold, border: Math.max(4, Math.round(size / 14)) }));
  if (foot) steps.push({ text: foot, y: 1700, size: fit(foot, 50, 980, MIXED_W), color: CREAM, font: bold });
  steps.push({ text: SITE, y: 1770, size: 38, color: DIM, font: light });
  return drawPng(steps, images, out, work);
}

// Fills in the auto overlays renderShorts() looks for, for every ticked Short that
// doesn't have them yet, under the same names the page uses. Returns the teams with no crest.
export async function overlaysFor(p, { only } = {}) {
  await mkdir(ASSETS, { recursive: true });
  p.cards ??= {}; p.cards.auto ??= {};
  const missing = new Set();
  const preset = await loadBanner(p.settings?.banner || 'Series');
  const crestName = (n) => p.settings?.crestNames?.[n] || n;
  for (const [gi, g] of p.games.entries()) for (const m of (g.moments || []).filter((x) => x.short)) {
    const k = `g${gi + 1}-${m.id}`;
    if (only && !only.includes(k)) continue;
    const st = m.shortStyle || {};
    const b = { ...preset, ...Object.fromEntries(['top', 'title', 'foot', 'leagueLogo', 'crests', 'divisionBadge'].filter((x) => x in st).map((x) => [x, st[x]])) };
    const [teamA, teamB] = [st.teamA ?? g.radiant, st.teamB ?? g.dire];
    const values = { teamA, teamB, moment: m.label.split(' · ')[0], game: gi + 1, division: st.division ?? p.settings?.division };
    const crests = b.crests && b.crests !== 'off' ? await Promise.all([teamA, teamB].map((t) => findCrest(crestName(t)))) : [null, null];
    if (b.crests && b.crests !== 'off') [teamA, teamB].forEach((t, i) => { if (t && !crests[i]) missing.add(t); });
    const work = join(ASSETS, `_overlay-${p.id}`);
    const frame = st.frame || p.settings?.shortFrame || 'zoom';
    if (!p.cards.auto[`short-${k}`]) {
      const name = `${p.id}-short-${k}.png`;
      await drawShortOverlay({ banner: b, values, crests, frame, out: join(ASSETS, name), work });
      p.cards.auto[`short-${k}`] = name;
    }
    if (!p.cards.auto[`thumb-${k}`]) {
      const name = `${p.id}-thumb-${k}.png`;
      await drawThumbOverlay({ banner: b, values, crests, out: join(ASSETS, name), work });
      p.cards.auto[`thumb-${k}`] = name;
    }
  }
  return [...missing];
}

// A community clip's banner, drawn once and kept for every clip.
export async function clipOverlay() {
  await mkdir(ASSETS, { recursive: true });
  const out = join(ASSETS, 'night-clip-overlay.png');
  if (await stat(out).catch(() => null)) return 'night-clip-overlay.png';
  await drawShortOverlay({ banner: await loadBanner('Community clip'), values: {}, out, work: join(ASSETS, '_overlay-clip') });
  return 'night-clip-overlay.png';
}
