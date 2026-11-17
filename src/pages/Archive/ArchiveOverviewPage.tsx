import { Link } from 'react-router-dom';
import CountUp from '../../components/CountUp/CountUp';
import { SECRETLEAGUE_I } from '../../data/champions';
import { ARCHIVE_TABS } from '../../lib/archive/paths';
import ChampionPanel from '../Home/ChampionPanel';
import { SCHEDULE, totals } from '../GroupStage/schedule';
import ArchiveShell from './ArchiveShell';
import styles from './Archive.module.css';

const EXPLORE: { id: string; name: string; text: string }[] = [
  { id: 'games', name: 'Games', text: 'Every group and playoff series, with scores and filters.' },
  { id: 'teams', name: 'Teams', text: 'All squads and their rosters, ranks and positions.' },
  { id: 'stats', name: 'Stats', text: 'Imprint standings, player lines and hero trends.' },
  { id: 'highlights', name: 'Highlights', text: 'Approved clips and the match cards from the league.' },
];

export default function ArchiveOverviewPage() {
  const { divisions, teams, series } = SECRETLEAGUE_I;
  const [upper, ...rest] = divisions;
  const t = totals(SCHEDULE);
  const numbers: [number, string][] = [
    [divisions.length, 'Divisions'], [teams, 'Teams'], [t.played, 'Group games'], [series, 'Playoff series'],
  ];

  return (
    <ArchiveShell
      tab="overview"
      heading="Overview"
      lede="SecretLeague I is complete. Three divisions, 40 group games and 34 playoff series. Results, teams, stats and clips below."
    >
      <div className={styles.room}>
        <ul className={styles.numbers} aria-label="Season 1 in numbers">
          {numbers.map(([n, label]) => (
            <li key={label}>
              <span className={styles.num}><CountUp value={n} /></span>
              <span className={styles.numLabel}>{label}</span>
            </li>
          ))}
        </ul>

        <ChampionPanel division={upper} featured />
        <div className={styles.pair}>
          {rest.map((d) => <ChampionPanel key={d.key} division={d} />)}
        </div>
      </div>

      <h2 className={styles.h2}>Explore the season</h2>
      <ul className={styles.explore}>
        {EXPLORE.map((e) => {
          const tab = ARCHIVE_TABS.find((x) => x.id === e.id)!;
          return (
            <li key={e.id}>
              <Link to={tab.path} className={styles.exploreCard}>
                <span className={styles.exploreName}>{e.name}</span>
                <span className={styles.exploreText}>{e.text}</span>
                <span className={styles.exploreGo}>Open →</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </ArchiveShell>
  );
}
