import { memo, useMemo } from 'react';
import styles from './NatureBackdrop.module.css';

/** Deterministic RNG so the scene looks the same on every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Seg { d: string; w: number }
interface Leaf { x: number; y: number; r: number; s: number; tone: number }

interface GrowOpts {
  /** Leaf clusters at the tips (false = dead tree). */
  leaves?: boolean;
  /** 0..1: how much each segment wanders. Dead trees are gnarled. */
  gnarl?: number;
  /** Width kept per generation. Lower = spindly twigs. */
  taper?: number;
  spread?: number;
}

/** Recursive branching: tapered curved segments, optional leaf clusters at the tips. */
function grow(seed: number, x: number, y: number, angle: number, len: number, width: number, depth: number, o: GrowOpts = {}) {
  const { leaves: withLeaves = false, gnarl = 0.5, taper = 0.66, spread = 0.5 } = o;
  const rand = rng(seed);
  const segs: Seg[] = [];
  const leaves: Leaf[] = [];
  const walk = (x0: number, y0: number, a: number, l: number, w: number, d: number) => {
    // Dead wood kinks: two curved halves with a jittered elbow.
    const a1 = a + (rand() - 0.5) * gnarl;
    const mx = x0 + Math.cos(a1) * l * 0.5;
    const my = y0 + Math.sin(a1) * l * 0.5;
    const a2 = a + (rand() - 0.5) * gnarl;
    const x1 = mx + Math.cos(a2) * l * 0.5;
    const y1 = my + Math.sin(a2) * l * 0.5;
    const c1x = x0 + Math.cos(a) * l * 0.3, c1y = y0 + Math.sin(a) * l * 0.3;
    segs.push({ d: `M${x0.toFixed(1)} ${y0.toFixed(1)}Q${c1x.toFixed(1)} ${c1y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}T${x1.toFixed(1)} ${y1.toFixed(1)}`, w });
    if (d <= 0 || w < 0.9) {
      if (withLeaves) {
        const n = 3 + Math.floor(rand() * 4);
        for (let i = 0; i < n; i++) {
          leaves.push({ x: x1 + (rand() - 0.5) * 30, y: y1 + (rand() - 0.5) * 22, r: rand() * 180, s: 0.6 + rand() * 0.8, tone: Math.floor(rand() * 3) });
        }
      }
      return;
    }
    const kids = rand() < 0.35 ? 3 : 2;
    for (let i = 0; i < kids; i++) {
      const off = (i - (kids - 1) / 2) * spread + (rand() - 0.5) * 0.45;
      walk(x1, y1, a2 + off, l * (0.64 + rand() * 0.2), w * taper, d - 1);
    }
    // Occasional short broken stub.
    if (rand() < 0.25 && w > 4) walk(mx, my, a1 + (rand() < 0.5 ? -1 : 1) * (0.9 + rand() * 0.5), l * 0.28, w * 0.45, 0);
  };
  walk(x, y, angle, len, width, depth);
  return { segs, leaves };
}

const LEAF = 'M0 -9C5 -6 6 3 0 9C-6 3 -5 -6 0 -9Z';

