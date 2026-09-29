// Local server for the stat designer. launch.bat runs this; you can also run
//   node tools/stat-designer/serve.mjs [port]
//
// It serves the repo root (same as `python -m http.server`) with one addition:
// requests for hero-art/<renders|portraits>/<slug>.png that aren't on disk yet
// are fetched from Steam's CDN, saved into hero-art/, and served from here.
//
// Why: the browser shows Steam-hosted images fine, but an export has to read the
// pixels back, and Steam doesn't send the CORS header that allows that — so
// heroes came out blank in downloaded / copied PNGs. Served from localhost the
// images are same-origin and always export. Each hero is only downloaded once.
//
// It also backs the Compare template: GET league-games turns the league snapshot
// in mock-data/imprint-series-bundle.json into one row per player per game, and
// POST update-mock-data runs mock-data/fetch-mock-data.mjs to bring that
// snapshot up to date from the live site (the same script as `?mock=1` uses).
//
// Needs Node 18+ (built-in fetch). No dependencies.

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = normalize(join(HERE, '..', '..'));
const PORT = +(process.argv[2] || process.env.PORT || 8734);
const CDN = process.env.HERO_CDN || 'https://cdn.cloudflare.steamstatic.com/apps/dota2/';

const HERO_ART = /^\/tools\/stat-designer\/hero-art\/(renders|portraits)\/([a-z0-9_]+)\.png$/;
// Crests captains uploaded on the site (Supabase storage, public bucket).
// Same reasoning as hero art: served from here they always export.
const CREST = /^\/tools\/stat-designer\/crest-proxy\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)$/;
const CREST_ORIGIN = process.env.CREST_ORIGIN || 'https://nqcbfsnscqoaznypovyx.supabase.co/storage/v1/object/public/team-logos/';
const REMOTE = {
  renders: (slug) => `${CDN}videos/dota_react/heroes/renders/${slug}.png`,
  portraits: (slug) => `${CDN}images/dota_react/heroes/${slug}.png`,
};

const MOCK_DIR = join(ROOT, 'mock-data');
const SITE = process.env.SITE_ORIGIN || 'https://secretshopdota.co.uk';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

const isFile = (p) => stat(p).then((s) => s.isFile(), () => false);

// Two requests for the same missing hero share one download.
const inflight = new Map();
function fetchHero(kind, slug, dest) {
  const key = `${kind}/${slug}`;
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    const res = await fetch(REMOTE[kind](slug));
    if (!res.ok) throw new Error(`Steam said ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // An error page can come back as a 200 — only keep real PNGs.
    if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    console.log(`  saved hero-art/${key}.png`);
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

// Uploaded crests are saved without a trustworthy extension, so sniff the bytes.
function imageType(buf) {
  if (buf.length < 12) return null;
  if (buf.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  return null;
}

// ---------- league games (Compare template) ----------
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const pct = (v) => { const n = parseFloat(String(v ?? '').replace('%', '')); return Number.isFinite(n) ? n : null; };
const numOrNull = (v) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : null);

async function leagueGames() {
  const bundleFile = join(MOCK_DIR, 'imprint-series-bundle.json');
  const series = ((await readJson(bundleFile)).data || {}).series || [];
  const seen = new Set();
  const rows = [];
  for (const sd of series) {
    for (const m of sd.matches || []) {
      // A split Bo2 can list the same game under two series fragments — count it once.
      if (m.match_id == null || seen.has(m.match_id)) continue;
      seen.add(m.match_id);
      for (const t of m.teams || []) {
        for (const p of t.players || []) {
          if (p.account_id == null) continue;
          rows.push({
            m: m.match_id, ts: m.timestamp ?? null, t: t.team_name, w: !!t.win,
            id: p.account_id, n: p.account_name || 'Unknown', pos: numOrNull(p.position),
            h: (p.hero && p.hero.name) || null,
            k: numOrNull(p.kills), d: numOrNull(p.deaths), a: numOrNull(p.assists),
            nw: numOrNull(p.net_worth), lvl: numOrNull(p.level), hd: numOrNull(p.hero_damage),
            r: numOrNull(p.imprint_rating), kp: pct(p.kill_participation),
          });
        }
      }
    }
  }
  // How many finished meetings the snapshot hasn't fetched yet (same grouping
  // as fetch-mock-data.mjs: fragments summed per team-pair, a Bo2 is done at 2).
  let pending = null;
  try {
    const all = ((await readJson(join(MOCK_DIR, 'imprint-matches.json'))).data || {}).series || [];
    const have = new Set(series.map((s) => String(s.series_id)));
    const meetings = new Map();
    for (const s of all) {
      const ids = (s.teams || []).map((t) => t.team_id).filter((x) => x != null);
      if (ids.length !== 2 || s.series_id == null) continue;
      const key = ids.sort((a, b) => a - b).join('-');
      const mt = meetings.get(key) || { frags: [], games: 0 };
      mt.frags.push(String(s.series_id)); mt.games += Number(s.match_count) || 0;
      meetings.set(key, mt);
    }
    pending = [...meetings.values()].filter((mt) => mt.games === 2 && !mt.frags.every((f) => have.has(f))).length;
  } catch { /* no matches file yet */ }
  const st = await stat(bundleFile);
  return { updated: st.mtime.toISOString(), games: seen.size, rows, pending };
}

// One update at a time; its output is streamed back to the page line by line.
let updating = false;
function runMockUpdate(req, res, batch) {
  // Only this page may trigger it: a custom header can't be sent cross-site
  // without a CORS preflight, which this server never approves.
  if (req.headers['x-designer'] !== '1') return send(res, 403, 'Forbidden');
  if (updating) return send(res, 409, 'An update is already running.');
  if (!/^(all|[1-9]\d{0,2})$/.test(batch)) return send(res, 400, 'Bad batch size');
  updating = true;
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  res.write(`Running mock-data/fetch-mock-data.mjs against ${SITE} (batch: ${batch})\n`);
  const child = spawn(process.execPath, [join(MOCK_DIR, 'fetch-mock-data.mjs'), SITE, batch], { cwd: ROOT });
  child.stdout.on('data', (d) => res.write(d));
  child.stderr.on('data', (d) => res.write(d));
  child.on('error', (e) => { res.write(`\nCouldn't start the script: ${e.message}\n`); });
  child.on('close', (code) => {
    updating = false;
    console.log(`  mock data update finished (exit ${code})`);
    res.end(`\n__EXIT__ ${code}\n`);
  });
}

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
}

