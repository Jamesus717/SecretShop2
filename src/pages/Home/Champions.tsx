import CountUp from '../../components/CountUp/CountUp';
import Section from '../../components/Section/Section';
import { SECRETLEAGUE_I } from '../../data/champions';
import ChampionPanel from './ChampionPanel';
import styles from './Champions.module.css';

export default function Champions() {
  const { divisions, teams, series, season, year } = SECRETLEAGUE_I;
  const [upper, ...rest] = divisions;
  const stats: [number, string][] = [[divisions.length, 'Divisions'], [teams, 'Teams'], [series, 'Series']];

  return (
    <Section id="champions" eyebrow={`${season} · ${year}`} title="Champions" className={styles.section}>
      <div className={styles.room}>
        <ul className={styles.stats} aria-label={`${season} in numbers`}>
          {stats.map(([n, label]) => (
            <li key={label}>
              <span className={styles.statNum}><CountUp value={n} /></span>
              <span className={styles.statLabel}>{label}</span>
            </li>
          ))}
        </ul>

        <ChampionPanel division={upper} featured />
        <div className={styles.pair}>
          {rest.map((d) => <ChampionPanel key={d.key} division={d} />)}
        </div>
      </div>
    </Section>
  );
}
