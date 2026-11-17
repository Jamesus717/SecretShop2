import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ARCHIVE_TABS, type ArchiveTab } from '../../lib/archive/paths';
import { SECRETLEAGUE_I } from '../../data/champions';
import styles from './Archive.module.css';

/** Query params worth keeping while moving between tabs (dev mock data). Everything else is page-specific. */
function carry(search: string): string {
  const p = new URLSearchParams(search);
  const keep = new URLSearchParams();
  for (const k of ['mock']) if (p.has(k)) keep.set(k, p.get(k) ?? '');
  const s = keep.toString();
  return s ? `?${s}` : '';
}

interface Props {
  tab: ArchiveTab;
  /** Sub-page heading, shown under the Season 1 title. */
  heading: string;
  lede?: ReactNode;
  children: ReactNode;
}

/** Shared frame for every Season 1 page: title, sub-navigation, body. Always renders, whatever the date or phase. */
export default function ArchiveShell({ tab, heading, lede, children }: Props) {
  const { search } = useLocation();
  const q = carry(search);
  return (
    <div className={styles.page} data-tab={tab}>
      <header className={`container ${styles.head}`}>
        <p className={styles.crumbs}>
          <Link to="/dota/secretleague">SecretLeague Dota</Link>
          <span aria-hidden="true">/</span>
          <span>Past events</span>
        </p>
        <p className={styles.eyebrow}>{SECRETLEAGUE_I.season} · {SECRETLEAGUE_I.year} · Complete</p>
        <h1 className={styles.title}>Season 1 <span className={styles.titleSub}>{tab === 'overview' ? 'archive' : heading}</span></h1>
        {lede && <p className={styles.lede}>{lede}</p>}
      </header>

      <nav className={styles.subnav} aria-label="Season 1 sections">
        <div className="container">
          <ul className={styles.tabs}>
            {ARCHIVE_TABS.map((t) => (
              <li key={t.id}>
                <NavLink
                  to={{ pathname: t.path, search: q }}
                  end
                  className={({ isActive }) => `${styles.tab} ${isActive ? styles.on : ''}`}
                  aria-current={tab === t.id ? 'page' : undefined}
                >
                  {t.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className={`container ${styles.body}`}>{children}</div>
    </div>
  );
}
