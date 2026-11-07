// The overnight run, from a scheduled task or by hand. See "The night run" in the README.
//   node night.mjs [--date 2026-11-02] [--dry-run] [--no-schedule] [--no-inbox] [--delete-vods]
//   node night.mjs --sample [--dry-run]      one known series, into .sample-data (see sample.json)
//   node night.mjs mark-posted <clip id> <post url> [post url…]
//
// It makes Shorts and a report and stops there. Nothing is posted.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const log = (s) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${s}`);

// Settings (HC_DATA, FFMPEG, CLIPS_BOT_TOKEN…) can sit in a .env beside this file
// (gitignored, see .env.example). Ones already set in the environment win.
try { process.loadEnvFile(join(HERE, '.env')); } catch {}

async function main() {
  if (args[0] === 'mark-posted') {
    const [, id, ...urls] = args;
    if (!/^\d+$/.test(id || '') || !urls.length) throw new Error('Usage: node night.mjs mark-posted <clip id> <post url> [post url…]');
    const { markPosted } = await import('./lib/inbox.mjs');
    log(`Clip ${id}: ${(await markPosted(id, urls)).status}`);
    return;
  }
  const known = new Set(['--date', '--dry-run', '--no-schedule', '--no-inbox', '--delete-vods', '--sample']);
  const sample = args.includes('--sample');
  // The sample never touches the real data folder: its VOD, Shorts and state stay in the gitignored one here.
  if (sample) process.env.HC_DATA = process.env.HC_SAMPLE_DATA || join(HERE, '.sample-data');
  // Imported only now: the modules read HC_DATA once, when they load.
  const { runNight, nightOf } = await import('./lib/night.mjs');
  const { readSample, prepareSample } = await import('./lib/sample.mjs');
  const dateAt = args.indexOf('--date');
  const date = dateAt >= 0 ? args[dateAt + 1] : sample ? (await readSample()).date || nightOf() : nightOf();
  // Anything that isn't a flag, or the value after --date, is a typo: don't run a real night on it.
  const bad = args.filter((a, i) => !known.has(a) && !(dateAt >= 0 && i === dateAt + 1));
  if (bad.length || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error(`Bad arguments: ${bad.join(' ') || date}`);
  const dryRun = args.includes('--dry-run');
  if (sample) log(`Sample run in ${process.env.HC_DATA}${dryRun ? ' (dry run, mock match data)' : ''}`);
  const { night, report } = await runNight({
    date, log, dryRun,
    schedule: !sample && !args.includes('--no-schedule'),
    inbox: !sample && !args.includes('--no-inbox'),
    deleteVods: args.includes('--delete-vods'),
    prepare: sample ? () => prepareSample({ dryRun, log }) : undefined,
  });
  const shorts = night.series.reduce((n, s) => n + (s.shorts?.length || 0), 0) + night.clips.filter((c) => c.file).length;
  const planned = night.series.reduce((n, s) => n + (s.wouldRender?.length || 0), 0);
  for (const s of night.series) log(`${s.title}: ${s.status}${s.reason ? ` (${s.reason})` : ''}`);
  log(`${dryRun ? `${planned} Short(s) planned` : `${shorts} Short(s)`}, ${night.series.length} series, ${night.clips.length} clip(s). Report: ${report}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
