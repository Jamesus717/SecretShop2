// The glue: scan a source → match it to the series' games → turn picked
// moments into VOD segments → render the YouTube cut and the Shorts.

import { join, basename } from 'node:path';
import { stat, mkdir } from 'node:fs/promises';
import { CACHE, OUT, ASSETS, readJSON, writeJSON, probe } from './util.mjs';
import { scanVideo, buildRuns } from './clock.mjs';
import { levelMeter, extendEnd } from './audio.mjs';
import { getMatch } from './opendota.mjs';
import { buildMoments, pickForBudget, teamNames } from './moments.mjs';
import { cutSegment, stillCard, concat, duration, cleanup, thumbnail, posterFrames } from './render.mjs';

// --- scanning ---------------------------------------------------------------

const scanFile = async (src) => {
  const s = await stat(src);
  return join(CACHE, 'scans', `${basename(src).replace(/[^\w.-]/g, '_')}-${s.size}.json`);
};

export async function getScan(src) {
  return readJSON(await scanFile(src), null);
}

export async function scanSource(src, update) {
  const { duration: dur } = await probe(src);
  update(0, 'Reading the game clock and caster volume…');
  const audio = levelMeter();
  const samples = await scanVideo(src, { duration: dur, audio, onProgress: (p) => update(p, `Reading the game clock and caster volume… ${Math.round(p * 100)}%`) });
  const games = buildRuns(samples);
  const scan = { src, duration: dur, scannedAt: new Date().toISOString(), games, levels: audio.levels };
  await writeJSON(await scanFile(src), scan);
  return summarize(scan);
}

export const summarize = (scan) => scan && {
  duration: scan.duration,
  games: scan.games.map((g) => ({ vodStart: g.vodStart, vodEnd: g.vodEnd, gameEnd: g.gameEnd, pauses: g.runs.length - 1 })),
};

// --- matching games ---------------------------------------------------------

// Load OpenDota data for a game and (re)build its moment list, keeping the
// user's choices for moments that still exist.
export async function loadGame(game, budgetSec) {
  const match = await getMatch(game.matchId);
  const names = teamNames(match);
  const moments = buildMoments(match);
  // Custom moments (the draft, anything marked by hand) aren't in the match data; keep them as they are.
  const custom = (game.moments || []).filter((m) => m.custom);
  const old = new Map((game.moments || []).filter((m) => !m.custom).map((m) => [m.id, m]));
  const auto = pickForBudget(moments, budgetSec);
  game.radiant = names.radiant;
  game.dire = names.dire;
  game.winner = match.radiant_win ? names.radiant : names.dire;
  game.duration = match.duration;
  game.moments = moments.map((m) => {
    const o = old.get(m.id);
    return o ? { ...m, long: o.long, short: o.short, startAdj: o.startAdj || 0, endAdj: o.endAdj || 0 }
      : { ...m, long: auto.has(m.id), short: false, startAdj: 0, endAdj: 0 };
  }).concat(custom);
  // Shorts default: the three best non-ending moments, plus the ending if it's big.
  if (!old.size) {
    const best = game.moments.filter((m) => !m.ending).sort((a, b) => b.score - a.score).slice(0, 2);
    best.forEach((m) => (m.short = true));
  }
  return game;
}

// Which detected game in the source is this match? The one whose clock ran
// to (nearly) the match's length — OpenDota's duration is the horn→ancient time.
export async function locate(game) {
  if (!game.source || !game.duration) return null;
  const scan = await getScan(game.source);
  if (!scan) return null;
  const pick = scan.games
    .map((g, i) => ({ i, diff: Math.abs(g.gameEnd - game.duration) }))
    .sort((a, b) => a.diff - b.diff)[0];
  if (!pick || pick.diff > 60) return { scan, detected: null };
  return { scan, detected: scan.games[pick.i], index: pick.i };
}

// Game-time range → list of VOD [start, end] pieces, skipping pauses.
export function segmentsFor(runs, gs, ge) {
  const out = [];
  for (const [i, r] of runs.entries()) {
    // Each run owns game time up to where the next one starts (the pause point).
    const a = Math.max(gs, i === 0 ? -Infinity : r.gameStart);
    const b = Math.min(ge, i === runs.length - 1 ? Infinity : runs[i + 1].gameStart);
    if (b - a > 0.5) out.push([+(a + r.offset).toFixed(2), +(b + r.offset).toFixed(2)]);
  }
  return out;
}

export async function planGame(game, { extend = true } = {}) {
  const loc = await locate(game);
  if (!loc || !loc.detected) return null;
  const { runs } = loc.detected;
  return game.moments.map((m) => {
    // Custom moments are marked in VOD time (the draft has no game clock), so they play exactly as marked.
    if (m.vod) {
      const a = m.start + (m.startAdj || 0), b = m.end + (m.endAdj || 0);
      const segs = b - a > 0.5 ? [[+a.toFixed(2), +b.toFixed(2)]] : [];
      return { id: m.id, segs, len: segs.length ? b - a : 0 };
    }
    const gs = m.start + (m.startAdj || 0), ge = m.end + (m.endAdj || 0);
    const segs = segmentsFor(runs, gs, ge);
    if (extend && segs.length && !m.endAdj) {
      const last = segs[segs.length - 1];
      last[1] = Math.min(extendEnd(loc.scan.levels, last[0], last[1], m.ending ? 4 : 10), loc.detected.vodEnd + 15);
    }
    return { id: m.id, segs, len: segs.reduce((s, [a, b]) => s + b - a, 0) };
  });
}

