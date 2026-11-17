import type { ReactNode } from 'react';
import type { Para, RuleSection } from '../../pages/Rules/content';
import styles from './InfoPage.module.css';

export function Paragraph({ para }: { para: Para }) {
  return (
    <p>
      {para.map((part, i) => {
        if (typeof part === 'string') return part;
        if ('b' in part) return <strong key={i}>{part.b}</strong>;
        return <a key={i} href={part.a} target="_blank" rel="noopener noreferrer">{part.t}</a>;
      })}
    </p>
  );
}

interface Props {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  sections?: RuleSection[];
  children?: ReactNode;
}

/** Simple page: eyebrow, big title, optional lede, then titled sections and/or custom children. */
export default function InfoPage({ eyebrow, title, lede, sections = [], children }: Props) {
  return (
    <div className={styles.page}>
      <header className="container">
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        {lede && <p className={styles.lede}>{lede}</p>}
      </header>
      <div className="container">
        {sections.length > 0 && (
          <div className={styles.panel}>
            {sections.map((s) => (
              <section key={s.id} id={s.id} className={styles.section} aria-labelledby={`${s.id}-h`}>
                <h2 id={`${s.id}-h`} className={styles.h2}>{s.title}</h2>
                {s.paras.map((para, i) => <Paragraph key={i} para={para} />)}
              </section>
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
