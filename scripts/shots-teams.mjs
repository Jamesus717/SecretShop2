// Screenshots for Team Info / Profile / Register at 1280 + 375, dark + light.
// Usage: node scripts/shots-teams.mjs [baseUrl]   (needs puppeteer-core resolvable, e.g. NODE_PATH, and Edge installed)
// Reports console errors and horizontal overflow per shot. Never submits anything.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:5191';
const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = process.env.OUT_DIR || 'docs/redesign/screens';
mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['teaminfo', '/team-info'],
  ['teaminfo-modal', '/team-info?team=FarmVille'],
  ['profile', '/profile'],
  ['register', '/register'],
  ['register-form', '/register?forceopen=1'],
];
const SIZES = [[1280, 900], [375, 812]];

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new' });
let bad = 0;
for (const [name, path] of PAGES) {
  for (const [w, h] of SIZES) {
    for (const theme of ['dark', 'light']) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: h });
      await page.evaluateOnNewDocument((t) => { try { localStorage.setItem('theme', t); } catch { /* ignore */ } }, theme);
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 60000 }).catch((e) => errors.push('goto: ' + e.message));
      await page.addStyleTag({ content: '* { transition: none !important; animation: none !important }' });
      // Rosters can take a while on a cold Apps Script.
      if (name.startsWith('teaminfo')) await page.waitForSelector('button[aria-label^="View roster"], [role="alert"]', { timeout: 40000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 600));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const file = `${OUT}/${name}-${w}-${theme}.png`;
      await page.screenshot({ path: file, fullPage: name !== 'teaminfo-modal' });
      // Console errors from the Apps Script / Supabase being unreachable are reported but not page bugs.
      console.log(`${file}  overflow=${overflow}  errors=${errors.length}`);
      errors.forEach((e) => console.log('   ! ' + e.slice(0, 200)));
      if (overflow > 0 || errors.length) bad++;
      await page.close();
    }
  }
}
await browser.close();
console.log(bad ? `${bad} shots with overflow or errors` : 'all clean');
