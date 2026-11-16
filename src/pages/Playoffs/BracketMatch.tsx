import type { CSSProperties } from 'react';
import { crewText, streamLabel, streamLinks, whenText, type MatchRow, type MatchState, type Schedule } from '../../lib/playoffs';
import StateTag from './StateTag';
import TeamLink from './TeamLink';
import styles from './Bracket.module.css';

interface Props {
  match: MatchRow;
  schedule: Schedule;
  state: MatchState;
  isFinal: boolean;
  /** This match is on the champion's path (they played it). */
  onPath: boolean;
  /** Finished match the champion did not play: dimmed. */
  dim: boolean;
  championName: string | null;
  style: CSSProperties;
}

export default function BracketMatch({ match: m, schedule: s, state, isFinal, onPath, dim, championName, style }: Props) {
  const res = s.matchResult(m);
  const crew = crewText(m);
  const links = streamLinks(m.stream);
  const label = isFinal ? 'Grand final' : `#${m.n}`;

  const row = (side: 'a' | 'b') => {
    const slot = m[side];
    const team = s.slotTeam(slot, m.div);
    const won = res?.winnerSide === side;
    const lost = res?.loserSide === side;
    const games = res?.score ? (won ? res.score[0] : res.score[1]) : null;
    const isChamp = Boolean(isFinal && won && championName);
    return (
      <div className={`${styles.team} ${won ? styles.won : ''} ${lost ? styles.lost : ''}`}>
        <TeamLink name={team} placeholder={s.slotText(slot, m.div)} division={m.div} size={20} />
        {isChamp && <span className={styles.champ}>Champions</span>}
        {games != null && <span className={styles.games}>{games}</span>}
      </div>
    );
  };

  return (
    <article
      className={`${styles.match} ${onPath ? styles.path : ''} ${dim ? styles.dim : ''} ${isFinal ? styles.final : ''}`}
      style={style}
      aria-label={`${isFinal ? 'Grand final' : `Match ${m.n}`}: ${s.slotText(m.a, m.div)} vs ${s.slotText(m.b, m.div)}`}
    >
      <header className={styles.head}>
        <span className={styles.num}>{label}</span>
        <span className={styles.meta}>Bo{m.bo} · {whenText(m)}</span>
        <StateTag state={state} />
      </header>
      {row('a')}
      {row('b')}
      <footer className={styles.foot}>
        <span className={styles.crew} title={crew}>{crew}</span>
        {links.slice(0, 1).map((u) => (
          <a key={u} href={u} target="_blank" rel="noopener noreferrer" className={styles.stream}>{streamLabel(u)}</a>
        ))}
      </footer>
    </article>
  );
}
