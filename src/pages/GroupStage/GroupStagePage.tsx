import { Link } from 'react-router-dom';
import { playoffsLive } from '../../config';
import { DEFAULT_TIME, DIVISIONS, SCHEDULE, dateParts, dayId, matchOpts, totals, type Day, type DivKey, type Match } from './schedule';
import styles from './GroupStagePage.module.css';

type Outcome = 'win' | 'loss' | 'tie' | '';

function MatchRow({ m, div }: { m: Match; div: DivKey }) {
  const [num, a, b] = m;
  const { cast, time, score, forfeit } = matchOpts(m);
  const played = Array.isArray(score);
  const tie = played && score[0] === score[1];
  const outcome = (mine: number, theirs: number): Outcome => (!played ? '' : tie ? 'tie' : mine > theirs ? 'win' : 'loss');
  const aOut = played ? outcome(score[0], score[1]) : '';
  const bOut = played ? outcome(score[1], score[0]) : '';
  return (
    <li className={styles.match} data-div={div} data-played={played || undefined}>
      <span className={styles.num}>#{num}</span>
      <span className={styles.teams}>
        <span className={styles.team} data-out={aOut || undefined}>{a}</span>
        {played ? (
          <span className={styles.score} data-tie={tie || undefined}>{score[0]}<span className={styles.sep}>-</span>{score[1]}</span>
        ) : <span className={styles.vs}>vs</span>}
        <span className={styles.team} data-out={bOut || undefined}>{b}</span>
      </span>
      <span className={styles.tags}>
        {forfeit && <span className={styles.tag} title="Won by forfeit">Forfeit</span>}
        {tie && <span className={styles.tag}>Tie</span>}
        {time && <span className={styles.time} title="Different time to the rest of this day">{time}</span>}
        {cast && <span className={`${styles.tag} ${styles.cast}`} title="Being streamed">Cast · SL</span>}
      </span>
    </li>
  );
}

function DayBlock({ day }: { day: Day }) {
  const { dd, mon } = dateParts(day);
  return (
    <section className={styles.day} id={dayId(day)}>
      <header className={styles.dayHead}>
        <span className={styles.dayNum}>{dd}</span>
        <span className={styles.dayMeta}>
          <span className={styles.dayName}>{day.name}</span>
          <span className={styles.dayMonth}>{mon} · Week {day.week}</span>
        </span>
        <span className={styles.dayTime}>{day.time || DEFAULT_TIME} <span className={styles.tz}>BST</span></span>
      </header>
      {DIVISIONS.map(({ key, label }) => {
        const list = day.divisions[key];
        if (!list || !list.length) return null;
        return (
          <div key={key} className={styles.block}>
            <h3 className={styles.divLabel} data-div={key}>{label}</h3>
            <ul className={styles.matches}>{list.map((m) => <MatchRow key={m[0]} m={m} div={key} />)}</ul>
          </div>
        );
      })}
    </section>
  );
}

export default function GroupStagePage() {
  const t = totals();
  const archive = playoffsLive();
  const stats: [string | number, string][] = [[`${t.played}/${t.matches}`, 'played'], [t.days, 'match days'], [3, 'weeks'], [t.casts, 'casted picks']];

  return (
    <div className={styles.page}>
      <header className={`container ${styles.head}`}>
        <p className={styles.eyebrow}>SecretLeague I</p>
        <h1 className={styles.title}>Group Stage</h1>
        {archive && (
          <p className={styles.archive}>
            The group stage is over. This page is now the results archive. <Link to="/playoffs">Go to the playoff brackets</Link>.
          </p>
        )}
        <p className={styles.lede}>
          Every fixture across Upper, Mid and Lower. Please flag an admin if any of your matches clash.
          All times are provisional {DEFAULT_TIME} BST unless your captain says otherwise.
          Final tables are on <Link to="/standings">Standings</Link>.
        </p>
        <ul className={styles.stats}>
          {stats.map(([n, label]) => <li key={label}><b>{n}</b> {label}</li>)}
        </ul>
        <ul className={styles.legend} aria-label="Legend">
          {DIVISIONS.map((d) => <li key={d.key}><span className={styles.dot} data-div={d.key} />{d.label}</li>)}
          <li className={styles.legendCast}>Cast · SL: being streamed</li>
        </ul>
      </header>

      <nav className={styles.jumpBar} aria-label="Jump to a match day">
        <div className={`container ${styles.jump}`}>
          {SCHEDULE.map((day) => {
            const { dd, mon } = dateParts(day);
            return (
              <a key={dayId(day)} className={styles.pill} href={`#${dayId(day)}`}>
                <span className={styles.pillDay}>{day.name.slice(0, 3)}</span>
                <span className={styles.pillDate}>{dd} {mon}</span>
              </a>
            );
          })}
        </div>
      </nav>

      <div className={`container ${styles.days}`}>
        {SCHEDULE.map((day) => <DayBlock key={dayId(day)} day={day} />)}
        <p className={styles.foot}>
          Mid division is not a full round robin: Free Bans Gang play two fewer matches due to limited availability,
          which keeps the whole group stage inside three weeks. Match times are provisional; reply in Discord if your slot doesn't work.
        </p>
      </div>
    </div>
  );
}