// --- rendering --------------------------------------------------------------

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'clip';
const asset = (name) => (name ? join(ASSETS, basename(name)) : null);
const CARD = { intro: 6, before: 4, after: 7, outro: 8 };
const AUTO_PENDING = '(auto)';

export async function planLong(project) {
  const parts = [];
  if (project.cards?.intro) parts.push({ card: project.cards.intro, dur: CARD.intro });
  for (const [gi, game] of project.games.entries()) {
    const plan = await planGame(game);
    if (!plan) throw new Error(`Game ${gi + 1} isn't synced to a video yet`);
    const cards = project.cards?.games?.[gi] || {};
    const before = cards.before || project.cards?.auto?.[`game${gi + 1}`];
    // The page draws the auto title card just before rendering; count it now so the length estimate is right.
    parts.push({ card: before || AUTO_PENDING, dur: CARD.before });
    const byId = new Map(plan.map((p) => [p.id, p]));
    // In VOD order, so the draft comes first and custom moments slot in between the auto ones.
    const vodAt = (m) => byId.get(m.id).segs[0]?.[0] ?? Infinity;
    for (const m of game.moments.filter((x) => x.long).sort((a, b) => vodAt(a) - vodAt(b))) {
      for (const [a, b] of byId.get(m.id).segs) parts.push({ src: game.source, start: a, end: b, label: m.label, game: gi + 1 });
    }
    if (cards.after) parts.push({ card: cards.after, dur: CARD.after });
  }
  if (project.cards?.outro) parts.push({ card: project.cards.outro, dur: CARD.outro });
  const total = parts.reduce((s, p) => s + (p.card ? p.dur : p.end - p.start), 0);
  const target = project.settings?.targetSec || 1800;
  return { parts, total, target, padding: Math.max(0, target - total) };
}

export async function renderLong(project, update) {
  const plan = await planLong(project);
  const dir = join(OUT, project.id);
  const work = join(dir, '_work-long');
  await cleanup(work); await mkdir(work, { recursive: true });
  const files = [];
  const pieces = plan.parts.slice();
  const pad = project.cards?.padding || project.cards?.auto?.padding;
  if (plan.padding > 1 && pad) pieces.push({ card: pad, dur: plan.padding, padding: true });
  for (const [i, p] of pieces.entries()) {
    update(i / pieces.length, p.card ? (p.padding ? `Padding card (${Math.round(p.dur)}s)` : 'Card') : `Game ${p.game}: ${p.label}`);
    const out = join(work, `${String(i).padStart(3, '0')}.mp4`);
    if (p.card === AUTO_PENDING) throw new Error('A game title card is missing — render from the page so it can draw it');
    if (p.card) await stillCard({ image: asset(p.card), dur: p.dur, out });
    else await cutSegment({ src: p.src, start: p.start, end: p.end, out });
    files.push(out);
  }
  update(0.98, 'Joining…');
  const final = join(dir, `${slug(project.title)}-youtube.mp4`);
  await concat(files, final, work);
  const len = await duration(final);
  await cleanup(work);
  return { file: final, length: len, padded: plan.padding > 1 && !!pad };
}

export async function renderShorts(project, update, { only } = {}) {
  const dir = join(OUT, project.id, 'shorts');
  const work = join(dir, '_work');
  await mkdir(work, { recursive: true });
  const jobs = [];
  for (const [gi, game] of project.games.entries()) {
    const plan = await planGame(game);
    if (!plan) continue;
    const byId = new Map(plan.map((p) => [p.id, p]));
    for (const m of game.moments.filter((x) => x.short)) {
      const key = `g${gi + 1}-${m.id}`;
      if (only && !only.includes(key)) continue;
      jobs.push({ gi, m, key, segs: byId.get(m.id).segs, src: game.source });
    }
  }
  const made = [];
  const max = project.settings?.shortMax || 59;
  for (const [i, j] of jobs.entries()) {
    update(i / jobs.length, `Short ${i + 1}/${jobs.length}: ${j.m.label}`);
    // Shorts must stay under a minute: keep the end (the payoff), trim the start.
    let segs = j.segs.map((s) => s.slice());
    let len = segs.reduce((s, [a, b]) => s + b - a, 0);
    while (len > max && segs.length) {
      const cut = Math.min(len - max, segs[0][1] - segs[0][0]);
      segs[0][0] += cut; len -= cut;
      if (segs[0][1] - segs[0][0] < 0.5) segs.shift();
    }
    const overlay = asset(project.cards?.auto?.[`short-${j.key}`]);
    const parts = [];
    for (const [k, [a, b]] of segs.entries()) {
      const out = join(work, `${j.key}-${k}.mp4`);
      await cutSegment({ src: j.src, start: a, end: b, out, layout: '9x16', overlay, frame: project.settings?.shortFrame || 'zoom' });
      parts.push(out);
    }
    const final = join(dir, `${slug(project.title)}-g${j.gi + 1}-${slug(j.m.label)}.mp4`);
    // Thumbnail from ~70% through the clip — usually the payoff, not the build-up.
    // It also goes in as the Short's first frames, which is what Discord shows as the preview.
    const thumbOverlay = asset(project.cards?.auto?.[`thumb-${j.key}`]);
    const last = segs[segs.length - 1];
    if (thumbOverlay && last) {
      const jpg = final.replace(/\.mp4$/, '.jpg');
      await thumbnail({ src: j.src, t: last[0] + (last[1] - last[0]) * 0.7, out: jpg, frame: project.settings?.shortFrame || 'zoom', overlay: thumbOverlay });
      parts.unshift(await posterFrames({ image: jpg, out: join(work, `${j.key}-poster.mp4`) }));
    }
    await concat(parts, final, work);
    made.push(final);
  }
  await cleanup(work);
  return { files: made };
}
