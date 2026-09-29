// Downloads hero art from Steam's CDN into tools/stat-designer/hero-art/ so the
// designer can export it. Run once (and again when Valve adds a hero):
//
//   node tools/stat-designer/fetch-hero-art.mjs
//
// Why: the designer shows Steam's images fine either way, but a PNG export can
// only bake in images the browser is allowed to read back, and that depends on
// Steam's CORS headers. Local copies are same-origin, so they always work.
//
// Needs Node 18+ (built-in fetch). hero-art/ is gitignored — it's ~40–60 MB.

import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/';
const KINDS = {
  renders: (slug) => `${CDN}videos/dota_react/heroes/renders/${slug}.png`,   // tall transparent render (Hero card)
  portraits: (slug) => `${CDN}images/dota_react/heroes/${slug}.png`,          // 256×144 landscape (lists)
};
const force = process.argv.includes('--force');

// heroes.js is a browser script (window.SS_HEROES = [...]); pull the array out of it.
const src = await readFile(join(HERE, 'heroes.js'), 'utf8');
const heroes = JSON.parse(src.slice(src.indexOf('= [') + 2, src.lastIndexOf(']') + 1));

const exists = (p) => access(p).then(() => true, () => false);
let got = 0, skipped = 0;
const failed = [];

async function grab(kind, slug) {
  const out = join(HERE, 'hero-art', kind, `${slug}.png`);
  if (!force && await exists(out)) { skipped++; return; }
  try {
    const res = await fetch(KINDS[kind](slug));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // Guard against an HTML error page coming back with a 200.
    if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
    await writeFile(out, buf);
    got++;
  } catch (e) {
    failed.push(`${kind}/${slug} (${e.message})`);
  }
}

for (const kind of Object.keys(KINDS)) await mkdir(join(HERE, 'hero-art', kind), { recursive: true });

// A few at a time — polite to the CDN, still quick.
const jobs = heroes.flatMap(([, , slug]) => Object.keys(KINDS).map((k) => () => grab(k, slug)));
const POOL = 6;
let next = 0;
await Promise.all(Array.from({ length: POOL }, async () => {
  while (next < jobs.length) {
    const i = next++;
    await jobs[i]();
    if ((i + 1) % 25 === 0) process.stdout.write(`  ${i + 1}/${jobs.length}\n`);
  }
}));

console.log(`\nDone: ${got} downloaded, ${skipped} already there, ${failed.length} failed.`);
if (failed.length) {
  console.log('Failed (the designer falls back to the CDN / the other art for these):');
  failed.forEach((f) => console.log('  ' + f));
}