function sendFile(res, file) {
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    // Always re-read from disk, so an edited index.html shows on a normal refresh.
    'Cache-Control': 'no-cache',
  });
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);

    if (path === '/tools/stat-designer/league-games') {
      try {
        const body = JSON.stringify(await leagueGames());
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
        return res.end(body);
      } catch (e) {
        return send(res, 404, 'No league snapshot yet — run "Update league data" first.');
      }
    }
    if (path === '/tools/stat-designer/update-mock-data') {
      if (req.method !== 'POST') return send(res, 405, 'Use POST');
      return runMockUpdate(req, res, new URL(req.url, 'http://x').searchParams.get('batch') || 'all');
    }

    const hero = path.match(HERO_ART);
    if (hero) {
      const [, kind, slug] = hero;
      const file = join(HERE, 'hero-art', kind, `${slug}.png`);
      if (!(await isFile(file))) {
        try { await fetchHero(kind, slug, file); }
        catch (e) { console.log(`  couldn't get ${kind}/${slug}: ${e.message}`); return send(res, 404, 'Not found'); }
      }
      return sendFile(res, file);
    }

    const crest = path.match(CREST);
    if (crest) {
      const rel = crest[1];
      if (rel.includes('..')) return send(res, 403, 'Forbidden');
      const file = join(HERE, 'crest-cache', rel.replace('/', '__'));
      if (!(await isFile(file))) {
        try {
          const r = await fetch(CREST_ORIGIN + rel);
          if (!r.ok) throw new Error(`site said ${r.status}`);
          const buf = Buffer.from(await r.arrayBuffer());
          if (!imageType(buf)) throw new Error('not an image');
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file, buf);
          console.log(`  saved crest ${rel}`);
        } catch (e) { console.log(`  couldn't get crest ${rel}: ${e.message}`); return send(res, 404, 'Not found'); }
      }
      const buf = await readFile(file);
      res.writeHead(200, { 'Content-Type': imageType(buf) || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      return res.end(buf);
    }

    let file = normalize(join(ROOT, path));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) return send(res, 403, 'Forbidden');
    const st = await stat(file).catch(() => null);
    if (st && st.isDirectory()) {
      if (!path.endsWith('/')) { res.writeHead(301, { Location: path + '/' }); return res.end(); }
      file = join(file, 'index.html');
    }
    if (!(await isFile(file))) return send(res, 404, 'Not found');
    sendFile(res, file);
  } catch (e) {
    send(res, 500, 'Server error');
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\nPort ${PORT} is already in use — is the designer already running in another window?\n`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  SecretShop Stat Designer`);
  console.log(`  http://localhost:${PORT}/tools/stat-designer/`);
  console.log(`  Hero art is downloaded into hero-art/ the first time each hero is used.`);
  console.log(`  Close this window to stop.\n`);
});
