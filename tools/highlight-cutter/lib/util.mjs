// Shared helpers: paths, running ffmpeg/yt-dlp, and a tiny job table so the
// page can poll long tasks (downloads, clock scans, renders) for progress.

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
// Everything big lives outside the repo, on the drive with room for VODs (C: is
// nearly full). Override with HC_DATA=<folder> or the launch.bat argument.
export const DATA = process.env.HC_DATA || 'D:\\Videos\\SecretShop';
export const MEDIA = join(DATA, 'media');       // downloaded VODs + replay recordings — the bit to delete
export const OUT = join(DATA, 'output');        // rendered videos
export const CACHE = join(DATA, 'cache');       // OpenDota JSON, clock scans, audio levels
export const PROJECTS = join(DATA, 'projects'); // one JSON per series
export const ASSETS = join(DATA, 'assets');     // cards uploaded/drawn in the page

export const FFMPEG = process.env.FFMPEG || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE || 'ffprobe';
export const YTDLP = process.env.YTDLP || 'yt-dlp';

// Encoder: NVENC when there's an NVIDIA card, x264 otherwise. Set by probeEncoder().
export const enc = { video: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20'] };
export async function probeEncoder() {
  const r = await run(FFMPEG, ['-hide_banner', '-f', 'lavfi', '-i', 'color=black:s=256x256:d=0.1', '-c:v', 'h264_nvenc', '-f', 'null', '-'], { quiet: true }).catch(() => null);
  if (r && r.code === 0) enc.video = ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '21', '-b:v', '0'];
  return enc.video[1];
}

export function run(cmd, args, { onLine, quiet, stdout } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let err = '';
    const chunks = [];
    p.stdout.on('data', (d) => { if (stdout) chunks.push(d); else if (onLine) d.toString().split(/\r?\n|\r/).forEach((l) => l && onLine(l)); });
    p.stderr.on('data', (d) => {
      const s = d.toString();
      err = (err + s).slice(-4000);
      if (onLine) s.split(/\r?\n|\r/).forEach((l) => l && onLine(l));
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0 && !quiet) return reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`));
      resolve({ code, out: stdout ? Buffer.concat(chunks) : null, err });
    });
  });
}

export async function probe(file) {
  const { out } = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { stdout: true });
  const j = JSON.parse(out.toString());
  const v = j.streams.find((s) => s.codec_type === 'video');
  return { duration: +j.format.duration, width: v?.width, height: v?.height };
}

export async function readJSON(p, fallback) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; }
}
export async function writeJSON(p, v) {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(v, null, 2));
}

// Jobs: { id, kind, status: running|done|error, progress 0..1, message, result }
const jobs = new Map();
let nextJob = 1;
export function startJob(kind, fn) {
  const job = { id: String(nextJob++), kind, status: 'running', progress: 0, message: 'Starting…', result: null };
  jobs.set(job.id, job);
  const update = (progress, message) => { if (progress != null) job.progress = progress; if (message) job.message = message; };
  fn(update).then(
    (result) => { job.status = 'done'; job.progress = 1; job.result = result; job.message = 'Done'; },
    (e) => { job.status = 'error'; job.message = e.message; console.error(`[${kind}]`, e); },
  );
  return job;
}
export const getJob = (id) => jobs.get(id);
export const listJobs = () => [...jobs.values()];
