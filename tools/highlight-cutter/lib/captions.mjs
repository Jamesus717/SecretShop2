// Burned-in captions for Shorts (most people scroll with the sound off).
//
// ffmpeg 8+ has whisper.cpp built in (the `whisper` audio filter), so this needs
// no Python, just a model file: any ggml-*.bin from
// https://huggingface.co/ggerganov/whisper.cpp in <data>\models, or a path in
// config.json as { "whisper": { "model": "…" } }. small.en is the sweet spot for
// casters shouting over game sound; base.en is quicker and rougher.
//
// Whisper gives a line every few seconds. Shorts captions read better as a few
// words at a time, so each line is split into chunks of up to three words, timed
// by their share of the line's letters (whisper has no per-word times here).
// They sit on the gameplay just above the hero's ability bar, under the fight.
// The .srt is kept next to the Short (YouTube takes it as captions).
//
// Each clip's audio is transcribed straight from the source (audio only, so it's
// quick), before the Short is encoded, and the captions are burned in by that
// same encode (cutSegment's `subs`). Transcribing the finished Short instead
// meant encoding every captioned Short twice.

import { readdir, readFile, writeFile, copyFile, rm, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { DATA, FFMPEG, run, readJSON } from './util.mjs';
import { SIZES, fgHeight } from './render.mjs';

const MODELS = join(DATA, 'models');
const PREFER = ['small.en', 'medium.en', 'base.en', 'small', 'base'];
// Source y (of 1080) the captions end at: just above the ability bar.
// Measured on our broadcast HUD, Oct 2026.
const HUD_TOP = 885;
const FONT = { file: 'C:\\Windows\\Fonts\\seguibl.ttf', name: 'Segoe UI Black' };

export async function whisperModel() {
  const set = (await readJSON(join(DATA, 'config.json'), {})).whisper?.model;
  if (set) return set;
  const files = (await readdir(MODELS).catch(() => [])).filter((f) => /^ggml-.*\.bin$/i.test(f) && !/silero|vad/i.test(f));
  const rank = (f) => { const i = PREFER.findIndex((p) => f.toLowerCase() === `ggml-${p}.bin`); return i < 0 ? 99 : i; };
  const best = files.sort((a, b) => rank(a) - rank(b))[0];
  return best ? join(MODELS, best) : null;
}

// Filter-option escaping, at both levels ffmpeg parses -af: the option value
// (: and ' are special) and then the filtergraph (\ , ; [ ] ' are), so "D:" becomes D\\:.
const optPath = (p) => p.replace(/\\/g, '/').replace(/[:']/g, '\\$&').replace(/[\\,;[\]']/g, '\\$&');

// [start, end] of a video → .srt (whisper's own lines, timed from `start`).
export async function transcribe(video, srt, start = 0, end = null) {
  const model = await whisperModel();
  if (!model) throw new Error(`Captions need a Whisper model: put ggml-small.en.bin (from huggingface.co/ggerganov/whisper.cpp) in ${MODELS}. See the README`);
  await rm(srt, { force: true });
  const range = ['-ss', Math.max(0, start).toFixed(3), ...(end != null ? ['-t', Math.max(0.5, end - start).toFixed(3)] : [])];
  await run(FFMPEG, ['-hide_banner', '-v', 'error', ...range, '-i', video, '-vn',
    '-af', `aresample=16000,whisper=model=${optPath(model)}:language=en:queue=6:destination=${optPath(srt)}:format=srt`, '-f', 'null', '-']);
  return readFile(srt, 'utf8').catch(() => '');
}

const toSec = (t) => { const [h, m, s] = t.replace(',', '.').split(':'); return +h * 3600 + +m * 60 + +s; };
export function parseSrt(text) {
  return text.replace(/\r/g, '').split(/\n\n+/).map((block) => {
    const lines = block.trim().split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) return null;
    const [a, b] = lines[i].split('-->').map((s) => toSec(s.trim()));
    const text = lines.slice(i + 1).join(' ').replace(/\s+/g, ' ').trim();
    // Whisper's placeholders for no speech.
    return text && !/^[[(].*[\])]$/.test(text) ? { a, b, text } : null;
  }).filter(Boolean);
}

