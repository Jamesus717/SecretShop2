// ffmpeg recipes. Every piece is encoded to the same format (H.264 60fps,
// AAC 48k stereo, same size) so the pieces can be joined without re-encoding.
//   16x9 — 1920×1080, YouTube long-form
//   9x16 — 1080×1920, Shorts / TikTok / Reels: gameplay in the middle over a
//          blurred, darkened copy of itself, with the page-drawn overlay on top.

import { join } from 'node:path';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { FFMPEG, enc, run, probe } from './util.mjs';

export const SIZES = { '16x9': [1920, 1080], '9x16': [1080, 1920] };
const FADE = 0.25;
const AUDIO = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];
const COMMON = ['-r', '60', '-pix_fmt', 'yuv420p', '-video_track_timescale', '60000'];

// How much of the 1920-wide frame the 9:16 foreground keeps. 'full' shows the
// whole HUD small; 'zoom' crops the sides so the fight is bigger.
const FG = { full: { cw: 1920, ch: 1080 }, zoom: { cw: 1320, ch: 1080 }, tight: { cw: 1080, ch: 1080 } };

// 9:16 graph: blurred, darkened copy filling the frame, the cropped gameplay
// across the middle, then the overlay PNG (input 1) on top.
function vertical(frame, pan, overlay, tail) {
  const [W, H] = SIZES['9x16'];
  const f = FG[frame] || FG.zoom;
  const fgH = Math.round((W / f.cw) * f.ch / 2) * 2;
  return [
    `[0:v]scale=1920:1080,setsar=1,split[a][b]`,
    `[a]scale=-2:${H / 4},crop=${W / 4}:${H / 4},boxblur=6:2,eq=brightness=-0.18:saturation=1.2,scale=${W}:${H}[bg]`,
    `[b]crop=${f.cw}:${f.ch}:(iw-${f.cw})/2*${(1 + Math.max(-1, Math.min(1, +pan || 0))).toFixed(3)}:0,scale=${W}:${fgH}[fg]`,
    `[bg][fg]overlay=0:(H-h)/2${overlay ? '[base];[base][1:v]overlay=0:0' : ''},${tail}[v]`,
  ].join(';');
}

// A 9:16 thumbnail: one frame at time t laid out like the Short, with the
// thumbnail overlay (dark scrim + big centred text) on top. JPG.
export async function thumbnail({ src, t, out, frame = 'zoom', pan = 0, overlay }) {
  await run(FFMPEG, ['-y', '-hide_banner', '-v', 'error', '-ss', Math.max(0, t).toFixed(3), '-i', src, '-i', overlay,
    '-filter_complex', vertical(frame, pan, true, 'null'), '-map', '[v]', '-frames:v', '1', '-q:v', '2', out]);
  return out;
}

// pan (-1…1) slides the 9:16 crop left/right when the action isn't centred.
export async function cutSegment({ src, start, end, out, layout = '16x9', overlay = null, frame = 'zoom', pan = 0, fadeIn = true, fadeOut = true }) {
  const dur = Math.max(0.5, end - start);
  const [W, H] = SIZES[layout];
  const vf = [];
  const fades = [fadeIn && `fade=t=in:st=0:d=${FADE}`, fadeOut && `fade=t=out:st=${(dur - FADE).toFixed(3)}:d=${FADE}`].filter(Boolean);
  const af = [fadeIn && `afade=t=in:st=0:d=${FADE}`, fadeOut && `afade=t=out:st=${(dur - FADE).toFixed(3)}:d=${FADE}`, 'aresample=48000'].filter(Boolean).join(',');
  const args = ['-y', '-hide_banner', '-v', 'error', '-ss', start.toFixed(3), '-i', src];
  if (overlay) args.push('-i', overlay);
  let graph;
  if (layout === '16x9') {
    graph = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1${overlay ? '[base];[base][1:v]overlay=0:0' : ''},${fades.join(',') || 'null'}[v]`;
  } else {
    graph = vertical(frame, pan, !!overlay, fades.join(',') || 'null');
  }
  args.push('-t', dur.toFixed(3), '-filter_complex', graph, '-map', '[v]', '-map', '0:a:0?', '-af', af, ...enc.video, ...COMMON, ...AUDIO, out);
  await run(FFMPEG, args);
  return out;
}

// A still image held for `dur` seconds with silence (or a quiet bed later).
export async function stillCard({ image, dur, out, layout = '16x9' }) {
  const [W, H] = SIZES[layout];
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0b0f14,setsar=1,format=yuv420p,fade=t=in:st=0:d=${FADE},fade=t=out:st=${(dur - FADE).toFixed(3)}:d=${FADE}`;
  await run(FFMPEG, ['-y', '-hide_banner', '-v', 'error', '-loop', '1', '-framerate', '60', '-t', dur.toFixed(3), '-i', image,
    '-f', 'lavfi', '-t', dur.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo',
    '-vf', vf, '-map', '0:v', '-map', '1:a', ...enc.video, ...COMMON, ...AUDIO, '-shortest', out]);
  return out;
}

// The thumbnail held for a few frames, to go first in a Short. Discord (and most
// chat apps) preview a video by its first frame, and every clip fades in from
// black, so without this the preview is a black box. 3 frames is a blink.
export async function posterFrames({ image, out, layout = '9x16', frames = 3 }) {
  const [W, H] = SIZES[layout];
  const dur = (frames / 60).toFixed(4);
  await run(FFMPEG, ['-y', '-hide_banner', '-v', 'error', '-loop', '1', '-framerate', '60', '-t', dur, '-i', image,
    '-f', 'lavfi', '-t', dur, '-i', 'anullsrc=r=48000:cl=stereo',
    '-vf', `scale=${W}:${H},setsar=1,format=yuv420p`, '-map', '0:v', '-map', '1:a', ...enc.video, ...COMMON, ...AUDIO, '-shortest', out]);
  return out;
}

export async function concat(parts, out, workDir) {
  await mkdir(workDir, { recursive: true });
  const list = join(workDir, 'concat.txt');
  await writeFile(list, parts.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  await run(FFMPEG, ['-y', '-hide_banner', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
  return out;
}

export const duration = async (f) => (await probe(f)).duration;
export const cleanup = (dir) => rm(dir, { recursive: true, force: true });
