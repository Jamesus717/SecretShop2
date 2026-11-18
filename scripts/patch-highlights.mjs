// One-off: write src/data/patches/7.42.highlights.json from 7.42.json.
// Hand-picked: crazyChanges (blurb is hand-written, `line` is Valve's exact text and is checked
// against the baked patch so a number can never drift). Derived: topBuffs, topNerfs, heroVerdicts
// (scored from the per-line kind/magnitude in 7.42.json; blurbs are Valve's own lines).
// Usage: node scripts/patch-highlights.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'patches');
const patch = JSON.parse(await readFile(path.join(dir, '7.42.json'), 'utf8'));

// every Valve line, with its owner
const owners = [];
for (const g of patch.general) for (const l of g.lines) owners.push({ type: 'general', ref: g.title, name: g.title, sub: g.title, l });
for (const h of patch.heroes) {
  const own = { type: 'hero', ref: h.shortName, name: h.name };
  for (const l of h.notes) owners.push({ ...own, sub: '', l });
  for (const l of h.talents) owners.push({ ...own, sub: 'Talent', l });
  for (const a of h.abilities) for (const l of a.lines) owners.push({ ...own, sub: a.name, l });
}
for (const i of patch.items) for (const l of i.lines) owners.push({ type: 'item', ref: i.shortName, name: i.name, sub: '', l });
for (const i of patch.neutral_items.items) for (const l of i.lines) owners.push({ type: 'neutral_item', ref: i.shortName, name: i.name, sub: '', l });

function requireLine(type, ref, text) {
  const hit = owners.find((o) => o.type === type && o.ref === ref && o.l.text === text);
  if (!hit) throw new Error(`Valve line not found for ${type}/${ref}: ${text}`);
  return hit;
}

// ---- Crazy Changes (hand-picked, 12). `line` = Valve's exact text, `blurb` = ours.
const CRAZY = [
  ['general', 'Global Mechanics', 'Base hero Health increased from 120 to 200', 'Every hero starts the game much beefier: base Health 120 to 200, while Strength gives less per point (22 to 20).'],
  ['general', 'Global Mechanics', 'Illusions have a default Item Potency of 20% and can now apply most item on hit effects', 'Illusions can finally use on-hit items. New stat "Item Potency" decides how strong, 20% for illusions by default.'],
  ['general', 'Global Mechanics', 'Passive gold per minute no longer scales over game time', 'Passive gold is now flat all game (90 a minute), and everyone passively earns 50 XP a minute after the horn.'],
  ['hero', 'meepo', 'Meepo is now a Universal hero', 'Meepo goes Universal, loses MegaMeepo, and drops 9 base damage.'],
  ['hero', 'juggernaut', 'Removed Swiftslash ability', 'Juggernaut loses Swiftslash entirely, and Blade Fury now fully disarms him.'],
  ['hero', 'medusa', 'Damage Over Time decreased from 100 to 12/24/36/48', 'Gorgon\'s Grasp flips from Physical to Magical, casts in 0.2s, and trades its DoT (100 to 12/24/36/48) for a much bigger hit (30/70/110/150 to 60/120/180/240).'],
  ['hero', 'batrider', 'Max stacks decreased from 20 to 10', 'Sticky Napalm: half the max stacks (20 to 10), but each stack hits much harder (2.5/5/7.5/10 to 6/12/18/24 damage).'],
  ['hero', 'dazzle', 'Min Duration decreased from 5s to 1s', 'Nothl Projection can now be ended after just 1s (was 5s) and travels faster (1200 to 1700).'],
  ['item', 'horn_of_battle_greater', 'Global Cast Range. No Mana Cost. No cooldown', 'New Greater Horn of Battle drops from Tormentor: global cast, no cooldown, summons mega creeps with a siege unit and flagbearer on every lane.'],
  ['general', 'Roshan', 'Base respawn timer now decreases by 1 minute every time Roshan is defeated, to a minimum of 5 minutes', 'Roshan comes back faster every time he dies, down to a 5 minute minimum.'],
  ['general', 'Miscellaneous', 'Dire fountain moved ~300 units closer to the Dire Ancient', 'The map itself moved: the Dire fountain slides ~300 units closer to the Ancient, and Twin Gates go to the top and bottom rims.'],
  ['item', 'bloodthorn', 'Recipe cost increased from 600 to 1350. Total cost decreased from 6400g to 6250g', 'Bloodthorn\'s recipe more than doubles (600 to 1350) yet the full item gets cheaper (6400g to 6250g).'],
];

