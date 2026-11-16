import { motion, useReducedMotion } from 'framer-motion';
import Button from '../../components/Button/Button';
import Countdown from '../../components/Countdown/Countdown';
import { DISCORD_URL, lazyLeagueStartDate } from '../../config';
import styles from './Hero.module.css';

const SLOTS = Array.from({ length: 12 }, (_, i) => i);

export default function Hero() {
  const reduce = useReducedMotion();
  const start = lazyLeagueStartDate();

  // One orchestrated entrance: 12px rise + fade, staggered.
  const item = (i: number) => reduce
    ? {}
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay: 0.08 * i, ease: [0.22, 0.8, 0.3, 1] as const } };

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.art} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />
      <div className={`container ${styles.inner}`}>
        <motion.p className={styles.tag} {...item(0)}>Coming soon</motion.p>
        <motion.h1 id="hero-title" className={styles.wordmark} {...item(1)}>
          <span>Lazy</span>
          <span>League</span>
        </motion.h1>
        <motion.div className={styles.when} {...item(2)}>
          {start ? <Countdown target={start} /> : <p className={styles.tba}>Date to be announced</p>}
        </motion.div>
        <motion.div className={styles.ctas} {...item(3)}>
          <Button href={DISCORD_URL}>Join the Discord</Button>
          <Button href="#champions" variant="ghost">See SecretLeague I champions</Button>
        </motion.div>

        <motion.div className={styles.teasers} {...item(4)}>
          <ul className={styles.slots} aria-label="Twelve team slots, not yet revealed">
            {SLOTS.map((i) => (
              <li key={i} className={styles.slot} style={{ ['--i' as string]: i }}>
                <span aria-hidden="true">?</span>
              </li>
            ))}
          </ul>
          <p className={styles.reveal}>Teams revealed at sign-ups</p>
        </motion.div>
      </div>
    </section>
  );
}
