import { Link } from 'react-router-dom';
import { SEASON_TARGETS } from '../../lib/archive/paths';
import Crest from '../../components/Crest/Crest';
import type { Division } from '../../lib/playoffs';
import styles from './TeamLink.module.css';

interface Props {
  name: string | null;
  /** Shown when the team is not known yet ("Winner of #4"). */
  placeholder?: string;
  division: Division;
  size?: number;
  className?: string;
}

/** Crest + name linking to the Team Info page. Unknown teams render as plain muted text. */
export default function TeamLink({ name, placeholder = 'TBD', division, size = 22, className }: Props) {
  if (!name) {
    return (
      <span className={`${styles.tbd} ${className ?? ''}`}>
        <span className={styles.ghost} style={{ height: size, width: size }} aria-hidden="true" />
        <span className={styles.name}>{placeholder}</span>
      </span>
    );
  }
  return (
    <Link to={`${SEASON_TARGETS.teamInfo}?team=${encodeURIComponent(name)}`} className={`${styles.link} ${className ?? ''}`}>
      <Crest name={name} size={size} division={division} />
      <span className={styles.name}>{name}</span>
    </Link>
  );
}
