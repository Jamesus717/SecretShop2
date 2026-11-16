/**
 * Site config. Ported from legacy js/config.js + js/phase.js.
 * All dates carry an explicit +01:00 (BST) offset on purpose: without one the
 * browser parses them in the visitor's own timezone and the moment shifts per country.
 */

/** When sign-ups close (SecretLeague I). Drives the register page guard. */
export const SIGNUPS_CLOSE = '2026-08-10T23:59:59+01:00';

/** Group stage ends and playoffs begin: the nav switches Group Stage -> Playoffs. */
export const PLAYOFFS_START = '2026-09-08T23:59:00+01:00';

/**
 * Lazy League start. null = "Date to be announced" (no countdown).
 * Set to an ISO string with an offset, e.g. '2027-01-09T18:00:00+00:00', to show the countdown.
 */
export const LAZY_LEAGUE_START: string | null = null;

export const DISCORD_URL = 'https://discord.gg/FvPF55KkYY';
export const CONTACT_EMAIL = 'secretleaguedota@gmail.com';

export function signupsCloseDate(): Date {
  return new Date(SIGNUPS_CLOSE);
}

/** Fails OPEN: an unparseable date never silently shuts registration. */
export function signupsClosed(now: number = Date.now()): boolean {
  const d = signupsCloseDate();
  if (isNaN(d.getTime())) return false;
  return now > d.getTime();
}

export function playoffsStartDate(): Date {
  return new Date(PLAYOFFS_START);
}

/**
 * True once playoffs have begun. `?phase=playoffs|group` forces either side for previews.
 * An unparseable date falls back to the group stage (the state the site was already in).
 */
export function playoffsLive(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  now: number = Date.now(),
): boolean {
  try {
    const forced = new URLSearchParams(search).get('phase');
    if (forced === 'playoffs') return true;
    if (forced === 'group') return false;
  } catch {
    /* fall through to the date */
  }
  const d = playoffsStartDate();
  if (isNaN(d.getTime())) return false;
  return now >= d.getTime();
}

/** Lazy League start as a Date, or null when TBA or unparseable. */
export function lazyLeagueStartDate(value: string | null = LAZY_LEAGUE_START): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}
