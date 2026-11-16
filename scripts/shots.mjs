// Screenshots + checks for any routes: 1280 and 375 wide, dark and light.
// Usage: npm run shots -- [--base http://localhost:5173] [/route ...]   (no routes = every route)
// Env: EDGE_PATH (Edge/Chrome binary), OUT_DIR (default docs/redesign/screens).
// Writes <OUT_DIR>/<route-slug>-<width>-<theme>.png and reports console errors and horizontal overflow
// per shot. Read-only: never clicks, types or submits anything.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const ALL = [
  '/', '/team-info', '/team-info?team=FarmVille', '/playoffs', '/playoffs?div=mid', '/playoffs?div=lower',
  '/groupstage', '/standings', '/standings?mock=1', '/news', '/rules', '/profile', '/register', '/balancer',
  '/clips', '/nope404',
];
const args = process.argv.slice(2);
let BASE = process.env.BASE_URL || 'http://localhost:5173';
const routes = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--base') BASE = args[++i]; else routes.push(args[i]);
}
const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = process.env.OUT_DIR || 'docs/redesign/screens';
mkdirSync(OUT, { recursive: true });

const slug = (r) => (r === '/' ? 'home' : r.replace(/^\//, '').replace(/[?&=]+/g, '-').replace(/[^a-zA-Z0-9-]+/g, '').toLowerCase().replace(/-+$/, ''));
const SIZES = [[1280, 900], [375, 812]];
// The sheet / Apps Script / Pages Functions are unreachable or slow from a dev box: these are not page bugs.
const EXPECTED = [/\/api\//, /Failed to load resource/, /docs\.google\.com|script\.google/];

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new' });
const summary = [];
for (const route of routes.length ? routes : ALL) {
  let errs = 0, over = 0;
  for (const [w, h] of SIZES) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h });
      await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('theme', t); } catch { /* ignore */ } }, theme);
      const errors = [], noted = [];
      const note = (t) => (EXPECTED.some((re) => re.test(t)) ? noted : errors).push(t);
      page.on('console', (m) => { if (m.type() === 'error') note(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 }).catch((e) => errors.push('goto: ' + e.message));
      await page.addStyleTag({ content: '* { transition: none !important; animation: none !important }' });
      if (route.startsWith('/team-info')) await page.waitForSelector('button[aria-label^="View roster"], [role="alert"]', { timeout: 40000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 700));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const file = `${OUT}/${slug(route)}-${w}-${theme}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(`${file}  overflow=${overflow}  errors=${errors.length}${noted.length ? `  (+${noted.length} network)` : ''}`);
      errors.forEach((e) => console.log('   ! ' + e.slice(0, 200)));
      errs += errors.length; if (overflow > 0) over++;
      await page.close();
    }
  }
  summary.push([route, errs, over]);
}
await browser.close();
console.log('\nroute -> console errors / shots with overflow');
for (const [r, e, o] of summary) console.log(`  ${r.padEnd(28)} ${e} / ${o}`);
const bad = summary.filter(([, e, o]) => e || o).length;
console.log(bad ? `${bad} route(s) with errors or overflow` : 'all clean');
process.exit(bad ? 1 : 0);
