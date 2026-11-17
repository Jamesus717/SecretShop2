import { Link } from 'react-router-dom';
import { closeConsentSettings, setConsent, useConsent, useConsentPanelVisible } from '../../lib/consent';
import styles from './ConsentBanner.module.css';

/**
 * Small, non-blocking bar. No focus trap, no overlay: the page stays usable behind it.
 * "Essential only" and "Accept all" are deliberately the same size and style.
 */
export default function ConsentBanner() {
  const visible = useConsentPanelVisible();
  const current = useConsent();
  if (!visible) return null;
  return (
    <section className={styles.bar} aria-labelledby="consent-title">
      <div className={styles.text}>
        <h2 id="consent-title" className={styles.title}>Cookies &amp; storage</h2>
        <p>
          We keep a few things in your browser to make the site work (login, theme, this choice). Optional extras, such as
          YouTube videos, only load if you accept. <Link to="/privacy">Privacy policy</Link>
        </p>
        {current && <p className={styles.now}>Current choice: {current === 'all' ? 'accept all' : 'essential only'}.</p>}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.btn} onClick={() => setConsent('essential')}>Essential only</button>
        <button type="button" className={styles.btn} onClick={() => setConsent('all')}>Accept all</button>
        {current && <button type="button" className={styles.close} onClick={closeConsentSettings}>Close</button>}
      </div>
    </section>
  );
}
