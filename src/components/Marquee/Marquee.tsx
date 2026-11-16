import type { ReactNode } from 'react';
import styles from './Marquee.module.css';

/** Slow looping row. Content is rendered twice for a seamless loop (the copy is aria-hidden). Paused on hover/focus; scrollable and static under reduced motion. */
export default function Marquee({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className={styles.marquee} role="group" aria-label={label}>
      <div className={styles.track}>
        <div className={styles.set}>{children}</div>
        <div className={styles.set} aria-hidden="true">{children}</div>
      </div>
    </div>
  );
}
