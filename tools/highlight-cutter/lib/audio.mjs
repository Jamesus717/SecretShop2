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
