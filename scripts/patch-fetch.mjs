// One-off: bake a Dota 2 patch from Valve's public datafeed into src/data/patches/<ver>.json.
// Usage: node scripts/patch-fetch.mjs [version=7.42] [--verify]
//   --verify  HEAD-checks every hero/item/ability icon on Valve's CDN (slow, ~700 requests).
// Note text format: plain text, **bold** markers (see src/data/patches/helpers.mjs).
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cleanNote, classifyLine } from '../src/data/patches/helpers.mjs';

const args = process.argv.slice(2);
const VERIFY = args.includes('--verify');
const VERSION = args.find((a) => !a.startsWith('--')) ?? '7.42';
const FEED = 'https://www.dota2.com/datafeed';
const CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'patches');
const ATTR = ['strength', 'agility', 'intelligence', 'universal'];

async function feed(name, q = '') {
  const r = await fetch(`${FEED}/${name}?${q}${q ? '&' : ''}language=english`);
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  const j = await r.json();
  return j.result?.data ?? j; // patchnotes is flat, the lists are under result.data
}

const patch = await feed('patchnotes', `version=${VERSION}`);
const heroList = (await feed('herolist')).heroes;
const abilList = (await feed('abilitylist')).itemabilities; // all abilities AND items, with ids
const itemList = (await feed('itemlist')).itemabilities;

const heroById = new Map(heroList.map((h) => [h.id, h]));
const abilById = new Map(abilList.map((a) => [a.id, a]));
const itemById = new Map(itemList.map((a) => [a.id, a]));

function lines(notes = []) {
  const out = [];
  for (const n of notes) {
    const text = cleanNote(n.note);
    if (!text) continue; // bare <br> spacers
    const line = { text, indent: n.indent_level ?? 1 };
    if (n.hide_dot) {
      line.heading = true;
      line.kind = 'neutral';
      line.magnitude = 1;
      out.push(line);
      continue;
    }
    if (n.info) line.info = cleanNote(n.info);
    if (n.aghanims) line.aghs = n.aghanims; // 'scepter' | 'shard'
    if (n.icon) line.stat = n.icon;
    const c = classifyLine(text);
    line.kind = c.kind;
    line.magnitude = c.magnitude;
    out.push(line);
  }
  return out;
}

function summarise(all) {
  const s = { buff: 0, nerf: 0, rework: 0, neutral: 0, score: 0 };
  for (const l of all) {
    if (l.heading) continue;
    s[l.kind]++;
    if (l.kind === 'buff') s.score += l.magnitude;
    if (l.kind === 'nerf') s.score -= l.magnitude;
  }
  return s;
}

// ---- general
const general = patch.general_notes.map((g) => ({ title: cleanNote(g.title), lines: lines(g.generic) }));

// ---- heroes (hero 1961 is Lone Druid's Spirit Bear: no herolist entry, folded into Lone Druid #80)
const BEAR_ID = 1961;
const LONE_DRUID = 80;
const heroes = [];
let bearEntry = null;
for (const h of patch.heroes) {
  const meta = heroById.get(h.hero_id === BEAR_ID ? LONE_DRUID : h.hero_id);
  if (!meta) throw new Error(`no herolist entry for hero ${h.hero_id}`);
  const shortName = meta.name.replace('npc_dota_hero_', '');
  const abilities = (h.abilities ?? []).map((a) => {
    const m = abilById.get(a.ability_id);
    const nm = m?.name ?? `ability_${a.ability_id}`;
    return {
      id: a.ability_id,
      name: m?.name_english_loc || nm,
      shortName: nm,
      icon: `${CDN}/abilities/${nm}.png`,
      lines: lines(a.ability_notes),
    };
  });
  const entry = {
    id: meta.id,
    name: meta.name_english_loc,
    shortName,
    icon: `${CDN}/heroes/${shortName}.png`,
    attribute: ATTR[meta.primary_attr] ?? null,
    notes: lines(h.hero_notes),
    talents: lines(h.talent_notes),
    abilities,
  };
  if (h.hero_id === BEAR_ID) bearEntry = entry;
  else heroes.push(entry);
}
if (bearEntry) {
  const lone = heroes.find((x) => x.id === LONE_DRUID);
  lone.notes.push(...bearEntry.notes.map((l) => ({ ...l, text: `Spirit Bear: ${l.text}` })));
  lone.abilities.push(...bearEntry.abilities);
}
for (const h of heroes) {
  h.summary = summarise([...h.notes, ...h.talents, ...h.abilities.flatMap((a) => a.lines)]);
}
heroes.sort((a, b) => a.name.localeCompare(b.name));

// ---- items (title-only rows with ability_id -1 are group headings; titled rows with an id are "New/Returning" labels)
function itemEntry(x, group) {
  const meta = itemById.get(x.ability_id) ?? abilById.get(x.ability_id);
  if (!meta) throw new Error(`no item meta for ${x.ability_id}`);
  const shortName = meta.name.replace(/^item_/, '');
  const e = {
    id: x.ability_id,
    name: meta.name_english_loc,
    shortName,
    icon: `${CDN}/items/${shortName}.png`,
  };
  if (x.title) e.label = cleanNote(x.title);
  if (group) e.group = group;
  e.lines = lines(x.ability_notes);
  e.summary = summarise(e.lines);
  return e;
}
let group = null;
const items = [];
for (const x of patch.items) {
  if (x.ability_id === -1) {
    group = cleanNote(x.title);
    continue;
  }
  items.push(itemEntry(x, group));
}

// ---- neutral items
const nSections = [];
const nItems = [];
for (const x of patch.neutral_items) {
  if (x.ability_id === -1) {
    nSections.push({ title: cleanNote(x.title), lines: lines(x.ability_notes) });
    continue;
  }
  nItems.push(itemEntry(x, null));
}

// ---- neutral creeps
const cSections = [];
const creeps = [];
for (const c of patch.neutral_creeps) {
  if (c.is_general_note) {
    cSections.push({ title: cleanNote(c.localized_name), lines: lines(c.neutral_creep_notes) });
    continue;
  }
  const e = { name: c.localized_name, shortName: c.name.replace('npc_dota_neutral_', ''), lines: lines(c.neutral_creep_notes) };
  e.summary = summarise(e.lines);
  creeps.push(e);
}

const data = {
  version: String(patch.patch_number ?? VERSION),
  name: patch.patch_name ?? VERSION,
  timestamp: patch.patch_timestamp,
  general,
  heroes,
  items,
  neutral_items: { sections: nSections, items: nItems },
  neutral_creeps: { sections: cSections, creeps },
};

if (VERIFY) {
  const targets = [
    ...heroes.map((h) => ['hero', h]),
    ...items.concat(nItems).map((i) => ['item', i]),
    ...heroes.flatMap((h) => h.abilities.map((a) => ['ability', a])),
  ];
  let bad = 0;
  for (let i = 0; i < targets.length; i += 20) {
    await Promise.all(
      targets.slice(i, i + 20).map(async ([kind, o]) => {
        const r = await fetch(o.icon, { method: 'HEAD' });
        if (!r.ok) {
          console.warn(`404 ${kind} ${o.name}: ${o.icon}`);
          bad++;
          if (kind === 'ability') o.icon = null;
        }
      }),
    );
  }
  console.log(`verified ${targets.length} icons, ${bad} missing`);
}

await mkdir(OUT, { recursive: true });
const file = path.join(OUT, `${VERSION}.json`);
await writeFile(file, JSON.stringify(data, null, 1) + '\n');
console.log(`wrote ${file}: heroes ${heroes.length}, items ${items.length}, neutral items ${nItems.length}, creeps ${creeps.length}`);
