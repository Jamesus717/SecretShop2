/**
 * League phase switch.
 *
 * The group stage finishes and playoffs begin at a fixed moment, and nothing
 * about the site should need a hand on the wheel at midnight — nav.js reads
 * this to decide whether the header links to Group Stage or Playoffs.
 *
 * Written with an explicit +01:00 (BST) offset for the same reason
 * SIGNUPS_CLOSE is: without one, every visitor's browser parses it in their
 * own timezone and the switch lands at a different real-world moment per
 * country.
 *
 * Override for previewing either side of the cutover without editing this
 * file: append ?phase=playoffs or ?phase=group to any page URL.
 */
export const PLAYOFFS_START = '2026-09-08T23:59:00+01:00';

export function playoffsStartDate() {
  return new Date(PLAYOFFS_START);
}

export function playoffsLive() {
  try {
    const forced = new URLSearchParams(window.location.search).get('phase');
    if (forced === 'playoffs') return true;
    if (forced === 'group') return false;
  } catch { /* no URLSearchParams / no search string — fall through to the date */ }

  const d = playoffsStartDate();
  // A typo here should never blank the nav: fail back to the group stage,
  // which is the state the site was already in.
  if (isNaN(d.getTime())) return false;
  return Date.now() >= d.getTime();
}