const crazyChanges = CRAZY.map(([type, ref, line, blurb], i) => {
  // general lines live under their own sub-heading, so match any general section
  const hit =
    type === 'general'
      ? owners.find((o) => o.type === 'general' && o.l.text === line)
      : requireLine(type, ref, line);
  if (!hit) throw new Error(`Valve line not found: ${line}`);
  const entry = { id: i + 1, type, ref: type === 'general' ? ref : hit.ref, name: hit.name, blurb, line };
  if (type === 'hero') entry.icon = patch.heroes.find((h) => h.shortName === ref).icon;
  if (type === 'item') entry.icon = patch.items.find((x) => x.shortName === ref).icon;
  return entry;
});

// ---- scoring
function score(os) {
  let buff = 0, nerf = 0, rework = 0;
  for (const { l } of os) {
    if (l.heading) continue;
    if (l.kind === 'buff') buff += l.magnitude;
    else if (l.kind === 'nerf') nerf += l.magnitude;
    else if (l.kind === 'rework') rework++;
  }
  return { buff, nerf, rework, net: buff - nerf };
}
function bestLines(os, kind, n = 2) {
  return os
    .filter(({ l }) => !l.heading && l.kind === kind)
    .sort((a, b) => (a.sub === 'Talent') - (b.sub === 'Talent') || b.l.magnitude - a.l.magnitude)
    .slice(0, n)
    .map(({ sub, l }) => (sub ? `${sub}: ${l.text}` : l.text));
}
const group = (type) => {
  const m = new Map();
  for (const o of owners.filter((x) => x.type === type)) {
    if (!m.has(o.ref)) m.set(o.ref, []);
    m.get(o.ref).push(o);
  }
  return m;
};
const heroOwners = group('hero');
const itemOwners = group('item');

const rows = [];
for (const [ref, os] of heroOwners) {
  const h = patch.heroes.find((x) => x.shortName === ref);
  rows.push({ type: 'hero', ref, name: h.name, icon: h.icon, os, ...score(os) });
}
for (const [ref, os] of itemOwners) {
  const i = patch.items.find((x) => x.shortName === ref);
  // cost-only shuffles are not real buffs/nerfs: ignore items whose changes are all cost lines
  rows.push({ type: 'item', ref, name: i.name, icon: i.icon, os, ...score(os.filter((o) => !/cost/i.test(o.l.text))) });
}
const pick = (kind) =>
  [...rows]
    .sort((a, b) => (kind === 'buff' ? b.net - a.net : a.net - b.net))
    .slice(0, 10)
    .map((r) => ({ type: r.type, ref: r.ref, name: r.name, icon: r.icon, score: r.net, lines: bestLines(r.os, kind) }));
const topBuffs = pick('buff');
const topNerfs = pick('nerf');

// ---- hero verdicts
const heroVerdicts = {};
for (const r of rows.filter((x) => x.type === 'hero')) {
  const { buff, nerf, rework, net } = r;
  let verdict;
  if (buff >= 3 && nerf >= 3 && Math.min(buff, nerf) / Math.max(buff, nerf) >= 0.5) verdict = 'mixed';
  else if (net >= 2) verdict = 'buffed';
  else if (net <= -2) verdict = 'nerfed';
  else if (rework >= 3) verdict = 'reworked';
  else verdict = 'mixed';
  const first = verdict === 'reworked' ? bestLines(r.os, 'rework', 2) : bestLines(r.os, verdict === 'nerfed' ? 'nerf' : 'buff', 2);
  const line = first.length ? first.join(' | ') : bestLines(r.os, 'rework', 1).join(' | ');
  heroVerdicts[r.ref] = { verdict, net, line };
}

const out = { version: patch.version, crazyChanges, topBuffs, topNerfs, heroVerdicts };
await writeFile(path.join(dir, '7.42.highlights.json'), JSON.stringify(out, null, 1) + '\n');
const vc = {};
Object.values(heroVerdicts).forEach((v) => (vc[v.verdict] = (vc[v.verdict] || 0) + 1));
console.log('crazy', crazyChanges.length, 'verdicts', Object.keys(heroVerdicts).length, vc);
console.log('buffs:', topBuffs.map((b) => `${b.name} ${b.score}`).join(', '));
console.log('nerfs:', topNerfs.map((b) => `${b.name} ${b.score}`).join(', '));
