// Stands in for yt-dlp in the tests: "downloads" the sample by copying it to where
// the -o template points, and says where it put it, the way --print does.

import { appendFileSync, copyFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const args = process.argv.slice(2);
const dir = dirname(args[args.indexOf('-o') + 1]);
const out = join(dir, basename(process.env.HC_FAKE_VOD));
copyFileSync(process.env.HC_FAKE_VOD, out);
appendFileSync(process.env.HC_FAKE_LOG, `${args[args.length - 1]}\n`);
console.log(out);
