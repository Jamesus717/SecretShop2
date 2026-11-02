// One night's series, without the page: the same grouping as scheduleNights() in
// app.js. Games (match ids, in the order played) come from the site's match cache,
// and division, format, caster and stream link from the scheduling sheet. Read only.
//
// Only playoff games are in the cache. The sheet's stream link is often a channel,
// not a video: only a link to one video counts as the VOD, and a series without
// one is reported, not guessed at.

const SUPABASE = 'https://nqcbfsnscqoaznypovyx.supabase.co';
const ANON_KEY = 'sb_publishable_a_5S14K41Okv1vsNTNZn3A_QxQ601vA'; // client-side by design, see js/supabase.js
const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/1SHBOPLHbh4FURE-EdRUmbrsTk0WTdT-dwVpvZpSpON4/export?format=csv';
const DIVISION_KEYS = { upper: 'upper', middle: 'mid', mid: 'mid', lower: 'lower' };
const DIV_TITLE = { upper: 'Upper Div', mid: 'Mid Div', lower: 'Lower Div' };

const normName = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
export const ukDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(iso)); // YYYY-MM-DD

// A game after midnight still belongs to the evening it started: a Bo3's last game at 00:20 is Monday's.
export const nightDate = (iso) => ukDate(new Date(Date.parse(iso) - 6 * 36e5));

export const isVideoLink = (u) => /^https:\/\/(www\.)?(twitch\.tv\/videos\/\d+|youtu\.be\/[\w-]+|youtube\.com\/(watch\?|live\/))/i.test(u);

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  row.push(field); rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// "07-09-2026" → "2026-09-07".
const sheetDate = (raw) => { const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec((raw || '').trim()); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };

export function sheetRows(csv) {
  const [head, ...rows] = parseCSV(csv);
  if (!head) return [];
  const at = (name) => head.findIndex((h) => h.trim().replace(/\s+/g, ' ').toLowerCase() === name);
  const col = { div: at('division'), date: at('date of game'), a: at('team 1 name'), b: at('team 2 name'), bo: at('format'), caster: at('caster name'), stream: at('stream link') };
  return rows.map((r) => ({
    div: DIVISION_KEYS[(r[col.div] || '').trim().toLowerCase()] || '',
    date: sheetDate(r[col.date]),
    a: (r[col.a] || '').trim(), b: (r[col.b] || '').trim(),
    bo: +(/(\d+)/.exec(r[col.bo] || '')?.[1]) || 3,
    caster: (r[col.caster] || '').trim(),
    streams: (r[col.stream] || '').split(/\s+/).filter((u) => /^https?:\/\/\S+$/i.test(u)),
  })).filter((r) => r.date && r.a && r.b);
}

// Names differ between the sheet and Imprint ("Herald Royale" / "Herald Royale with Cheese"):
// when the exact match fails, accept one name starting with the other, both ways round.
const closeName = (x, y) => { const a = normName(x), b = normName(y); return a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a))); };
const sameTeams = ([a, b], [c, d]) => (closeName(a, c) && closeName(b, d)) || (closeName(a, d) && closeName(b, c));

// The cache's playoff_series + the sheet's rows → that date's series.
export function seriesForDate(playoffSeries, rows, date) {
  const meetings = new Map(), seen = new Set();
  for (const s of Object.values(playoffSeries || {})) for (const m of s.matches || []) {
    const teams = (m.teams || []).map((t) => t.team_name);
    if (teams.length !== 2 || !m.timestamp || seen.has(m.match_id) || nightDate(m.timestamp) !== date) continue;
    seen.add(m.match_id);
    const key = teams.map(normName).sort().join('|');
    if (!meetings.has(key)) meetings.set(key, { key, teams, games: [] });
    meetings.get(key).games.push({ matchId: String(m.match_id), at: m.timestamp });
  }
  return [...meetings.values()].map((mt) => {
    mt.games.sort((a, b) => a.at.localeCompare(b.at));
    const row = rows.find((r) => r.date === date && [r.a, r.b].map(normName).sort().join('|') === mt.key)
      || rows.find((r) => r.date === date && sameTeams([r.a, r.b], mt.teams)) || null;
    const [a, b] = row ? [row.a, row.b] : mt.teams;
    return {
      title: `${a} vs ${b}${row?.div ? ` - ${DIV_TITLE[row.div]}` : ''}`,
      matchIds: mt.games.map((g) => g.matchId),
      bestOf: row?.bo || 3,
      ...(row?.div ? { division: row.div } : {}),
      vod: row?.streams.find(isVideoLink) || '',
      notCast: !!row && !row.caster && !row.streams.length,
    };
  });
}

export async function scheduleSeries(date) {
  const res = await fetch(`${SUPABASE}/rest/v1/league_data_cache?select=playoff_series&id=eq.snapshot`, { headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` } });
  if (!res.ok) throw new Error(`Match cache said ${res.status}`);
  const [row] = await res.json();
  if (!row?.playoff_series) throw new Error("Match cache has no playoff games yet (hasn't synced?)");
  const sheet = await fetch(SHEET_CSV).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`sheet said ${r.status}`))));
  const rows = sheetRows(sheet);
  if (!rows.length) throw new Error("Schedule sheet had no usable rows (private, or the columns changed?)");
  return seriesForDate(row.playoff_series, rows, date);
}
