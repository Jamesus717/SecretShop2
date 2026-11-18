// Pure helpers shared by scripts/patch-fetch.mjs and the app/tests.
// Plain .mjs (typed by helpers.d.mts) so Node 22 can run the fetch script directly.

/**
 * Text format choice: note text is stored as PLAIN TEXT with `**bold**` markers.
 * Valve marks emphasis with <font color='#e03e2e'>...</font>; that becomes **...**.
 * All other HTML/BBCode is stripped. The UI splits on ** to render <strong>.
 */
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

// Valve's feed sometimes uses Cyrillic/Greek lookalikes ("Mana Сost" with U+0421) which break stat matching.
const LOOKALIKES = {
  'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'І': 'I', 'Ј': 'J', 'К': 'K', 'М': 'M', 'О': 'O', 'Р': 'P', 'Ѕ': 'S', 'Т': 'T', 'Х': 'X', 'У': 'Y',
  'а': 'a', 'с': 'c', 'е': 'e', 'і': 'i', 'ј': 'j', 'о': 'o', 'р': 'p', 'ѕ': 's', 'х': 'x', 'у': 'y',
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
  'ο': 'o', 'ν': 'v',
};
export function normalizeLookalikes(str) {
  return String(str).replace(/[Ͱ-ϿЀ-ӿ]/g, (c) => LOOKALIKES[c] ?? c);
}

export function cleanNote(raw) {
  if (raw == null) return '';
  let s = normalizeLookalikes(raw);
  s = s.replace(/<br\s*\/?>/gi, ' ');
  s = s.replace(/<font[^>]*>/gi, '**').replace(/<\/font>/gi, '**');
  s = s.replace(/<\/?(b|strong)>/gi, '**');
  s = s.replace(/\[b\]|\[\/b\]/gi, '**');
  s = s.replace(/<[^>]*>/g, '');
  s = s.replace(/\[\/?[a-z]+(=[^\]]*)?\]/gi, '');
  s = s.replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (m) => ENTITIES[m] ?? m);
  s = s.replace(/\*\*\s*\*\*/g, ''); // empty bold
  s = s.replace(/\*\*([^*]*?)\*\*\s*\*\*([^*]*?)\*\*/g, '**$1 $2**');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Split cleaned text on ** into alternating plain/bold segments. */
export function toSegments(text) {
  return text
    .split('**')
    .map((t, i) => ({ text: t, bold: i % 2 === 1 }))
    .filter((s) => s.text !== '');
}

// Stats where a LOWER number is better for the hero/item owner.
const LOWER_IS_BETTER =
  /\b(cooldown|mana cost|health cost|manacost|cast point|cast time|cast animation|backswing|attack point|base attack time|bat|delay|gold cost|recipe cost|total cost|cost|respawn|restock|channel time|charge time|penalty|self.?damage|damage taken|slow duration on self|turn time|stun duration on self|mana loss|spawn interval|vision cooldown|buyback)\b/i;

function nums(str) {
  // "56-76" is a range (56 and 76), not 56 and -76: a minus only counts as a sign after a non-digit
  return (str.match(/(?<!\d)-?\d+(?:\.\d+)?/g) || []).map(Number);
}
function mean(a) {
  return a.reduce((x, y) => x + y, 0) / a.length;
}

/**
 * Parse "X <increased|decreased|rescaled|changed|reduced> from A to B".
 * Returns { stat, direction: 'up'|'down'|null, from, to } or null.
 */
