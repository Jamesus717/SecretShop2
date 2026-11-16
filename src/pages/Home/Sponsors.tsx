import Marquee from '../../components/Marquee/Marquee';
import Section from '../../components/Section/Section';
import styles from './Sponsors.module.css';

const SPONSORS = [
  {
    name: 'Imprint Esports',
    href: 'https://imprint.gg/',
    img: '/assets/sponsoredimages/ImprintEsports/img1.png',
    text: 'Match data, player and team ratings, and leaderboards for our website, Discord and streams.',
  },
  {
    name: 'Balloon Dota',
    href: 'https://balloondota.com/',
    img: '/assets/sponsoredimages/BalloonDota/official.png',
    text: 'Highly rated Dota 2 coach with over 1,000 students and 19 years of experience.',
  },
  {
    name: 'Dota 2 Ireland',
    href: 'https://dota2ireland.com/',
    img: '/assets/sponsoredimages/IDL/idlbanner.png',
    text: 'The home of Irish Dota. Runs the Irish Dota League, now in its 7th season.',
  },
];

export default function Sponsors() {
  return (
    <Section id="sponsors" title="Supported by">
      <div className={styles.plate}>
        <Marquee label="Our sponsors">
          {[...SPONSORS, ...SPONSORS].map((s, i) => (
            <a key={`${s.name}-${i}`} href={s.href} target="_blank" rel="noopener noreferrer" className={styles.logo} aria-label={s.name}>
              <img src={s.img} alt={s.name} loading="lazy" />
            </a>
          ))}
        </Marquee>
      </div>
      <ul className={styles.cards}>
        {SPONSORS.map((s) => (
          <li key={s.name} className={styles.card}>
            <h3 className={styles.name}>{s.name}</h3>
            <p className={styles.text}>{s.text}</p>
            <a href={s.href} target="_blank" rel="noopener noreferrer" className={styles.visit}>Visit {s.name}</a>
          </li>
        ))}
      </ul>
    </Section>
  );
}
