/** UK clock helpers shared across the site (league times are always Europe/London). */

export interface UkClock {
  date: string;
  time: string;
}

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
