// The glue: scan a source → match it to the series' games → turn picked
// moments into VOD segments → render the YouTube cut and the Shorts.

import { join, basename } from 'node:path';
import { stat, mkdir, writeFile, rm } from 'node:fs/promises';
import { CACHE, OUT, ASSETS, readJSON, writeJSON, probe } from './util.mjs';
import { scanVideo, buildRuns } from './clock.mjs';
import { levelMeter, extendEnd, findHype } from './audio.mjs';
import { getMatch } from './opendota.mjs';
import { buildMoments, pickForBudget, teamNames } from './moments.mjs';
import { cutSegment, stillCard, concat, duration, cleanup, thumbnail, posterFrames, POSTER_SEC } from './render.mjs';
import { prepareCaptions } from './captions.mjs';
// Shared with postcopy.mjs, which finds a Short's moment again from its file name.
import { slug } from './postcopy.mjs';

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
  const hype = await hypeMoments(game, moments, custom);
  game.moments = moments.concat(hype).map((m) => {
    const o = old.get(m.id);
    // Keep everything chosen in the page: ticks, trims, Short editor fine-tuning, captions on/off.
    return o ? { ...m, long: o.long, short: o.short, startAdj: o.startAdj || 0, endAdj: o.endAdj || 0,
      ...(o.shortStyle ? { shortStyle: o.shortStyle } : {}), ...(o.captions != null ? { captions: o.captions } : {}) }
      : { ...m, long: auto.has(m.id), short: false, startAdj: 0, endAdj: 0 };
  }).concat(custom);
  // Shorts default: the three best non-ending moments, plus the ending if it's big.
  if (!old.size) {
    const best = game.moments.filter((m) => !m.ending && !m.hype).sort((a, b) => b.score - a.score).slice(0, 2);
    best.forEach((m) => (m.short = true));
  }
  return game;
}

// Caster-hype moments: loud stretches of the scan's audio with no kill moment
// near them (see findHype). They need the game synced, so they come and go with
// the video: changing a game's video reloads it. In VOD time like custom moments,
// because the draft and post-game have no game clock. Never auto-ticked for the
// YouTube cut; the id is the VOD second, so ticks survive a reload.
const HYPE = { before: 600, after: 120, lead: 5, tail: 3, maxLen: 30 };
async function hypeMoments(game, moments, custom) {
  const loc = await locate(game).catch(() => null);
  if (!loc?.detected) return [];
  const { scan, detected: d, index } = loc;
  const avoid = moments.flatMap((m) => segmentsFor(d.runs, m.start, m.end)).concat(custom.filter((m) => m.vod).map((m) => [m.start, m.end]));
  // Don't reach into the previous or next game in the same VOD.
  const from = Math.max(d.vodStart - HYPE.before, (scan.games[index - 1]?.vodEnd ?? -Infinity) + HYPE.after);
  const to = Math.min(d.vodEnd + HYPE.after, scan.games[index + 1]?.vodStart ?? Infinity);
  // A pause sits between one run's end and the next one's start, at the same game time.
  const pauses = d.runs.slice(1).map((r, i) => [r.gameStart + d.runs[i].offset, r.gameStart + r.offset]);
  return findHype(scan.levels, { from, to, avoid }).map((h) => {
    const where = h.b <= d.vodStart + 2 ? 'Draft / pre-game' : h.a >= d.vodEnd - 2 ? 'Post-game'
      : pauses.some(([x, y]) => h.a < y && h.b > x) ? 'Pause' : 'Close call (no kills)';
    const start = Math.max(0, h.a - HYPE.lead), end = Math.min(h.b + HYPE.tail, start + HYPE.maxLen);
    return { id: `h${Math.round(h.a)}`, hype: true, vod: true, start: +start.toFixed(1), end: +end.toFixed(1), score: Math.round(h.excess / 4), label: `Caster hype · ${where}`, kills: { radiant: 0, dire: 0 }, ending: false };
  });
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
// `offsets`, if given, gets each piece's VOD−game offset (to turn a VOD time back into game time).
export function segmentsFor(runs, gs, ge, offsets) {
  const out = [];
  for (const [i, r] of runs.entries()) {
    // Each run owns game time up to where the next one starts (the pause point).
    const a = Math.max(gs, i === 0 ? -Infinity : r.gameStart);
    const b = Math.min(ge, i === runs.length - 1 ? Infinity : runs[i + 1].gameStart);
    if (b - a > 0.5) { out.push([+(a + r.offset).toFixed(2), +(b + r.offset).toFixed(2)]); offsets?.push(r.offset); }
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
      return { id: m.id, segs, len: segs.length ? b - a : 0, offsets: segs.map(() => 0) };
    }
    const gs = m.start + (m.startAdj || 0), ge = m.end + (m.endAdj || 0);
    const offsets = [];
    const segs = segmentsFor(runs, gs, ge, offsets);
    if (extend && segs.length && !m.endAdj) {
      const last = segs[segs.length - 1];
      last[1] = Math.min(extendEnd(loc.scan.levels, last[0], last[1], m.ending ? 4 : 10), loc.detected.vodEnd + 15);
    }
    return { id: m.id, segs, len: segs.reduce((s, [a, b]) => s + b - a, 0), offsets };
  });
}

