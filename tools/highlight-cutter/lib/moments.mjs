// Turns an OpenDota parsed match into a ranked list of "moments" — the bits of
// the game worth showing. Everything is in game time (seconds from the horn,
// the same clock the HUD shows); sync.mjs maps it onto the VOD afterwards.
//
// Kills come from each player's kills_log, objectives from match.objectives.
// Kills close together are merged into one moment, so a teamfight is one clip.
// The weights below are the whole "taste" of the auto-picker — tweak them here.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const WEIGHTS = {
  kill: 10,
  extraKillInFight: 6,   // each kill after the 2nd in one moment
  multiKill: { 2: 6, 3: 15, 4: 25, 5: 40 },
  firstBlood: 6,
  roshan: 12,
  aegisStolen: 20,
  barracks: 8,
  tower: 2,
  ancient: 40,           // game-ending push, always wanted
  buyback: 4,
  comeback: 10,          // kills won by the team behind by 5k+ gold
  lateGame: 1.2,         // multiplier after 30:00
};

const MERGE_GAP = 20;    // seconds between events before they become separate moments
const MULTI_WINDOW = 18; // Dota's own multi-kill window, near enough
const LEAD_IN = 12;      // seconds of build-up before the first event
const TAIL = 6;          // seconds after the last event (audio trim can extend)
const MIN_SCORE = 14;   // auto-pick floor: a single kill (10) needs something extra to make the cut

let heroNames;
function heroes() {
  if (heroNames) return heroNames;
  heroNames = new Map();
  // Reuse the stat designer's hero table rather than keeping a second copy.
  const src = readFileSync(join(HERE, '..', '..', 'stat-designer', 'heroes.js'), 'utf8');
  for (const m of src.matchAll(/\[(\d+),"([^"]+)","([a-z0-9_]+)"/g)) {
    heroNames.set(+m[1], m[2]);
    heroNames.set(`npc_dota_hero_${m[3]}`, m[2]);
  }
  return heroNames;
}
const heroName = (k) => heroes().get(k) || String(k).replace('npc_dota_hero_', '').replace(/_/g, ' ');

const fmt = (s) => `${s < 0 ? '-' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(Math.round(s)) % 60).padStart(2, '0')}`;
export { fmt as fmtClock };

export function teamNames(match) {
  return {
    radiant: match.radiant_name || match.radiant_team?.name || 'Radiant',
    dire: match.dire_name || match.dire_team?.name || 'Dire',
  };
}

export function buildMoments(match) {
  const names = teamNames(match);
  const side = (radiant) => (radiant ? names.radiant : names.dire);
  const goldAdv = match.radiant_gold_adv || [];
  const advAt = (t) => goldAdv[Math.max(0, Math.min(goldAdv.length - 1, Math.floor(t / 60)))] || 0;

  const events = [];
  for (const p of match.players) {
    const radiant = p.player_slot < 128;
    const log = (p.kills_log || []).slice().sort((a, b) => a.time - b.time);
    for (const k of log) {
      if (!String(k.key).startsWith('npc_dota_hero_')) continue;
      events.push({ t: k.time, kind: 'kill', radiant, hero: heroName(p.hero_id), victim: heroName(k.key) });
    }
    // Multi-kills: count streaks of kills by one hero inside the window.
    let run = [];
    for (const k of log) {
      run = run.filter((r) => k.time - r.time <= MULTI_WINDOW);
      run.push(k);
      if (run.length >= 2) events.push({ t: k.time, kind: 'multi', n: run.length, radiant, hero: heroName(p.hero_id) });
    }
    for (const b of p.buyback_log || []) events.push({ t: b.time, kind: 'buyback', radiant, hero: heroName(p.hero_id) });
  }
  for (const o of match.objectives || []) {
    const t = o.time;
    if (o.type === 'CHAT_MESSAGE_FIRSTBLOOD') events.push({ t, kind: 'firstblood' });
    else if (o.type === 'CHAT_MESSAGE_ROSHAN_KILL') events.push({ t, kind: 'roshan', radiant: o.team === 2 });
    else if (o.type === 'CHAT_MESSAGE_AEGIS_STOLEN') events.push({ t, kind: 'aegisStolen' });
    else if (o.type === 'building_kill') {
      const k = o.key || '';
      const lostRadiant = k.includes('goodguys');
      if (k.includes('_fort')) events.push({ t, kind: 'ancient', radiant: !lostRadiant });
      else if (k.includes('rax')) events.push({ t, kind: 'barracks', radiant: !lostRadiant });
      else if (k.includes('tower')) events.push({ t, kind: 'tower', radiant: !lostRadiant });
    }
  }
  // The ancient isn't always in objectives; the match end always is.
  if (!events.some((e) => e.kind === 'ancient')) events.push({ t: match.duration, kind: 'ancient', radiant: match.radiant_win });
  events.sort((a, b) => a.t - b.t);

  // Merge into moments. Towers alone don't open a moment — they only join one.
  const moments = [];
  let cur = null;
  for (const e of events) {
    if (cur && e.t - cur.end <= MERGE_GAP) { cur.events.push(e); cur.end = Math.max(cur.end, e.t); continue; }
    if (e.kind === 'tower' || e.kind === 'buyback') continue;
    cur = { start: e.t, end: e.t, events: [e] };
    moments.push(cur);
  }

  const out = moments.map((m, i) => scoreMoment(m, i, side, advAt, match));
  return out;
}

