import { ukNow, ukZone } from '../time';
import type { MatchState, UkClock } from './types';

export { ukNow, ukZone };

export const DEFAULT_TIME = '19:00';
/** A match with no result counts as LIVE for this long after its start. */
export const LIVE_WINDOW_MIN = 180;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