export function parseChange(text) {
  const t = text.replace(/\*\*/g, '');
  const m = t.match(/^(.*?)\b(increased|decreased|reduced|rescaled|changed|reworked|lowered|raised)\b\s+from\s+(.+?)\s+to\s+(.+?)(?:\s*[(,;]|\.\s|\.$|$)/i);
  if (!m) return null;
  const [, stat, verb, a, b] = m;
  const na = nums(a);
  const nb = nums(b);
  if (!na.length || !nb.length) return null;
  const from = mean(na);
  const to = mean(nb);
  let direction = null;
  const v = verb.toLowerCase();
  if (v === 'increased' || v === 'raised') direction = 'up';
  else if (v === 'decreased' || v === 'reduced' || v === 'lowered') direction = 'down';
  // rescaled / changed: direction from the numbers themselves
  if (direction === null || v === 'rescaled' || v === 'changed') {
    direction = to > from ? 'up' : to < from ? 'down' : null;
  }
  // only the clause right before the verb names the stat ("Added X. Damage" -> "Damage")
  const clause = stat.trim().split(/\.\s+/).pop();
  return { stat: clause, direction, from, to };
}

/** 1 (<=15%), 2 (<=40%), 3 (bigger) from the relative change of the means. */
export function magnitudeFor(from, to) {
  if (from === 0) return to === 0 ? 1 : 3;
  const r = Math.abs(to - from) / Math.abs(from);
  return r <= 0.15 ? 1 : r <= 0.4 ? 2 : 3;
}

/**
 * Stat polarity: does an increase of this stat help (buff) or hurt (nerf)?
 * Returns 'higherBetter' | 'lowerBetter'.
 */
export function statPolarity(stat) {
  // "Reduced Damage Taken" is a good stat: judge the rest, then flip it.
  const rest = stat.replace(/^\s*reduced\s+/i, '');
  if (rest !== stat) return statPolarity(rest) === 'lowerBetter' ? 'higherBetter' : 'lowerBetter';
  // "Increased Magic Damage" is just a stat called that; the leading word is not a direction.
  stat = stat.replace(/^\s*increased\s+/i, '');
  // Stats that END in reduction / resistance / block are good when higher ("Damage Taken Reduction"); "Block cooldown" is not.
  if (/\b(reduction|resistance|block|restoration)(\s+(bonus|amount|percentage))?\s*$/i.test(stat)) return 'higherBetter';
  if (/\bduration\b/i.test(stat) && /\b(self|your|own)\b/i.test(stat)) return 'lowerBetter';
  if (LOWER_IS_BETTER.test(stat)) return 'lowerBetter';
  return 'higherBetter';
}

/**
 * Classify one cleaned change line.
 * kind: buff | nerf | rework | neutral
 *   buff/nerf   numeric change with known polarity
 *   rework      behaviour change with no clean direction ("now", "no longer", "reworked")
 *   neutral     informational / no gameplay direction (headings, "Item Cycled Out", pools)
 * magnitude: 1-3.  `directional` is true when kind came from the stat parser
 * (false = a fallback guess that may deserve a manual look).
 */
export function classifyLine(text) {
  const plain = text.replace(/\*\*/g, '');
  if (/total cost unchanged|^tiers? changed/i.test(plain)) return { kind: 'neutral', magnitude: 1, directional: false };
  // "improved" / "worsened" already say good or bad ("Cast Point improved from 0.3s to 0.2s")
  const iw = plain.match(/\b(improved|worsened) from\s+(.+?)\s+to\s+(.+?)(?:\s*[(,;]|\.\s|\.$|$)/i);
  if (iw) {
    const a = nums(iw[2]).length ? mean(nums(iw[2])) : 0;
    const b = nums(iw[3]).length ? mean(nums(iw[3])) : 0;
    return { kind: iw[1].toLowerCase() === 'improved' ? 'buff' : 'nerf', magnitude: magnitudeFor(a, b), directional: true };
  }
  const ch = parseChange(plain);
  if (ch && ch.direction) {
    const pol = statPolarity(ch.stat);
    const up = ch.direction === 'up';
    const good = pol === 'higherBetter' ? up : !up;
    return { kind: good ? 'buff' : 'nerf', magnitude: magnitudeFor(ch.from, ch.to), directional: true };
  }
  // "X increased/decreased by N" (no from/to): direction only, magnitude from the size of N.
  const by = plain.match(/^(.*)\b(increased|decreased|reduced)\b by (\d+(?:\.\d+)?)(%?)/i);
  if (by) {
    const up = by[2].toLowerCase() === 'increased';
    const good = statPolarity(by[1]) === 'higherBetter' ? up : !up;
    const n = Number(by[3]);
    const mag = by[4] ? (n <= 10 ? 1 : n <= 25 ? 2 : 3) : n <= 5 ? 1 : n <= 20 ? 2 : 3;
    return { kind: good ? 'buff' : 'nerf', magnitude: mag, directional: true };
  }
  if (/\b(now|is) (fully |partially )?disabled by break|now has an internal \d+s? cooldown|\bno longer (grants|provides|gives|upgraded)\b/i.test(plain))
    return { kind: 'nerf', magnitude: 1, directional: false };
  if (/^(no longer (costs|has a cooldown|requires|goes on cooldown|causes)\b|now (also )?(provides|grants|applies|heals|works|counts|can)\b|may now\b|now has \d+ (ability )?charges|now cannot be dispelled)/i.test(plain))
    return { kind: 'buff', magnitude: 1, directional: false };
  if (/^removed .* (ability|innate)/i.test(plain)) return { kind: 'rework', magnitude: 2, directional: false };
  if (/^(item cycled out|item removed|no longer in the game)/i.test(plain)) return { kind: 'neutral', magnitude: 1, directional: false };
  if (/\b(reworked|rework|replaced with|now works|now also|now has|now provides|no longer|now instead|changed to|new ability|new!?)\b/i.test(plain))
    return { kind: 'rework', magnitude: /reworked|replaced|new/i.test(plain) ? 2 : 1, directional: false };
  if (/\bnow\b/i.test(plain)) return { kind: 'rework', magnitude: 1, directional: false };
  return { kind: 'neutral', magnitude: 1, directional: false };
}
