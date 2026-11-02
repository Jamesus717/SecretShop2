// Test setup. Every test runs on a throwaway data folder, a short generated video
// (ffmpeg's test pattern, no real footage) and a made-up match in the OpenDota
// cache, so nothing needs the network. fake-net.mjs is preloaded into each run and
// fails the test if anything reaches past localhost.

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const CUTTER = join(HERE, '..');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

export function tempData() {
  const dir = mkdtempSync(join(tmpdir(), 'hc-night-'));
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

export function sampleVideo(file, { seconds = 60, size = '640x360', audio = true } = {}) {
  mkdirSync(dirname(file), { recursive: true });
  const r = spawnSync(FFMPEG, ['-y', '-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=s=${size}:r=30:d=${seconds}`,
    ...(audio ? ['-f', 'lavfi', '-i', `sine=frequency=330:sample_rate=48000:duration=${seconds}`] : []),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', ...(audio ? ['-c:a', 'aac'] : []), '-shortest', file]);
  if (r.status) throw new Error(r.stderr.toString());
  return file;
}

// A 200-second game: a triple kill fight at 60s and the ending, sitting at VOD
// offset +10 so a 215-second video covers it. kills_log makes it count as parsed.
export function sampleMatch(id, { parsed = true, duration = 40 } = {}) {
  const log = (times, victims) => times.map((time, i) => ({ time, key: `npc_dota_hero_${victims[i]}` }));
  return {
    match_id: +id, duration, radiant_win: true, radiant_name: 'Crêpe stack', dire_name: 'Catwice', radiant_gold_adv: [0, 0, 0],
    objectives: [], teamfights: [],
    players: [
      { player_slot: 0, hero_id: 1, ...(parsed ? { kills_log: log([10, 12, 14], ['axe', 'lina', 'pudge']) } : {}) },
      { player_slot: 128, hero_id: 2, ...(parsed ? { kills_log: [] } : {}) },
    ],
  };
}

export function seedMatch(data, match) {
  mkdirSync(join(data, 'cache', 'opendota'), { recursive: true });
  writeFileSync(join(data, 'cache', 'opendota', `${match.match_id}.json`), JSON.stringify(match));
}

// What a clock scan of that video would have found. The reader is tuned to the real
// Dota HUD, so the test pattern can't be scanned: this stands in for that step.
export function seedScan(data, video, { duration = 40, offset = 2 } = {}) {
  const size = statSync(video).size;
  const name = `${video.split(/[\\/]/).pop().replace(/[^\w.-]/g, '_')}-${size}.json`;
  mkdirSync(join(data, 'cache', 'scans'), { recursive: true });
  const run = { offset, vodStart: offset, vodEnd: duration + offset, gameStart: 0, gameEnd: duration };
  writeFileSync(join(data, 'cache', 'scans', name), JSON.stringify({
    src: video, duration: duration + 10, scannedAt: 'test', levels: new Array(100).fill(0),
    games: [{ runs: [run], replays: 0, gameStart: 0, gameEnd: duration, vodStart: offset, vodEnd: duration + offset }],
  }));
}

export const writeQueue = (data, series) => {
  mkdirSync(join(data, 'night'), { recursive: true });
  writeFileSync(join(data, 'night', 'queue.json'), JSON.stringify({ series }));
};

// Runs night.mjs in its own process, on the data folder, with the network fake loaded.
export function runNightCli(data, args, env = {}) {
  return new Promise((ok) => {
    const p = spawn(process.execPath, ['--import', pathToFileURL(join(HERE, 'fake-net.mjs')).href, join(CUTTER, 'night.mjs'), ...args], {
      env: { ...process.env, HC_DATA: data, YTDLP: 'hc-no-such-ytdlp', CLIPS_BOT_TOKEN: '', ...env }, windowsHide: true,
    });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => ok({ code, out, err }));
  });
}
