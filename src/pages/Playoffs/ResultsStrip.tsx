import { fmtDate, type Division, type Schedule } from '../../lib/playoffs';
import TeamLink from './TeamLink';
import styles from './ResultsStrip.module.css';

/** Decided series, newest match first. Scrolls sideways inside itself. */
export default function ResultsStrip({ schedule: s, division }: { schedule: Schedule; division: Division }) {
  const done = s.matches(division)
    .map((m) => ({ m, res: s.matchResult(m) }))
    .filter((x) => x.res && x.res.winner && x.res.loser)
    .sort((a, b) => (b.m.n as number) - (a.m.n as number));
  if (!done.length) return null;

  return (
    <ol className={styles.strip} aria-label="Results">
      {done.map(({ m, res }) => (
        <li key={m.n} className={styles.card}>
          <span className={styles.top}>
            <span className={styles.num}>{s.isGrandFinal(m) ? 'Grand final' : `#${m.n}`}</span>
            <span>{fmtDate(m.date)}</span>
          </span>
          <span className={styles.line}>
            <TeamLink name={res!.winner} division={m.div} size={20} className={styles.win} />
            <span className={styles.score}>{res!.score ? `${res!.score[0]}–${res!.score[1]}` : 'W'}</span>
          </span>
          <span className={styles.line}>
            <TeamLink name={res!.loser} division={m.div} size={20} className={styles.lose} />
          </span>
        </li>
      ))}
    </ol>
  );
}
