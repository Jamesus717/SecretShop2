import { Link } from 'react-router-dom';
import styles from './LiveStrip.module.css';

/** One line under the nav, on every page. Later: next match. */
export default function LiveStrip() {
  return (
    <div className={styles.strip}>
      <div className={`container ${styles.inner}`}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.text}>
          <strong>Patch 7.42</strong> is here. Read every hero and item change.
        </span>
        <Link to="/patch/7.42" className={styles.link}>Read the patch</Link>
      </div>
    </div>
  );
}
