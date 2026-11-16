import Section from '../../components/Section/Section';
import { SOCIALS } from '../../data/socials';
import styles from './About.module.css';

const FEATURES = [
  { title: 'Weekly Inhouses', text: 'Drop-in games every week.' },
  { title: 'Casting', text: 'Live commentary on league nights.' },
  { title: 'Coaching', text: 'Sessions from Balloon Dota.' },
  { title: 'SecretLeague', text: 'Our yearly tournament.' },
];

export default function About() {
  return (
    <Section id="about" title="What is SecretShop">
      <div className={styles.grid}>
        <div className={styles.copy}>
          <p>
            We are a UK Dota 2 community for new players and veterans alike. Whether you want new teammates,
            coaching or weekly inhouses, you are welcome here.
          </p>
          <p>
            Each year we host our tournament, <strong>SecretLeague</strong>, open to every player regardless of rank.
          </p>
          <ul className={styles.features}>
            {FEATURES.map((f) => (
              <li key={f.title} className={styles.feature}>
                <span className={styles.featureTitle}>{f.title}</span>
                <span className={styles.featureText}>{f.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.side}>
          <img className={styles.art} src="/assets/What_is_SecretShop_DOTA_Static.png" alt="SecretShop Dota 2 community artwork" loading="lazy" />
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
