import type { Division, MatchRow, Slot } from './types';

export const SHEET_ID = '1SHBOPLHbh4FURE-EdRUmbrsTk0WTdT-dwVpvZpSpON4';
export const SHEET_CSV = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
export const DEFAULT_BO = 3;

// The sheet writes divisions as Upper / Middle / Lower; the site uses upper / mid / lower.
const DIVISION_KEYS: Record<string, Division> = { upper: 'upper', middle: 'mid', mid: 'mid', lower: 'lower' };

export const HEADERS = [
  'Division', 'Week', 'Date of Game', 'Time', '#', 'Elimination?', 'Caster Name', 'Analyst Name',
  'Observer', 'Format', 'Team 1 Name', 'Team 2 Name', 'Score', 'Winner', 'Stream Link', 'Notes',
];

/** Header renames seen (or likely) on the sheet, keyed lower-case with spaces collapsed. */
export const HEADER_ALIASES: Record<string, string> = {
  'match #': '#', 'match#': '#', 'match no': '#', 'match no.': '#', 'match number': '#', match: '#',
};

/** Hand-rolled CSV: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function canonicalHeader(raw: string): string {
  const key = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  return HEADER_ALIASES[key] || HEADERS.find((h) => h.toLowerCase() === key) || raw.trim();
}

export function toRecords(rows: string[][]): Record<string, string>[] {
  if (!rows.length) return [];
  const headers = rows[0].map(canonicalHeader);
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => { rec[h] = (r[i] ?? '').trim(); });
    return rec;
  });
}

/** "07-09-2026" -> "2026-09-07". Blank or "TBD" -> null. */
export function parseDate(raw: string): string | null {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec((raw || '').trim());
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** "19:00 BST" -> "19:00". */
export function parseTime(raw: string): string | null {
  const m = /^(\d{1,2}:\d{2})/.exec((raw || '').trim());
  if (!m) return null;
  return m[1].padStart(5, '0');
}

export function parseBo(raw: string): number {
  const m = /(\d+)/.exec(raw || '');
  return m ? Number(m[1]) : DEFAULT_BO;
}

export function parseScore(raw: string): [number, number] | null {
  const m = /^(\d+)\s*[-–—:]\s*(\d+)$/.exec((raw || '').trim());
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** A team name, or "Winner/Loser of [match] [#]N". */
export function parseSlot(raw: string): Slot | null {
  const t = (raw || '').trim();
  if (!t) return null;
  const ref = /^(winner|loser)\s+of\s+(?:match\s*)?#?\s*(\d+)$/i.exec(t);
  if (ref) {
    const n = Number(ref[2]);
    return ref[1].toLowerCase() === 'winner' ? { winnerOf: n } : { loserOf: n };
  }
  return { team: t };
}

export function parseRow(rec: Record<string, string>): MatchRow | null {
  const div = DIVISION_KEYS[(rec['Division'] || '').trim().toLowerCase()];
  if (!div) return null;
  // Numbers restart per division ("Middle 1"), so only the trailing number counts.
  const num = /(\d+)\s*$/.exec(rec['#'] || '');
  return {
    div,
    week: /^\d+$/.test(rec['Week'] || '') ? Number(rec['Week']) : null,
    n: num ? Number(num[1]) : null,
    date: parseDate(rec['Date of Game']),
    time: parseTime(rec['Time']),
    bo: parseBo(rec['Format']),
    elim: /^y/i.test(rec['Elimination?'] || ''),
    a: parseSlot(rec['Team 1 Name']),
    b: parseSlot(rec['Team 2 Name']),
    caster: (rec['Caster Name'] || '').trim(),
    analyst: (rec['Analyst Name'] || '').trim(),
    observer: (rec['Observer'] || '').trim(),
    stream: (rec['Stream Link'] || '').trim(),
    score: parseScore(rec['Score']),
    winner: (rec['Winner'] || '').trim(),
    notes: (rec['Notes'] || '').trim(),
  };
}

/** CSV text -> rows. Throws when the sheet looks broken so callers fall back loudly. */
export function parseSchedule(csv: string): MatchRow[] {
  const rows = toRecords(parseCSV(csv)).map(parseRow).filter((r): r is MatchRow => r !== null);
  if (!rows.length) throw new Error('sheet returned no usable rows');
  if (!rows.some((r) => r.n != null)) {
    throw new Error('sheet has no match numbers — has the "#" / "Match #" header been renamed?');
  }
  return rows;
}
