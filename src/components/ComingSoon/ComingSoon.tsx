import styles from './ComingSoon.module.css';

/** Placeholder body for pages other workstreams will replace. */
export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="container">
      <div className={styles.panel}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.note}>Coming soon in this build.</p>
      </div>
    </div>
  );
}
