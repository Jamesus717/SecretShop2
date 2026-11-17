import { Link } from 'react-router-dom';
import { CONTACT_EMAIL } from '../config';
import { openConsentSettings } from '../lib/consent';
import { SOCIALS } from '../data/socials';
import styles from './Footer.module.css';
import { youtubeAnchor } from '../lib/youtubeApp';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <Link to="/" className={styles.brand} aria-label="SecretLeague home">
          <img src="/assets/logo.png" alt="" width={36} height={36} />
          <span>SecretLeague</span>
        </Link>
        <ul className={styles.socials}>
          {SOCIALS.map((s) => (
            <li key={s.name}>
              <a {...(s.name === 'YouTube' ? youtubeAnchor(s.href) : { href: s.href, target: '_blank', rel: 'noopener noreferrer' })} aria-label={s.name} className={styles.social}>
                <img src={s.icon} alt="" />
              </a>
            </li>
          ))}
        </ul>
        <nav className={styles.links} aria-label="Footer">
          <Link to="/dota/secretleague" className={styles.rules}>Rules &amp; Info</Link>
          <Link to="/minecraft">Minecraft rules</Link>
          <Link to="/privacy">Privacy &amp; cookies</Link>
          <button type="button" className={styles.settings} onClick={openConsentSettings}>Cookie settings</button>
          <a href={`mailto:${CONTACT_EMAIL}`} className={styles.mail}>{CONTACT_EMAIL}</a>
        </nav>
      </div>
    </footer>
  );
}
