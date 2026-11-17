import { Link } from 'react-router-dom';
import Button from '../../components/Button/Button';
import Countdown from '../../components/Countdown/Countdown';
import InfoPage from '../../components/InfoPage/InfoPage';
import { DISCORD_URL, lazyLeagueStartDate } from '../../config';
import styles from './LazyLeague.module.css';

// The quick version. Every number here comes from the full rulebook (lazyLeagueContent.ts).
const RULEBOOK = '/dota/lazy-league/rules';

const STEPS = [
  { k: 'Join the Discord', v: 'Everything happens there.' },
  { k: 'Pick a team', v: 'In fan-selection. Locked until the season ends.' },
  { k: 'Play or support', v: 'Play in the games, or just bet, vote and cheer.' },
];

const RULES = [
  <>Matches are <b>real Dota 2 series</b>. The bot opens the lobby <b>15 minutes</b> before.</>,
  <><b>No coin toss.</b> The bot rolls. The winner picks side or pick order.</>,
  <>Teams have <b>5 players max</b>. Can't play? Your captain finds a standin.</>,
  <>Your fan team is <b>locked for the season</b>. No switching.</>,
  <>Do something <b>once every 7 days</b> (cheer, bet, beg, vote) to share the winnings.</>,
  <><b>Only players who opt in can die.</b> You can back out until the first result.</>,
];

const EARN = [
  ['Your team wins', '2,000 pot, shared'],
  ['First time you show up', '250'],
  ['Beg', '50 a day'],
  ['Rampage, Ultra kill, no deaths, top damage', '50 each'],
  ['Series MVP (fan vote)', '250'],
];

const SPEND = [
  ['Bet on a series', 'Winners share the pot'],
  ['Vote in the player auction', 'n votes = n² × 10'],
  ['Shield a player', '1,000'],
  ['Curse a rival', '1,000'],
  ['Change the weather', '1,000 reroll · 3,000 choose'],
  ['Revive a dead player', '5,000'],
];

const CHAOS = [
  { k: 'Death', v: 'Opted-in players can die for the season: feeding, random fires, curses. Max 1 death a day. New players are safe for 3 series.' },
  { k: 'Weather', v: 'Every series rolls weather. It can double the pot, refund all bets, or flip the draft to Reverse Captains Mode.' },
  { k: 'The Election', v: 'Late in the season, fans vote on rule changes for next season. Bigger pots, purges, a new team.' },
];

const FAQ = [
  ['Do I have to play?', 'No. Fans join in without playing.'],
  ['Can I die as a fan?', 'No. Only opted-in players.'],
  ['Does the bot change the Dota game?', 'No. Only the gold, the lobby and sometimes the draft format.'],
];

export default function LazyLeaguePage() {
  const start = lazyLeagueStartDate();
  return (
    <InfoPage
      eyebrow="Dota 2 · Coming soon"
      title="Lazy League"
      lede={start ? <Countdown target={start} /> : 'A real Dota 2 league where fans run the gold. Date to be announced.'}
    >
      <div className={styles.page}>
        <section className={styles.tldr} aria-label="In short">
          <p><b>Real Dota.</b> Proper series, played in lobbies our bot hosts.</p>
          <p><b>Fans run the gold.</b> Earn it when your team wins. Spend it on bets, votes and chaos.</p>
          <p><b>Chaos is optional.</b> Players can opt in to die. Fans never can.</p>
        </section>

        <section className={styles.block} aria-labelledby="ll-start">
          <h2 id="ll-start" className={styles.h2}>Get started</h2>
          <ol className={styles.steps}>
            {STEPS.map((s, i) => (
              <li key={s.k}><span className={styles.n}>{i + 1}</span><div><b>{s.k}</b><span>{s.v}</span></div></li>
            ))}
          </ol>
        </section>

        <section className={styles.block} aria-labelledby="ll-rules">
          <h2 id="ll-rules" className={styles.h2}>The rules that matter</h2>
          <ol className={styles.rules}>{RULES.map((r, i) => <li key={i}>{r}</li>)}</ol>
        </section>

        <section className={styles.block} aria-labelledby="ll-gold">
          <h2 id="ll-gold" className={styles.h2}>Gold</h2>
          <p className={styles.note}>Teams have no gold. Fans pay for everything from their own wallet.</p>
          <div className={styles.two}>
            <div>
              <h3 className={styles.h3}>Earn</h3>
              <dl className={styles.list}>{EARN.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            </div>
            <div>
              <h3 className={styles.h3}>Spend</h3>
              <dl className={styles.list}>{SPEND.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            </div>
          </div>
        </section>

        <section className={styles.block} aria-labelledby="ll-chaos">
          <h2 id="ll-chaos" className={styles.h2}>The chaos</h2>
          <div className={styles.three}>
            {CHAOS.map((c) => <div key={c.k}><h3 className={styles.h3}>{c.k}</h3><p>{c.v}</p></div>)}
          </div>
        </section>

        <section className={styles.block} aria-labelledby="ll-faq">
          <h2 id="ll-faq" className={styles.h2}>Quick answers</h2>
          <dl className={styles.faq}>{FAQ.map(([q, a]) => <div key={q}><dt>{q}</dt><dd>{a}</dd></div>)}</dl>
        </section>

        <section className={styles.more} aria-label="Next steps">
          <div>
            <h2 className={styles.h2}>Want every detail?</h2>
            <p>Auction, transfers, betting odds, every weather type, death odds and the Election decrees.</p>
          </div>
          <div className={styles.ctas}>
            <Button href={DISCORD_URL}>Join the Discord</Button>
            <Link to={RULEBOOK} className={styles.bookLink}>Read the full rulebook</Link>
          </div>
        </section>
      </div>
    </InfoPage>
  );
}
