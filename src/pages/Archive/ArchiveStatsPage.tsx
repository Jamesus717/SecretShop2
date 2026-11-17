import { useMemo, useState } from 'react';
import Skeleton from '../../components/Skeleton/Skeleton';
import DivisionBoard from '../Standings/DivisionBoard';
import Trends from '../Standings/Trends';
import { useStandings } from '../Standings/useStandings';
import ArchiveShell from './ArchiveShell';
import styles from './Archive.module.css';

type Tab = 'group' | 'playoffs' | 'trends';
const TABS: { id: Tab; label: string }[] = [
  { id: 'group', label: 'Group stage' },
  { id: 'playoffs', label: 'Playoffs' },
  { id: 'trends', label: 'Hero trends' },
];

function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading stats" className={styles.skeleton}>
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className={styles.skRow}>
          <Skeleton width={28} height={20} /><Skeleton width={34} height={38} /><Skeleton width="40%" height={20} /><Skeleton width={60} height={20} />
        </div>
      ))}
    </div>
  );
}

/**
 * Imprint stats for the finished season: the Standings boards and hero trends, always shown in
 * archive mode (the live page's date/phase logic is not used). Admin tools stay on the live page.
 */
export default function ArchiveStatsPage() {
  const s = useStandings({ sync: false });
  const [tab, setTab] = useState<Tab>('group');
  const { standings, raw } = s;

  const groupSummary = useMemo(() => {
    if (!standings) return '';
    const played = Math.round([...standings.teams.values()].reduce((n, T) => n + T.matchCount, 0) / 2);
    return `${standings.teams.size} teams · ${played} matches played${s.mock ? ' · MOCK DATA (?mock=1)' : ''}`;
  }, [standings, s.mock]);

  return (
    <ArchiveShell
      tab="stats"
      heading="Stats"
      lede={<>Final series records, head-to-head tiebreaks and player lines for every division, plus the heroes that shaped the season. Data from <strong>Imprint</strong>.</>}
    >
      <div className={styles.statsTabs} role="group" aria-label="Stats view">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={styles.chip} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {s.state === 'loading' && !standings && <LoadingSkeleton />}

      {s.state === 'error' && !standings && (
        <div className={styles.state} role="alert">
          <p>The season stats are not available right now.</p>
          <p>They come from the Imprint data feed, which could not be reached. Try again in a minute.</p>
          <button type="button" onClick={() => { void s.reload(); }}>Try again</button>
        </div>
      )}

      {standings && tab === 'group' && (
        <>
          <p className={styles.note}>Group-stage games only. Playoff games are on the Playoffs view.</p>
          <DivisionBoard teams={standings.teams} playoffs={false} isAdmin={false} summary={groupSummary} />
        </>
      )}
      {standings && tab === 'playoffs' && (
        <>
          <p className={styles.note}>Playoff series won and lost. Player ratings here are playoff games only.</p>
          <DivisionBoard
            teams={standings.playoff.teams}
            playoffs
            isAdmin={false}
            summary={`${standings.playoff.teams.size} teams · ${standings.playoff.seriesCount} series decided · ${standings.playoff.gameCount} games`}
          />
        </>
      )}
      {standings && tab === 'trends' && (
        <Trends
          heroes={standings.heroes}
          teamCount={standings.teams.size}
          totalMatches={standings.totalMatches}
          syncedAt={raw?.lastSyncedAt ?? null}
        />
      )}
    </ArchiveShell>
  );
}
