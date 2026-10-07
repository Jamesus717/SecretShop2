// OpenDota match fetch, cached on disk. A match only has kill logs and
// teamfights once OpenDota has parsed the replay; league lobbies usually are,
// but if not we ask it to parse (POST /request) and the page retries later.
// Valve drops replays after ~2 weeks, so request parses soon after the games.

import { join } from 'node:path';
import { CACHE, readJSON, writeJSON } from './util.mjs';

const API = 'https://api.opendota.com/api';

export async function getMatch(matchId, { refresh = false } = {}) {
  if (!/^\d{6,12}$/.test(String(matchId))) throw new Error('Match id should be a number');
  const file = join(CACHE, 'opendota', `${matchId}.json`);
  if (!refresh) {
    const cached = await readJSON(file, null);
    if (cached && isParsed(cached)) return cached;
  }
  const res = await fetch(`${API}/matches/${matchId}`);
  if (!res.ok) throw new Error(`OpenDota said ${res.status} for match ${matchId}`);
  const match = await res.json();
  if (!isParsed(match)) {
    await fetch(`${API}/request/${matchId}`, { method: 'POST' }).catch(() => {});
    const e = new Error(`Match ${matchId} isn't parsed by OpenDota yet — a parse has been requested, try again in a few minutes.`);
    e.code = 'UNPARSED';
    throw e;
  }
  await writeJSON(file, match);
  return match;
}

export const isParsed = (m) => !!(m && m.players && m.players.some((p) => Array.isArray(p.kills_log)));
