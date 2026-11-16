import type { MatchState } from '../../lib/playoffs';
import styles from './StateTag.module.css';

/** LIVE NOW (pulses) / AWAITING RESULT. Nothing for upcoming or done matches. */
export default function StateTag({ state }: { state: MatchState }) {
  if (state === 'live') {
    return <span className={`${styles.tag} ${styles.live}`} title="Started within the last three hours (UK time)">Live now</span>;
  }
  if (state === 'awaiting') {
    return <span className={`${styles.tag} ${styles.awaiting}`} title="The scheduled time has passed but no result is on the sheet yet">Awaiting result</span>;
  }
  return null;
}
