import type { MatchState, UkClock } from './types';

export const DEFAULT_TIME = '19:00';
/** A match with no result counts as LIVE for this long after its start. */
export const LIVE_WINDOW_MIN = 180;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const UK_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** The instant on the UK clock: { date: '2026-09-18', time: '19:05' }. */
export function ukNow(at: Date = new Date()): UkClock {
  const p = Object.fromEntries(UK_PARTS.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** 'BST' or 'GMT' for a UK date (clocks go back on 25 Oct, mid-playoffs). */
export function ukZone(iso?: string | null): string {
  const d = iso ? new Date(`${iso}T12:00:00Z`) : new Date();
  const part = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'short' })
    .formatToParts(d).find((x) => x.type === 'timeZoneName');
  // Some ICU builds print "GMT+1" / "GMT+0" instead of BST / GMT.
  const v = part?.value ?? '';
  if (/^(BST|GMT\+1)$/.test(v)) return 'BST';
  if (/^(GMT|UTC|GMT\+0)$/.test(v)) return 'GMT';
  return 'UK';
}

export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return 'TBD';
  const [y, m, d] = iso.split('-').map(Number);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** done / live / awaiting / upcoming, on the UK clock. `decided` = the match has a winner. */
export function stateAt(
  m: { date: string | null; time: string | null },
  decided: boolean,
  now: UkClock,
): MatchState {
  if (decided) return 'done';
  if (!m.date || m.date > now.date) return 'upcoming';
  if (m.date < now.date) return 'awaiting';
  const start = minutes(m.time || DEFAULT_TIME);
  const at = minutes(now.time);
  if (at < start) return 'upcoming';
  return at - start <= LIVE_WINDOW_MIN ? 'live' : 'awaiting';
}