// One cue → chunks of up to three words (or ~18 letters), timed by letter share.
export function chunk(cues, { words = 3, chars = 18 } = {}) {
  const out = [];
  for (const c of cues) {
    const groups = [];
    let g = [];
    for (const w of c.text.split(' ')) {
      if (g.length && (g.length >= words || [...g, w].join(' ').length > chars)) { groups.push(g.join(' ')); g = []; }
      g.push(w);
    }
    if (g.length) groups.push(g.join(' '));
    const total = groups.reduce((s, x) => s + x.length, 0) || 1;
    let t = c.a;
    for (const x of groups) {
      const d = ((c.b - c.a) * x.length) / total;
      // A word or two alone in a long line would otherwise sit there for seconds.
      out.push({ a: t, b: t + Math.min(d, 2.5), text: x });
      t += d;
    }
  }
  // Whisper's lines can overlap by a second; two captions at once would stack.
  out.sort((x, y) => x.a - y.a);
  out.forEach((c, i) => { if (out[i + 1]) c.b = Math.min(c.b, out[i + 1].a); });
  return out.filter((c) => c.b - c.a > 0.05);
}

const assTime = (s) => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, cs = Math.round((s % 60) * 100); return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(cs / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`; };
const assText = (s) => s.toUpperCase().replace(/\\/g, '').replace(/[{}]/g, '').replace(/\n/g, ' ');

// Captions as ASS, sized and placed for a 9:16 Short with this framing.
export function toAss(chunks, frame = 'zoom') {
  const [W, H] = SIZES['9x16'];
  const fg = fgHeight(frame), band = (H - fg) / 2;
  // Bottom-centred (alignment 2) on the gameplay, ending just above the hero's
  // ability bar, which starts at y≈910 of the 1080 source (the hero name and
  // portrait frame; the scan button pokes up to ~890). So: right under the fight.
  const bottom = band + (HUD_TOP / 1080) * fg;
  const size = frame === 'full' ? 56 : 72; // Full shrinks the gameplay to 608px tall
  const marginV = Math.round(H - bottom);
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${FONT.name},${size},&H00FFFFFF,&H00FFFFFF,&H00050908,&H99000000,0,0,0,0,100,100,1,0,1,${Math.round(size / 7)},3,2,40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${chunks.map((c) => `Dialogue: 0,${assTime(c.a)},${assTime(c.b)},Cap,,0,0,0,,{\\fad(60,0)}${assText(c.text)}`).join('\n')}
`;
}

const srtTime = (s) => assTime(s).replace(/^(\d+):/, (m, h) => `${h.padStart(2, '0')}:`).replace('.', ',') + '0';
const toSrt = (chunks) => chunks.map((c, i) => `${i + 1}\n${srtTime(c.a)} --> ${srtTime(c.b)}\n${c.text}\n`).join('\n');

// Captions for a Short made of these source pieces ([[start, end], …] of `src`),
// before it's encoded. Returns one `subs` per piece for cutSegment (null where
// nobody spoke), the .srt for the whole Short (`lead` = seconds before the first
// piece, e.g. the poster frames) and how many caption chunks there are in all.
// Everything the ass filter reads sits in `work`, named without a path, so
// nothing in the filter string needs escaping.
export async function prepareCaptions(src, segs, { frame = 'zoom', work, lead = 0 }) {
  await mkdir(work, { recursive: true });
  await copyFile(FONT.file, join(work, basename(FONT.file)));
  const subs = [], all = [];
  let at = lead;
  let count = 0;
  for (const [k, [a, b]] of segs.entries()) {
    const cues = parseSrt(await transcribe(src, join(work, `piece-${k}.srt`), a, b));
    const chunks = chunk(cues);
    if (chunks.length) {
      const file = `captions-${k}.ass`;
      await writeFile(join(work, file), toAss(chunks, frame));
      subs.push({ file, dir: work });
      count += chunks.length;
      // The .srt keeps whisper's whole lines (better as YouTube subtitles than
      // three-word chunks), clipped to the piece and moved to the Short's time.
      all.push(...cues.map((c) => ({ text: c.text, a: at + Math.max(0, c.a), b: at + Math.min(b - a, c.b) })).filter((c) => c.b > c.a));
    } else subs.push(null);
    at += b - a;
  }
  return { subs, srt: all.length ? toSrt(all) : '', count };
}

export const modelsDir = MODELS;