function scoreMoment(m, i, side, advAt, match) {
  const W = WEIGHTS;
  const kills = m.events.filter((e) => e.kind === 'kill');
  const by = { r: kills.filter((k) => k.radiant).length, d: kills.filter((k) => !k.radiant).length };
  let score = kills.length * W.kill + Math.max(0, kills.length - 2) * W.extraKillInFight;
  const tags = [];

  const best = m.events.filter((e) => e.kind === 'multi').sort((a, b) => b.n - a.n)[0];
  if (best) { score += W.multiKill[Math.min(5, best.n)] || 0; }
  const has = (k) => m.events.filter((e) => e.kind === k);
  if (has('firstblood').length) { score += W.firstBlood; tags.push('First blood'); }
  if (has('roshan').length) { score += W.roshan; tags.push(`Roshan (${side(has('roshan')[0].radiant)})`); }
  if (has('aegisStolen').length) { score += W.aegisStolen; tags.push('Aegis stolen'); }
  const rax = has('barracks');
  if (rax.length) { score += rax.length * W.barracks; tags.push(`Barracks (${side(rax[0].radiant)})`); }
  score += has('tower').length * W.tower;
  score += has('buyback').length * W.buyback;
  const ancient = has('ancient')[0];
  if (ancient) { score += W.ancient; tags.push(`GG — ${side(ancient.radiant)} win`); }

  // Comeback: the side that was behind on gold won the fight.
  const adv = advAt(m.start);
  if (kills.length >= 2 && ((adv < -5000 && by.r > by.d) || (adv > 5000 && by.d > by.r))) {
    score += W.comeback; tags.push('Comeback');
  }
  if (m.start > 1800) score *= W.lateGame;

  let label;
  if (best && best.n >= 3) label = `${best.hero} ${['', '', 'double', 'triple', 'ultra', 'RAMPAGE'][Math.min(5, best.n)]} kill`;
  else if (kills.length >= 3) label = by.r === by.d ? `Teamfight ${by.r}–${by.d}` : `Teamfight to ${side(by.r > by.d)} ${Math.max(by.r, by.d)}–${Math.min(by.r, by.d)}`;
  else if (kills.length) label = kills.length === 1 ? `${kills[0].hero} kills ${kills[0].victim}` : `${kills.map((k) => k.hero).join(' + ')} pick-offs`;
  else label = tags[0] || 'Objective';
  if (tags.length && !label.startsWith(tags[0])) label += ` · ${tags.join(' · ')}`;

  // Use OpenDota's own teamfight bounds when they contain this moment — they
  // start at the first damage, which is a better cut-in than the first kill.
  const tf = (match.teamfights || []).find((f) => f.start <= m.start + 5 && f.end >= m.start - 5);
  const start = Math.max(-90, Math.min(m.start - LEAD_IN, tf ? tf.start - 4 : Infinity));
  const end = ancient ? Math.max(m.end, ancient.t) + 8 : m.end + TAIL;

  return {
    id: `m${i}`,
    start, end,
    score: Math.round(score),
    label,
    kills: { radiant: by.r, dire: by.d },
    ending: !!ancient,
  };
}

// Pick clips for a time budget: always the ending, then best-first, shown in game order.
export function pickForBudget(moments, budgetSec) {
  const ranked = moments.slice().sort((a, b) => (b.ending - a.ending) || (b.score - a.score));
  const picked = [];
  let used = 0;
  for (const m of ranked) {
    const len = m.end - m.start;
    if (m.score < MIN_SCORE && !m.ending) continue; // lone pick-offs are filler
    if (used + len > budgetSec && !m.ending) continue;
    picked.push(m.id); used += len;
  }
  return new Set(picked);
}
