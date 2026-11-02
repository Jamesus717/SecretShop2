// Loaded with --import before night.mjs. Anything past localhost is written to
// HC_NET_LOG and refused, so no test can touch a real API; the tests assert on the log.
// yt-dlp is swapped for test/fake-ytdlp.mjs, which copies a sample in.

import { appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const realSpawn = cp.spawn;
cp.spawn = (cmd, args, opts) => (cmd === 'fake-yt-dlp'
  ? realSpawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'fake-ytdlp.mjs'), ...args], opts)
  : realSpawn(cmd, args, opts));
syncBuiltinESMExports();

const real = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const method = (init.method || 'GET').toUpperCase();
  if (process.env.HC_NET_LOG) appendFileSync(process.env.HC_NET_LOG, `${method} ${url.href}\n`);
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return real(input, init);
  throw new Error(`test network: refused ${url.hostname}`);
};
