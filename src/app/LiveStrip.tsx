import { DISCORD_URL } from '../config';
import styles from './LiveStrip.module.css';

/** One line under the nav, on every page. Later: next match. */
export default function LiveStrip() {
  return (
    <div className={styles.strip}>
      <div className={`container ${styles.inner}`}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.text}>
          <strong>Lazy League</strong> is coming soon. Date to be announced.
        </span>
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className={styles.link}>Join the Discord</a>
      </div>
    </div>
  );
}
