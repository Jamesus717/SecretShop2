import Marquee from '../../components/Marquee/Marquee';
import Section from '../../components/Section/Section';
import { SPONSORS, type Sponsor } from '../../data/sponsors';
import styles from './Sponsors.module.css';

function Logo({ s }: { s: Sponsor }) {
  const cls = `${styles.logo} ${s.tall ? styles.tall : ''}`;
  const img = <img src={s.img} alt={s.name} loading="lazy" />;
  return s.href
    ? <a href={s.href} target="_blank" rel="noopener noreferrer" className={cls} aria-label={s.name}>{img}</a>
    : <span className={cls}>{img}</span>;
}

export default function Sponsors() {
  return (
    <Section id="sponsors" title="Supported by">
      <div className={styles.plate}>
        <Marquee label="Our sponsors and partners">
          {[...SPONSORS, ...SPONSORS].map((s, i) => <Logo key={`${s.name}-${i}`} s={s} />)}
        </Marquee>
      </div>
      <ul className={styles.cards}>
        {SPONSORS.map((s) => (
          <li key={s.name} className={styles.card}>
            <h3 className={styles.name}>{s.name}</h3>
            <p className={styles.text}>{s.text}</p>
            <p className={styles.links}>
              {s.href && <a href={s.href} target="_blank" rel="noopener noreferrer" className={styles.visit}>Visit {s.name}</a>}
              {s.extra && <a href={s.extra.href} target="_blank" rel="noopener noreferrer" className={styles.visit}>{s.extra.label}</a>}
              {!s.href && !s.extra && <span className={styles.soon}>Website coming soon</span>}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
