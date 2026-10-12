// Loudness of the VOD every half second. Casters get loud when something
// happens and stay loud while it's being talked about, so clip ends are pushed
// out while the volume is still up — a cut mid-shout feels wrong.

export const STEP = 0.5; // seconds per level

// Feed raw s16le mono samples in with push(); read .levels at the end.
export function levelMeter(rate = 8000) {
  const per = rate * STEP, levels = [];
  let carry = Buffer.alloc(0), sum = 0, n = 0;
  return {
    rate, levels,
    push(d) {
      const b = carry.length ? Buffer.concat([carry, d]) : d;
      const usable = b.length - (b.length % 2);
      for (let i = 0; i < usable; i += 2) {
        const v = b.readInt16LE(i) / 32768;
        sum += v * v;
        if (++n === per) { levels.push(+(10 * Math.log10(sum / n + 1e-10)).toFixed(1)); sum = 0; n = 0; }
      }
      carry = b.subarray(usable);
    },
  };
}

// Loud stretches in [from, to] (VOD seconds) that don't touch any `avoid` range:
// the casters going off with no kill to explain it. Loudness is smoothed over 3s
// and compared with this stretch of VOD's own levels (top 15%), so a loud stream
// and a quiet one behave the same. Checked on the Oct 2026 VODs: in-game ones are
// mostly fights where nobody died (escapes, big stuns); before the horn, in pauses
// and after the ancient they're the draft, banter and reactions.
export function findHype(levels, { from, to, avoid = [], minLen = 4, max = 6 }) {
  if (!levels?.length) return [];
  const i0 = Math.max(0, Math.floor(from / STEP)), i1 = Math.min(levels.length, Math.ceil(to / STEP));
  const raw = levels.slice(i0, i1);
  if (raw.length < 20) return [];
  const W = 3; // half-window: 3 levels either side
  const sm = raw.map((_, i) => { const a = raw.slice(Math.max(0, i - W), i + W); return a.reduce((s, v) => s + v, 0) / a.length; });
  const sorted = sm.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)], loud = sorted[Math.floor(sorted.length * 0.85)];
  const runs = [];
  let cur = null;
  sm.forEach((v, i) => {
    if (v < loud) return;
    if (cur && i - cur.b <= 6) cur.b = i; // a breath of under 3s doesn't end it
    else runs.push((cur = { a: i, b: i }));
  });
  return runs
    .map((r) => ({ a: (i0 + r.a) * STEP, b: (i0 + r.b + 1) * STEP, excess: sm.slice(r.a, r.b + 1).reduce((s, v) => s + v - median, 0) * STEP }))
    .filter((r) => r.b - r.a >= minLen && !avoid.some(([x, y]) => r.a < y + 5 && r.b > x - 5))
    .sort((a, b) => b.excess - a.excess)
    .slice(0, max);
}

// Push a clip's end out while the casters are still hyped (up to maxExtra seconds).
export function extendEnd(levels, vodStart, vodEnd, maxExtra = 10) {
  if (!levels || !levels.length) return vodEnd;
  const i0 = Math.max(0, Math.floor(vodStart / STEP)), i1 = Math.min(levels.length - 1, Math.floor(vodEnd / STEP));
  // Compare to the clip's own loudness so a loud stream and a quiet one behave the same.
  const inClip = levels.slice(i0, i1 + 1).slice().sort((a, b) => a - b);
  if (!inClip.length) return vodEnd;
  const hype = inClip[Math.floor(inClip.length * 0.6)];
  let i = i1;
  const stop = Math.min(levels.length - 1, i1 + Math.round(maxExtra / STEP));
  // Need two quiet half-seconds in a row to call it over.
  while (i < stop && !(levels[i + 1] < hype && levels[i + 2] < hype)) i++;
  return +(i * STEP + STEP).toFixed(2);
}
