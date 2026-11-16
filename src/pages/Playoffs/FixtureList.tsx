import { crewText, streamLabel, streamLinks, whenText, type Division, type Schedule, type UkClock } from '../../lib/playoffs';
import StateTag from './StateTag';
import TeamLink from './TeamLink';
import styles from './Fixtures.module.css';

interface Props { schedule: Schedule; division: Division; now: UkClock }

/** Every match of the division grouped by week, in match order. */
export default function FixtureList({ schedule: s, division, now }: Props) {
  const matches = s.matches(division).sort((a, b) => (a.week ?? 99) - (b.week ?? 99) || (a.n as number) - (b.n as number));
  const weeks = [...new Set(matches.map((m) => m.week))];
  const final = s.finalRow(division);

  return (
    <div className={styles.fixtures}>
      {weeks.map((w) => (
        <section key={w ?? 'tbd'} className={styles.week} aria-label={w != null ? `Week ${w}` : 'Date to be confirmed'}>
          <h3 className={styles.weekTitle}>{w != null ? `Week ${w}` : 'To be confirmed'}</h3>
          <ul className={styles.list}>
            {matches.filter((m) => m.week === w).map((m) => {
              const res = s.matchResult(m);
              const state = s.matchState(m, now);
              const links = streamLinks(m.stream);
              const crew = crewText(m);
              const team = (side: 'a' | 'b') => {
                const slot = m[side];
                const name = s.slotTeam(slot, m.div);
                const cls = res ? (res.winnerSide === side ? styles.won : styles.lost) : '';
                return (
                  <span className={`${styles.side} ${cls}`}>
                    <TeamLink name={name} placeholder={s.slotText(slot, m.div)} division={m.div} size={20} />
                    {res?.score && <span className={styles.games}>{res.winnerSide === side ? res.score[0] : res.score[1]}</span>}
                  </span>
                );
              };
              return (
                <li key={m.n} className={styles.row}>
                  <div className={styles.when}>
                    <span className={styles.num}>{m === final ? 'Grand final' : `#${m.n}`}</span>
                    <span>{whenText(m)}</span>
                    <span className={styles.bo}>Bo{m.bo}{m.elim ? ' · Elim' : ''}</span>
                  </div>
                  <div className={styles.teams}>
                    {team('a')}
                    <span className={styles.vs} aria-hidden="true">v</span>
                    {team('b')}
                  </div>
                  <div className={styles.extra}>
                    <StateTag state={state} />
                    {crew && <span className={styles.crew}>{crew}</span>}
                    {links.slice(0, 1).map((u) => (
                      <a key={u} href={u} target="_blank" rel="noopener noreferrer" className={styles.stream}>{streamLabel(u)}</a>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
