import type { DivisionKey } from '../../lib/news';
import styles from './DivisionTag.module.css';

const LABEL: Record<DivisionKey, string> = { upper: 'Upper', mid: 'Middle', lower: 'Lower' };

/** Division chip: coloured background with dark ink (never coloured small text). */
export default function DivisionTag({ division, label }: { division: DivisionKey; label?: string }) {
  return <span className={styles.tag} data-div={division}>{label ?? LABEL[division]}</span>;
}
