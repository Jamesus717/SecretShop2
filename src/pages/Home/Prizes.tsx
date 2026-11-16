import Section from '../../components/Section/Section';
import styles from './Prizes.module.css';

const TIERS = [
  { place: 1, label: '1st place', reward: '£250 total (£50 per player)', extra: 'Plus an exclusive Discord role' },
  { place: 2, label: '2nd place', reward: 'Prize to be announced', extra: 'Plus an exclusive Discord role' },
  { place: 3, label: '3rd place', reward: 'Special Discord role', extra: '' },
];

export default function Prizes() {
  return (
    <Section id="prizes" title="Prize pool">
      <ol className={styles.grid}>
        {TIERS.map((t) => (
          <li key={t.place} className={styles.tier} data-place={t.place}>
            <span className={styles.medal} aria-hidden="true">{t.place}</span>
            <div>
              <h3 className={styles.place}>{t.label}</h3>
              <p className={styles.reward}>{t.reward}</p>
              {t.extra && <p className={styles.extra}>{t.extra}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
