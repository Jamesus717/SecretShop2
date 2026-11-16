import { useEffect, useState } from 'react';
import styles from './Countdown.module.css';

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), mins: Math.floor((s % 3600) / 60), secs: s % 60 };
}
const pad = (n: number) => String(n).padStart(2, '0');

/** Four blocks, tabular digits, ticks every second. */
export default function Countdown({ target }: { target: Date }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const p = parts(target.getTime() - now);
  const blocks: [string, number][] = [['Days', p.days], ['Hours', p.hours], ['Mins', p.mins], ['Secs', p.secs]];
  return (
    <div className={styles.row} role="timer" aria-label="Time until Lazy League starts">
      {blocks.map(([label, v]) => (
        <div key={label} className={styles.block}>
          <span className={`${styles.digits} num`}>{pad(v)}</span>
          <span className={styles.label}>{label}</span>
        </div>
      ))}
    </div>
  );
}
