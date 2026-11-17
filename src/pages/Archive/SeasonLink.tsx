import { Link } from 'react-router-dom';
import { ARCHIVE_BASE } from '../../lib/archive/paths';
import styles from './SeasonLink.module.css';

interface Props {
  /** Archive tab path; defaults to the overview. */
  to?: string;
  children?: string;
  /** 'solid' = gold button, 'ghost' = outlined. */
  variant?: 'solid' | 'ghost';
  className?: string;
}

/** Entry point into the Season 1 archive, used from the rules page, the Dota hub and the home page. */
export default function SeasonLink({ to = ARCHIVE_BASE, children = 'Season 1 archive', variant = 'solid', className }: Props) {
  return (
    <Link to={to} className={`${styles.link} ${styles[variant]} ${className ?? ''}`}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
        <path d="M7 3h10v2h3a1 1 0 0 1 1 1v1.5A4.5 4.5 0 0 1 16.6 12 5 5 0 0 1 13 14.9V17h3a1 1 0 0 1 1 1v2H7v-2a1 1 0 0 1 1-1h3v-2.1A5 5 0 0 1 7.4 12 4.5 4.5 0 0 1 3 7.5V6a1 1 0 0 1 1-1h3V3Z" />
      </svg>
      <span>{children}</span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}
