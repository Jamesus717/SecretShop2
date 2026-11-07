// The night run on one known series (night.mjs --sample), to try the whole thing
// end to end: fetch the match → cut a small piece of its VOD → scan → Shorts with
// overlays → the morning report, all in the sample data folder (gitignored).
//
// The VOD isn't in the repo. HC_SAMPLE_SOURCE is the full VOD (a file, or its link),
// and only the section in sample.json is kept: about 1.1 GB for one game, not 4.5.
// A dry run uses mock-data/opendota instead of OpenDota and needs no VOD.

import { join, isAbsolute } from 'node:path';
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { HERE, CACHE, MEDIA, FFMPEG, YTDLP, run, readJSON, writeJSON } from './util.mjs';
import { getMatch, isParsed } from './opendota.mjs';

export const SAMPLE_MAX = 2.2e9; // the cap on what a sample may download or keep
const MOCK = join(HERE, '..', '..', 'mock-data', 'opendota');

export const readSample = async (file = process.env.HC_SAMPLE || join(HERE, 'sample.json')) => {
  const s = await readJSON(file, null);
  if (!s?.matchIds?.length || !s.file || !Array.isArray(s.section)) throw new Error(`${file} isn't a sample (needs matchIds, file and section)`);
  return s;
};

// [from, to] seconds of `src` (a file or a link) → `out`, never bigger than `max`.
export async function cutSample(src, out, [from, to], { max = SAMPLE_MAX } = {}) {
  const part = `${out}.part.mp4`;
  await mkdir(join(out, '..'), { recursive: true });
  await rm(part, { force: true });
  if (/^https?:\/\//.test(src)) {
    await run(YTDLP, ['-f', 'bv*[height<=1080]+ba/b[height<=1080]/b', '--download-sections', `*${from}-${to}`,
      '--merge-output-format', 'mp4', '--no-playlist', '--max-filesize', String(Math.round(max)), '-o', part, '--', src]);
  } else {
    if (!(await stat(src).catch(() => null))) throw new Error(`HC_SAMPLE_SOURCE ${src} doesn't exist`);
    // Stream copy: seconds, not a re-encode. It starts on the keyframe before `from`.
    await run(FFMPEG, ['-hide_banner', '-v', 'error', '-y', '-ss', String(from), '-to', String(to), '-i', src,
      '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-avoid_negative_ts', 'make_zero', '-fs', String(Math.round(max)), part]);
  }
  const size = (await stat(part).catch(() => null))?.size;
  if (!size) throw new Error(`The sample cut made nothing from ${src}`);
  // -fs stops at the cap rather than failing, so a file at the cap is a cut-short one.
  if (size >= max * 0.99) { await rm(part, { force: true }); throw new Error(`The sample would be over ${(max / 1e9).toFixed(1)} GB: make the section shorter`); }
  await rename(part, out);
  return { file: out, size };
}

// Puts the sample's match data, VOD and queue in the data folder, and clears its
// state so the run does it again. Returns the queue item.
export async function prepareSample({ dryRun = false, log = () => {} } = {}) {
  const s = await readSample();
  for (const id of s.matchIds) {
    const cached = join(CACHE, 'opendota', `${id}.json`);
    if (dryRun) {
      if (!(await stat(cached).catch(() => null))) await mkdir(join(CACHE, 'opendota'), { recursive: true }).then(() => copyFile(join(MOCK, `${id}.json`), cached)).catch(() => {});
      continue;
    }
    try { await getMatch(id, { refresh: true }); log(`Fetched match ${id} from OpenDota`); }
    catch (e) {
      // A copy from an earlier run (or a dry run's mock) still does for trying the pipeline.
      if (e.code === 'UNPARSED' || !isParsed(await readJSON(cached, null))) throw e;
      log(`Couldn't fetch match ${id} (${e.message}), using the cached copy`);
    }
  }
  const vod = join(MEDIA, s.file);
  if (!dryRun && !(await stat(vod).catch(() => null))) {
    const src = process.env.HC_SAMPLE_SOURCE;
    if (!src) throw new Error(`No sample VOD: set HC_SAMPLE_SOURCE to the full VOD (a file or its link), or put the cut in ${vod}`);
    if (!/^https?:\/\//.test(src) && !isAbsolute(src)) throw new Error('HC_SAMPLE_SOURCE should be a full path or a link');
    log(`Cutting ${s.section[0]}–${s.section[1]}s of the VOD into ${vod}`);
    const { size } = await cutSample(src, vod, s.section);
    log(`Sample VOD: ${(size / 1e9).toFixed(2)} GB`);
  }
  const item = { title: s.title, matchIds: s.matchIds.map(String), bestOf: s.bestOf || 3, vod, ...(s.division ? { division: s.division } : {}) };
  const night = join(CACHE, '..', 'night');
  await writeJSON(join(night, 'queue.json'), { series: [item] });
  if (!dryRun) {
    const state = await readJSON(join(night, 'state.json'), null);
    if (state?.series) { delete state.series[item.matchIds.join('+')]; await writeJSON(join(night, 'state.json'), state); }
  }
  return { ...s, item };
}
