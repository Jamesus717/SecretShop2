import type { ReactNode } from 'react';
import styles from './Section.module.css';

interface Props {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function Section({ id, eyebrow, title, lede, children, className }: Props) {
  return (
    <section id={id} className={`${styles.section} ${className ?? ''}`} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="container">
        <header className={styles.head}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h2 id={id ? `${id}-title` : undefined} className={styles.title}>{title}</h2>
          {lede && <p className={styles.lede}>{lede}</p>}
        </header>
        {children}
      </div>
    </section>
  );
}