function Tree({ seed, x, y, angle, len, width, depth, className, ...o }: { seed: number; x: number; y: number; angle: number; len: number; width: number; depth: number; className?: string } & GrowOpts) {
  const { segs, leaves } = useMemo(
    () => grow(seed, x, y, angle, len, width, depth, o),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed, x, y, angle, len, width, depth, o.leaves, o.gnarl, o.taper, o.spread],
  );
  return (
    <g className={className}>
      <g className={styles.wood} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {segs.map((s, i) => <path key={i} d={s.d} strokeWidth={s.w} />)}
      </g>
      {leaves.map((l, i) => (
        <path key={i} d={LEAF} className={styles[`leaf${l.tone}`]}
          transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.r.toFixed(0)}) scale(${l.s.toFixed(2)})`} />
      ))}
    </g>
  );
}

/** Hanging vines: wavy strands with small leaves along them. */
function Vines({ seed, count, width, maxLen }: { seed: number; count: number; width: number; maxLen: number }) {
  const vines = useMemo(() => {
    const rand = rng(seed);
    return Array.from({ length: count }, () => {
      const x0 = rand() * width;
      const len = maxLen * (0.3 + rand() * 0.7);
      const amp = 6 + rand() * 14;
      const steps = Math.max(4, Math.round(len / 40));
      let d = `M${x0.toFixed(1)} -5`;
      const lv: Leaf[] = [];
      for (let i = 1; i <= steps; i++) {
        const y = (len / steps) * i;
        const x = x0 + Math.sin(i * 1.3 + rand()) * amp;
        const cx = x0 + Math.sin(i * 1.3 - 0.6) * amp * 1.4;
        d += `Q${cx.toFixed(1)} ${(y - len / steps / 2).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
        if (rand() < 0.75) lv.push({ x: x + (rand() < 0.5 ? -5 : 5), y, r: rand() < 0.5 ? -40 : 40, s: 0.45 + rand() * 0.4, tone: Math.floor(rand() * 3) });
      }
      return { d, lv, w: 1.2 + rand() * 1.6 };
    });
  }, [seed, count, width, maxLen]);
  return (
    <>
      {vines.map((v, i) => (
        <g key={i}>
          <path d={v.d} fill="none" className={styles.vineStem} strokeWidth={v.w} strokeLinecap="round" />
          {v.lv.map((l, j) => (
            <path key={j} d={LEAF} className={styles[`leaf${l.tone}`]}
              transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.r}) scale(${l.s.toFixed(2)})`} />
          ))}
        </g>
      ))}
    </>
  );
}

/** Dead grass and thorny scrub along the bottom edge. */
function Undergrowth() {
  const blades = useMemo(() => {
    const rand = rng(77);
    const out: string[] = [];
    for (let i = 0; i < 150; i++) {
      const x = i * 10.8 + rand() * 8;
      const h = 20 + rand() * 60;
      const lean = (rand() - 0.5) * 50;
      out.push(`M${x.toFixed(1)} 200Q${(x + lean * 0.3).toFixed(1)} ${(200 - h * 0.6).toFixed(1)} ${(x + lean).toFixed(1)} ${(200 - h).toFixed(1)}`);
    }
    return out;
  }, []);
  return (
    <svg className={styles.ground} viewBox="0 0 1600 200" preserveAspectRatio="none" aria-hidden="true">
      <path className={styles.hill} d="M0 200V150C200 125 380 165 600 145S1000 115 1250 145 1500 135 1600 125V200Z" />
      <g className={styles.grass} fill="none" strokeLinecap="round">
        {blades.map((d, i) => <path key={i} d={d} strokeWidth={i % 3 ? 1.6 : 2.6} />)}
      </g>
    </svg>
  );
}

const EMBERS = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 7.3 + 3) % 100}%`, delay: `${-i * 1.9}s`, dur: `${12 + (i % 5) * 3}s`, size: 2 + (i % 3),
}));

/** Dire-side forest: gnarled dead trees, hanging vines, distant dead treeline, scrub and rising embers. Flat background, no gradients. Purely decorative. */
function NatureBackdrop() {
  return (
    <div className={styles.root} aria-hidden="true">
      {/* Far treeline, misty */}
      <svg className={styles.far} viewBox="0 0 1600 400" preserveAspectRatio="xMidYMax slice">
        {[120, 330, 560, 790, 1010, 1240, 1470].map((x, i) => (
          <Tree key={x} seed={200 + i} x={x} y={410} angle={-1.57 + (i % 2 ? 0.08 : -0.08)} len={70 + (i % 3) * 18} width={9} depth={6} gnarl={0.9} taper={0.62} spread={0.6} />
        ))}
      </svg>

      <svg className={styles.left} viewBox="0 0 560 1000" preserveAspectRatio="xMinYMax meet">
        <Tree seed={11} x={50} y={1015} angle={-1.48} len={220} width={48} depth={8} gnarl={0.8} taper={0.62} spread={0.55} />
        <Tree seed={23} x={-40} y={1015} angle={-1.25} len={160} width={26} depth={6} gnarl={0.9} taper={0.6} />
        <Tree seed={29} x={-20} y={520} angle={-0.35} len={150} width={14} depth={6} gnarl={0.9} taper={0.6} spread={0.6} />
      </svg>
      <svg className={styles.sideVinesL} viewBox="0 0 400 700" preserveAspectRatio="xMinYMin meet">
        <Vines seed={31} count={9} width={400} maxLen={520} />
      </svg>
      <svg className={styles.sideVinesR} viewBox="0 0 400 700" preserveAspectRatio="xMaxYMin meet">
        <Vines seed={53} count={9} width={400} maxLen={520} />
      </svg>
      <svg className={styles.right} viewBox="0 0 560 1000" preserveAspectRatio="xMaxYMax meet">
        <Tree seed={37} x={510} y={1015} angle={-1.7} len={210} width={44} depth={8} gnarl={0.8} taper={0.62} spread={0.55} />
        <Tree seed={41} x={600} y={1015} angle={-1.95} len={150} width={24} depth={6} gnarl={0.9} taper={0.6} />
        <Tree seed={47} x={580} y={460} angle={Math.PI + 0.35} len={150} width={14} depth={6} gnarl={0.9} taper={0.6} spread={0.6} />
      </svg>

      <svg className={styles.canopy} viewBox="0 0 1600 360" preserveAspectRatio="xMidYMin slice">
        <Tree seed={5} x={-30} y={20} angle={0.12} len={250} width={20} depth={7} gnarl={0.8} taper={0.62} spread={0.6} />
        <Tree seed={61} x={1630} y={10} angle={Math.PI - 0.14} len={230} width={18} depth={7} gnarl={0.8} taper={0.62} spread={0.6} />
        <Tree seed={73} x={800} y={-20} angle={1.45} len={110} width={10} depth={6} gnarl={0.9} taper={0.6} spread={0.7} />
        <Vines seed={9} count={34} width={1600} maxLen={340} />
      </svg>

      <Undergrowth />

      <div className={styles.embers}>
        {EMBERS.map((e, i) => (
          <span key={i} className={styles.ember} style={{ left: e.left, animationDelay: e.delay, animationDuration: e.dur, width: e.size, height: e.size }} />
        ))}
      </div>
      <div className={styles.veil} />
    </div>
  );
}

export default memo(NatureBackdrop);
