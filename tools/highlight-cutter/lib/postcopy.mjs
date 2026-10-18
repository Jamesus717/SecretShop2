// Post text for a rendered series Short, from the match data it was cut from,
// so posting a night's Shorts is pick → check → Send instead of typing a title
// and caption for each. Fixed templates, not AI: names come straight from
// OpenDota and the series, so nothing gets made up.
//
// A Short's file is <output>\<series id>\shorts\<series>-g<game>-<moment>.mp4
// (renderShorts in pipeline.mjs), which is how one is traced back to its moment.

import { basename, dirname } from 'node:path';

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'clip';

const DIVISIONS = { upper: 'Upper Division', mid: 'Mid Division', lower: 'Lower Division' };
// Same guess as the page's divisionOf() until a series says which it is.
const guessDivision = (title) => (/\bupper\b/i.test(title) ? 'upper' : /\bmid(dle)?\b/i.test(title) ? 'mid' : /\blower\b/i.test(title) ? 'lower' : '');
const TITLE_MAX = 100; // YouTube's limit

// Which series and moment a rendered Short came from: { projectId, file } to
// look up, or null if it isn't a series Short (submitted clips, uploads).
export function shortKey(path) {
  const dir = dirname(path);
  if (basename(dir) !== 'shorts' || !/\.mp4$/i.test(path)) return null;
  return { projectId: basename(dirname(dir)), file: basename(path) };
}

export function findMoment(project, file) {
  for (const [gi, game] of (project.games || []).entries()) {
    for (const m of game.moments || []) {
      if (`${slug(project.title)}-g${gi + 1}-${slug(m.label)}.mp4` === file) return { gi, game, m };
    }
  }
  return null;
}

// "Puck triple kill · Roshan" → "Puck TRIPLE KILL + Roshan": the big word in
// capitals reads like a Shorts title; the extra tags stay as they are.
// Caster-hype moments are labelled by where they happened (hypeMoments in pipeline.mjs).
const HYPE = { 'Draft / pre-game': 'in the draft', 'Post-game': 'after the game', Pause: 'during a pause', 'Close call (no kills)': 'at a close call' };
function headline(label) {
  const [main, ...tags] = String(label).split(' · ');
  if (main === 'Caster hype') return `Casters lose it${HYPE[tags[0]] ? ` ${HYPE[tags[0]]}` : ''}`;
  const loud = main.replace(/\b(double|triple|ultra) kill\b/i, (k) => k.toUpperCase()).replace(/\bRAMPAGE kill\b/, 'RAMPAGE');
  return [loud, ...tags].join(' + ');
}

export function shortCopy(project, { gi, game, m }) {
  const teams = [game.radiant, game.dire].filter(Boolean);
  const vs = teams.length === 2 ? `${teams[0]} vs ${teams[1]}` : teams[0] || '';
  const division = DIVISIONS[project.settings?.division ?? guessDivision(project.title || '')] || '';
  const what = headline(m.label);
  const parts = [what, vs, 'SecretLeague Dota 2'].filter(Boolean);
  let title = `${parts.join(' | ')} #Shorts`;
  // Too long: drop the league name, then shorten the moment.
  if (title.length > TITLE_MAX) title = `${[what, vs].filter(Boolean).join(' | ')} #Shorts`;
  if (title.length > TITLE_MAX) title = `${what.slice(0, TITLE_MAX - vs.length - 14).trim()}… | ${vs} #Shorts`;
  const caption = [
    `${what} in game ${gi + 1}${vs ? ` of ${vs}` : ''}${division ? ` (${division})` : ''}.`,
    'SecretLeague: the UK community Dota 2 league. Full series highlights on our YouTube.',
  ].join('\n');
  return { title, caption };
}
