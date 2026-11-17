import { memo, useMemo } from 'react';
import styles from './NatureBackdrop.module.css';

/** Deterministic RNG so the trees look the same on every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Seg { d: string; w: number }
interface Leaf { x: number; y: number; r: number; s: number; tone: number }

/** Recursive branching: tapered curved segments plus leaf clusters at the tips. */
function grow(seed: number, x: number, y: number, angle: number, len: number, width: number, depth: number, spread = 0.5) {
  const rand = rng(seed);
  const segs: Seg[] = [];
  const leaves: Leaf[] = [];
  const walk = (x0: number, y0: number, a: number, l: number, w: number, d: number) => {
    const bend = (rand() - 0.5) * 0.5;
    const x1 = x0 + Math.cos(a) * l;
    const y1 = y0 + Math.sin(a) * l;
    const cx = x0 + Math.cos(a + bend) * l * 0.55;
    const cy = y0 + Math.sin(a + bend) * l * 0.55;
    segs.push({ d: `M${x0.toFixed(1)} ${y0.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`, w });
    if (d <= 0 || w < 1.2) {
      const n = 3 + Math.floor(rand() * 4);
      for (let i = 0; i < n; i++) {
        leaves.push({
          x: x1 + (rand() - 0.5) * 34, y: y1 + (rand() - 0.5) * 26,
          r: rand() * 180, s: 0.6 + rand() * 0.9, tone: Math.floor(rand() * 3),
        });
      }
      return;
    }
    const kids = rand() < 0.3 ? 3 : 2;
    for (let i = 0; i < kids; i++) {
      const off = (i - (kids - 1) / 2) * spread + (rand() - 0.5) * 0.35;
      walk(x1, y1, a + off, l * (0.68 + rand() * 0.14), w * 0.66, d - 1);
    }
  };
  walk(x, y, angle, len, width, depth);
  return { segs, leaves };
}

const LEAF = 'M0 -9C5 -6 6 3 0 9C-6 3 -5 -6 0 -9Z';

function Tree({ seed, x, y, angle, len, width, depth, spread }: { seed: number; x: number; y: number; angle: number; len: number; width: number; depth: number; spread?: number }) {
  const { segs, leaves } = useMemo(() => grow(seed, x, y, angle, len, width, depth, spread), [seed, x, y, angle, len, width, depth, spread]);
  return (
    <g>
      <g className={styles.wood} fill="none" strokeLinecap="round">
        {segs.map((s, i) => <path key={i} d={s.d} strokeWidth={s.w} />)}
      </g>
      <g>
        {leaves.map((l, i) => (
          <path key={i} d={LEAF} className={styles[`leaf${l.tone}`]}
            transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.r.toFixed(0)}) scale(${l.s.toFixed(2)})`} />
        ))}
      </g>
    </g>
  );
}

/** Grass / fern tufts along the bottom edge. */
function Undergrowth() {
  const blades = useMemo(() => {
    const rand = rng(77);
    const out: string[] = [];
    for (let i = 0; i < 140; i++) {
      const x = i * 11.5 + rand() * 8;
      const h = 30 + rand() * 70;
      const lean = (rand() - 0.5) * 40;
      out.push(`M${x.toFixed(1)} 200Q${(x + lean * 0.4).toFixed(1)} ${(200 - h * 0.6).toFixed(1)} ${(x + lean).toFixed(1)} ${(200 - h).toFixed(1)}`);
    }
    return out;
  }, []);
  return (
    <svg className={styles.ground} viewBox="0 0 1600 200" preserveAspectRatio="none" aria-hidden="true">
      <path className={styles.hill} d="M0 200V150C200 120 380 160 600 140S1000 110 1250 140 1500 130 1600 120V200Z" />
      <g className={styles.grass} fill="none" strokeLinecap="round">
        {blades.map((d, i) => <path key={i} d={d} strokeWidth={i % 3 ? 2 : 3} />)}
      </g>
    </svg>
  );
}

const FALLING = Array.from({ length: 9 }, (_, i) => ({
  left: `${(i * 11 + 4) % 100}%`, delay: `${-i * 3.1}s`, dur: `${18 + (i % 4) * 5}s`, tone: i % 3, size: 10 + (i % 3) * 4,
}));

/** Forest backdrop: two edge trees, an overhanging canopy branch, undergrowth and a few drifting leaves. Purely decorative. */
function NatureBackdrop() {
  return (
    <div className={styles.root} aria-hidden="true">
      <div className={styles.glow} />
      <svg className={styles.left} viewBox="0 0 520 1000" preserveAspectRatio="xMinYMax meet">
        <Tree seed={11} x={40} y={1010} angle={-1.5} len={230} width={44} depth={6} spread={0.5} />
        <Tree seed={23} x={-30} y={1010} angle={-1.3} len={170} width={26} depth={5} spread={0.45} />
      </svg>
      <svg className={styles.right} viewBox="0 0 520 1000" preserveAspectRatio="xMaxYMax meet">
        <Tree seed={37} x={490} y={1010} angle={-1.66} len={230} width={40} depth={6} spread={0.5} />
      </svg>
      <svg className={styles.canopy} viewBox="0 0 1600 320" preserveAspectRatio="xMidYMin slice">
        <Tree seed={5} x={-30} y={30} angle={0.1} len={230} width={18} depth={5} spread={0.55} />
        <Tree seed={61} x={1630} y={20} angle={Math.PI - 0.14} len={210} width={16} depth={5} spread={0.55} />
      </svg>
      <Undergrowth />
      <div className={styles.fall}>
        {FALLING.map((f, i) => (
          <svg key={i} viewBox="-10 -10 20 20" className={`${styles.drift} ${styles[`leaf${f.tone}`]}`}
            style={{ left: f.left, animationDelay: f.delay, animationDuration: f.dur, width: f.size, height: f.size }}>
            <path d={LEAF} />
          </svg>
        ))}
      </div>
      <div className={styles.veil} />
    </div>
  );
}

export default memo(NatureBackdrop);
