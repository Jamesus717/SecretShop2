import Button from '../../components/Button/Button';
import Section from '../../components/Section/Section';
import { KOFI_URL } from '../../config';
import styles from './Support.module.css';

const USES = ['Running tournaments', 'Server and website costs', 'Supporting the Admins'];

export default function Support() {
  return (
    <Section id="support" title="Support SecretLeague">
      <div className={styles.panel}>
        <div className={styles.copy}>
          <p>
            SecretLeague is run by volunteers. If you enjoy it and want to help keep things running,
            you can chip in on Ko-fi. Every bit helps, and it is never expected.
          </p>
          <ul className={styles.uses}>
            {USES.map((u) => <li key={u}>{u}</li>)}
          </ul>
        </div>
        <div className={styles.cta}>
          <span className={styles.cup} aria-hidden="true">☕</span>
          {KOFI_URL
            ? <Button href={KOFI_URL}>Support us on Ko-fi</Button>
            : <p className={styles.soon}>Ko-fi link coming soon</p>}
        </div>
      </div>
    </Section>
  );
}