// --- rendering --------------------------------------------------------------

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
    // A moment fine-tuned in the Short editor carries its own framing, left/right and thumbnail frame.
    const st = j.m.shortStyle || {};
    const frame = st.frame || project.settings?.shortFrame || 'zoom';
    const pan = frame === 'full' ? 0 : +st.pan || 0;
    const final = join(dir, `${slug(project.title)}-g${j.gi + 1}-${slug(j.m.label)}.mp4`);
    const parts = [];
    // Thumbnail from ~70% through the clip — usually the payoff, not the build-up.
    // It also goes in as the Short's first frames, which is what Discord shows as the preview.
    // Without a drawn thumbnail overlay it uses the Short's own header/footer, so
    // a Short never starts on black.
    const thumbOverlay = asset(project.cards?.auto?.[`thumb-${j.key}`]) || overlay;
    const last = segs[segs.length - 1];
    if (last) {
      const jpg = final.replace(/\.mp4$/, '.jpg');
      const picked = segs.some(([a, b]) => st.thumbAt >= a && st.thumbAt <= b) ? st.thumbAt : null;
      await thumbnail({ src: j.src, t: picked ?? last[0] + (last[1] - last[0]) * 0.7, out: jpg, frame, pan, overlay: thumbOverlay });
      parts.push(await posterFrames({ image: jpg, out: join(work, `${j.key}-poster.mp4`) }));
    }
    // Captions on or off per Short (set in the Short editor), else the series' setting.
    // Transcribed from the source first, then burned in by the same encode as the clip.
    let caps = null;
    if (j.m.captions ?? project.settings?.captions) {
      update((i + 0.2) / jobs.length, `Short ${i + 1}/${jobs.length}: captions…`);
      caps = await prepareCaptions(j.src, segs, { frame, work: join(work, 'captions'), lead: parts.length ? POSTER_SEC : 0 });
    }
    for (const [k, [a, b]] of segs.entries()) {
      const out = join(work, `${j.key}-${k}.mp4`);
      await cutSegment({ src: j.src, start: a, end: b, out, layout: '9x16', overlay, frame, pan, subs: caps?.subs[k] });
      parts.push(out);
    }
    await concat(parts, final, work);
    // The .srt beside the Short is what YouTube takes as its subtitle file.
    const srt = final.replace(/\.mp4$/, '.srt');
    if (caps?.srt) await writeFile(srt, caps.srt); else if (caps) await rm(srt, { force: true });
    made.push(final);
  }
  await cleanup(work);
  return { files: made };
}
