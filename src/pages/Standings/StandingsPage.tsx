import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import Skeleton from '../../components/Skeleton/Skeleton';
import { playoffsLive } from '../../config';
import { useAuth } from '../../lib/authContext';
import AdminBar from './AdminBar';
import DivisionBoard from './DivisionBoard';
import Trends from './Trends';
import { useStandings } from './useStandings';
import styles from './StandingsPage.module.css';

type Tab = 'group' | 'playoffs' | 'trends';
const TABS: { id: Tab; label: string }[] = [
  { id: 'group', label: 'Group Stage' },
  { id: 'playoffs', label: 'Playoffs' },
  { id: 'trends', label: 'Trends' },
];

function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading standings" className={styles.skeleton}>
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className={styles.skRow}>
          <Skeleton width={28} height={20} /><Skeleton width={34} height={38} /><Skeleton width="40%" height={20} /><Skeleton width={60} height={20} />
        </div>
      ))}
    </div>
  );
}

export default function StandingsPage() {
  const { isAdmin } = useAuth();
  const s = useStandings();
  // Opens on Playoffs while the playoffs are live; ?phase= is honoured by playoffsLive().
  const [tab, setTab] = useState<Tab>(() => (playoffsLive() ? 'playoffs' : 'group'));
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ group: null, playoffs: null, trends: null });

  const { standings, raw } = s;
  const groupSummary = useMemo(() => {
    if (!standings) return '';
    const played = Math.round([...standings.teams.values()].reduce((n, T) => n + T.matchCount, 0) / 2);
    return `${standings.teams.size} teams · ${played} matches played${s.mock ? ' · MOCK DATA (?mock=1)' : ''}`;
  }, [standings, s.mock]);

  const onKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  };

  return (
    <div className={styles.page}>
      <header className={`container ${styles.head}`}>
        <p className={styles.eyebrow}>SecretLeague I</p>
        <h1 className={styles.title}>Standings</h1>
        <p className={styles.lede}>
          Series records, head-to-head tiebreaks and player lines for every division.
          Fixtures and results are on <Link to="/groupstage">Group Stage</Link>.
        </p>
      </header>

      <div className={styles.tabsBar}>
        <div className="container">
          <div className={styles.tabs} role="tablist" aria-label="Standings phase" onKeyDown={onKey}>
            {TABS.map((t) => (
              <button
                key={t.id}
                ref={(el) => { tabRefs.current[t.id] = el; }}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                className={styles.tab}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`container ${styles.body}`}>
        {isAdmin && standings && raw && (
          <AdminBar
            teams={[...standings.teams.values()]}
            forfeits={raw.forfeits}
            busy={s.busy}
            onSync={s.syncNow}
            onAdd={s.addForfeit}
            onDelete={s.deleteForfeit}
          />
        )}
        <div className={styles.live} role="status" aria-live="polite">{s.notice}</div>

        {s.state === 'loading' && !standings && <LoadingSkeleton />}

        {s.state === 'error' && (
          <div className={styles.error} role="alert">
            <p>Could not load standings ({s.error}). Try again in a minute.</p>
            <button type="button" className={styles.retry} onClick={() => { void s.reload(); }}>Retry</button>
          </div>
        )}

        {standings && (
          <>
            <div role="tabpanel" id="panel-group" aria-labelledby="tab-group" hidden={tab !== 'group'}>
              <p className={styles.phaseNote}>Group-stage games only (up to 8 September). Playoff games are on the Playoffs tab.</p>
              {tab === 'group' && (
                <DivisionBoard teams={standings.teams} playoffs={false} isAdmin={isAdmin} onMove={s.moveTeam} summary={groupSummary} />
              )}
            </div>
            <div role="tabpanel" id="panel-playoffs" aria-labelledby="tab-playoffs" hidden={tab !== 'playoffs'}>
              <p className={styles.phaseNote}>Playoff series won and lost. Player ratings here are playoff games only.</p>
              {tab === 'playoffs' && (
                <DivisionBoard
                  teams={standings.playoff.teams}
                  playoffs
                  isAdmin={false}
                  summary={`${standings.playoff.teams.size} teams · ${standings.playoff.seriesCount} series decided · ${standings.playoff.gameCount} games`}
                />
              )}
            </div>
            <div role="tabpanel" id="panel-trends" aria-labelledby="tab-trends" hidden={tab !== 'trends'}>
              {tab === 'trends' && (
                <Trends
                  heroes={standings.heroes}
                  teamCount={standings.teams.size}
                  totalMatches={standings.totalMatches}
                  syncedAt={raw?.lastSyncedAt ?? null}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
