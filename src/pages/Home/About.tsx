import { Link } from 'react-router-dom';
import Section from '../../components/Section/Section';
import { SOCIALS } from '../../data/socials';
import styles from './About.module.css';

const GAMES = [
  { title: 'Dota 2', text: 'SecretLeague Dota and Lazy League tournaments.', to: '/dota' },
  { title: 'Deadlock', text: 'Coming soon.', to: '/deadlock' },
  { title: 'Minecraft', text: 'Our community server and build gallery.', to: '/minecraft' },
  { title: 'News', text: 'Results, announcements and highlights.', to: '/news' },
];

export default function About() {
  return (
    <Section id="about" title="What is SecretLeague">
      <div className={styles.grid}>
        <div className={styles.copy}>
          <p>
            We are a UK gaming community for new players and veterans alike. Whether you want teammates,
            a tournament to play in or a server to build on, you are welcome here.
          </p>
          <p>
            We run <strong>Dota 2</strong> tournaments open to every rank, a <strong>Minecraft</strong> server,
            and <strong>Deadlock</strong> is on the way.
          </p>
          <ul className={styles.features}>
            {GAMES.map((g) => (
              <li key={g.title}>
                <Link to={g.to} className={styles.feature}>
                  <span className={styles.featureTitle}>{g.title}</span>
                  <span className={styles.featureText}>{g.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.side}>
          <img className={styles.art} src="/assets/What_is_SecretShop_DOTA_Static.png" alt="SecretLeague community artwork" loading="lazy" />
          <h3 className={styles.follow}>Follow us</h3>
          <ul className={styles.socials}>
            {SOCIALS.map((s) => (
              <li key={s.name}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className={styles.social}>
                  <img src={s.icon} alt="" />
                  <span>{s.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
