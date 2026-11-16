import type { Honour } from '../../data/divisions';
import styles from './TeamModal.module.css';

/** Small gold (champion) or silver (runner-up) laurel marking a SecretLeague I result. */
export default function Laurel({ honour, withLabel = false }: { honour: Honour; withLabel?: boolean }) {
  const label = honour === 'champion' ? 'SecretLeague I champions' : 'SecretLeague I runners-up';
  return (
    <span className={styles.laurel} data-honour={honour} title={label} role="img" aria-label={label}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
        <ellipse cx="6.5" cy="5" rx="1.6" ry="3.2" transform="rotate(-10 6.5 5)" />
        <ellipse cx="6.5" cy="9" rx="1.6" ry="3.2" transform="rotate(5 6.5 9)" />
        <ellipse cx="6.5" cy="13" rx="1.6" ry="3.2" transform="rotate(20 6.5 13)" />
        <ellipse cx="6.5" cy="17" rx="1.6" ry="3.2" transform="rotate(32 6.5 17)" />
        <ellipse cx="17.5" cy="5" rx="1.6" ry="3.2" transform="rotate(10 17.5 5)" />
        <ellipse cx="17.5" cy="9" rx="1.6" ry="3.2" transform="rotate(-5 17.5 9)" />
        <ellipse cx="17.5" cy="13" rx="1.6" ry="3.2" transform="rotate(-20 17.5 13)" />
        <ellipse cx="17.5" cy="17" rx="1.6" ry="3.2" transform="rotate(-32 17.5 17)" />
        <path d="M12 21v-4" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {withLabel && <span className={styles.laurelText}>{honour === 'champion' ? 'Champions' : 'Runners-up'}</span>}
    </span>
  );
}
