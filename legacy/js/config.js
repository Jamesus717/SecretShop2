/**
 * Shared site config. Loaded as a CLASSIC script (not a module) so both the
 * inline countdown on index.html and the ES-module pages can read it.
 * Include it BEFORE any script that depends on it.
 */
window.SECRETLEAGUE = window.SECRETLEAGUE || {};

// When sign-ups close. Written with an explicit +01:00 (BST) offset on purpose —
// without one, browsers parse it in the visitor's own timezone and the deadline
// lands at a different real-world moment for every country.
//
// This single value drives: the homepage countdown, the "signups closed" panel
// on the register page, and the submit-time guard. Change it here only.
window.SECRETLEAGUE.SIGNUPS_CLOSE = '2026-08-10T23:59:59+01:00';

window.SECRETLEAGUE.signupsCloseDate = function () {
  return new Date(window.SECRETLEAGUE.SIGNUPS_CLOSE);
};

window.SECRETLEAGUE.signupsClosed = function () {
  const d = window.SECRETLEAGUE.signupsCloseDate();
  // If the date is unparseable, fail OPEN — a typo here should never silently
  // shut registration for everyone.
  if (isNaN(d.getTime())) return false;
  return Date.now() > d.getTime();
};
