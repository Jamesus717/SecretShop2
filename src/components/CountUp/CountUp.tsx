import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/** Counts 0 -> value when scrolled into view. Reduced motion: shows the final value at once. */
export default function CountUp({ value, duration = 1400 }: { value: number; duration?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    if (typeof IntersectionObserver === 'undefined') { setN(value); return; }
    let raf = 0;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / duration);
        setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value, duration, reduce]);

  return <span ref={ref} className="num" aria-label={String(value)}>{reduce ? value : n}</span>;
}
