// Finds the match ids for the games in a scanned VOD, so they don't have to be
// looked up by hand. Give it the night the VOD was streamed; it lists that
// night's league games and pairs each one with a game the scan found, by game
// length (the same test locate() uses to sync a game to its video).
//
// Where the night's games come from:
// 1. the site's match cache, which the page reads and sends as `known` (instant,
//    but playoff games only, and only what Imprint parsed);
// 2. OpenDota, for anything still unmatched. SecretLeague is too small for
//    OpenDota's league listing (/leagues/19942/matches is empty), but league
//    lobbies are in each player's own match history. So we list a few players'
//    lobby games for the night and keep the ones in our league.

import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { CACHE, YTDLP, run, readJSON, writeJSON } from './util.mjs';
import { getScan } from './pipeline.mjs';

const API = 'https://api.opendota.com/api';
export const LEAGUE_ID = 19942; // the id the site uses for Imprint too (functions/api/imprint-sync.js)
const TOLERANCE = 60;           // seconds a game's length may be off, as in locate()
const MAX_LOOKUPS = 12;         // player histories per search; OpenDota allows 60 calls a minute without a key

// When was this VOD streamed? Twitch downloads are named TwitchVod-v<id>, so
// yt-dlp can read the stream's start without downloading. Otherwise, the file's date.
export async function vodDate(src) {
  const file = join(CACHE, 'vod-dates.json');
  const known = await readJSON(file, {});
  if (known[basename(src)]) return known[basename(src)];
  const id = /twitch\w*-v(\d+)/i.exec(basename(src))?.[1];
  if (id) {
    const r = await run(YTDLP, ['--skip-download', '--print', '%(timestamp)s', `https://www.twitch.tv/videos/${id}`], { stdout: true, quiet: true }).catch(() => null);
    const ts = +(r?.out?.toString().trim() || 0);
    if (ts > 0) {
      known[basename(src)] = { at: new Date(ts * 1000).toISOString(), from: 'twitch' };
      await writeJSON(file, known);
      return known[basename(src)];
    }
  }
  return { at: (await stat(src)).mtime.toISOString(), from: 'file' };
}

// A league night runs from the afternoon into the small hours (UTC, with room for BST).
const nightOf = (date) => {
  const from = Date.parse(`${date}T10:00:00Z`) / 1000;
  return { from, to: from + 20 * 3600 };
};

async function od(path) {
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`OpenDota said ${res.status}`);
  return res.json();
}

// `players`: account ids, best first (one per team; teams that played that night first).
// `known`: games from the site's cache: { matchId, at, duration (seconds), teams: [a, b] }.
export async function findMatches({ src, date, players = [], known = [] }) {
  const scan = await getScan(src);
  if (!scan) throw new Error('Scan this video first');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Pick the night the VOD was streamed');
  const { from, to } = nightOf(date);
  const games = scan.games;

  const cands = new Map();
  for (const k of known) {
    const at = Date.parse(k.at) / 1000;
    if (at >= from && at < to && k.duration > 0) cands.set(String(k.matchId), { ...k, matchId: String(k.matchId), from: 'site' });
  }
  const allMatched = () => games.every((g) => [...cands.values()].some((c) => Math.abs(g.gameEnd - c.duration) <= TOLERANCE));

  // Only ask OpenDota if the cache didn't cover every game.
  const covered = new Set(), checked = new Set(cands.keys());
  let lookups = 0, odError = null;
  const days = Math.ceil((Date.now() / 1000 - from) / 86400) + 1;
  for (const id of players) {
    if (allMatched() || lookups >= MAX_LOOKUPS) break;
    if (covered.has(+id)) continue;
    lookups++;
    try {
      const list = await od(`players/${id}/matches?date=${days}&lobby_type=1&significant=0&project=start_time&project=duration`);
      for (const r of list) {
        if (r.start_time < from || r.start_time >= to || checked.has(String(r.match_id))) continue;
        checked.add(String(r.match_id));
        const m = await od(`matches/${r.match_id}`);
        m.players?.forEach((p) => p.account_id && covered.add(p.account_id));
        if (m.leagueid !== LEAGUE_ID) continue;
        cands.set(String(m.match_id), {
          matchId: String(m.match_id), at: new Date(m.start_time * 1000).toISOString(), duration: m.duration,
          teams: [m.radiant_name || 'Radiant', m.dire_name || 'Dire'], from: 'opendota',
        });
      }
    } catch (e) { odError = e.message; break; }
  }

  // Pair closest lengths first, each match used once.
  const list = [...cands.values()].sort((a, b) => a.at.localeCompare(b.at));
  const pairs = games.flatMap((g, i) => list.map((c) => ({ i, c, diff: Math.abs(g.gameEnd - c.duration) })))
    .filter((p) => p.diff <= TOLERANCE).sort((a, b) => a.diff - b.diff);
  const pick = new Map(), used = new Set();
  for (const p of pairs) if (!pick.has(p.i) && !used.has(p.c.matchId)) { pick.set(p.i, p); used.add(p.c.matchId); }

  return {
    date, lookups, odError,
    matches: list,
    games: games.map((g, i) => ({
      vodStart: g.vodStart, vodEnd: g.vodEnd, gameEnd: g.gameEnd,
      pick: pick.get(i)?.c.matchId || null,
      diff: pick.has(i) ? Math.round(pick.get(i).diff) : null,
      // Another match within 20s of the pick: worth a second look.
      unsure: pick.has(i) && pairs.some((p) => p.i === i && p.c.matchId !== pick.get(i).c.matchId && p.diff - pick.get(i).diff < 20),
    })),
  };
}
