// The overnight run, from a scheduled task or by hand. See "The night run" in the README.
//   node night.mjs [--date 2026-11-02] [--dry-run] [--no-schedule] [--no-inbox] [--delete-vods]
//   node night.mjs mark-posted <clip id> <post url> [post url…]
//
// It makes Shorts and a report and stops there. Nothing is posted.

import { runNight, nightOf } from './lib/night.mjs';

const args = process.argv.slice(2);
const log = (s) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${s}`);

async function main() {
  if (args[0] === 'mark-posted') {
    const [, id, ...urls] = args;
    if (!/^\d+$/.test(id || '') || !urls.length) throw new Error('Usage: node night.mjs mark-posted <clip id> <post url> [post url…]');
    const { markPosted } = await import('./lib/inbox.mjs');
    log(`Clip ${id}: ${(await markPosted(id, urls)).status}`);
    return;
  }
  const known = new Set(['--date', '--dry-run', '--no-schedule', '--no-inbox', '--delete-vods']);
  const dateAt = args.indexOf('--date');
  const date = dateAt >= 0 ? args[dateAt + 1] : nightOf();
  const bad = args.filter((a, i) => !known.has(a) && i !== dateAt + 1 || (a.startsWith('--') && !known.has(a)));
  if (bad.length || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error(`Bad arguments: ${bad.join(' ') || date}`);
  const { night, report } = await runNight({
    date, log, dryRun: args.includes('--dry-run'), schedule: !args.includes('--no-schedule'),
    inbox: !args.includes('--no-inbox'), deleteVods: args.includes('--delete-vods'),
  });
  const shorts = night.series.reduce((n, s) => n + (s.shorts?.length || 0), 0) + night.clips.filter((c) => c.file).length;
  log(`${shorts} Short(s), ${night.series.length} series, ${night.clips.length} clip(s). Report: ${report}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
