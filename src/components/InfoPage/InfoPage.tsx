import type { ReactNode } from 'react';
import type { Block, Para, RuleSection } from '../../pages/Rules/content';
import styles from './InfoPage.module.css';

function Parts({ para }: { para: Para }) {
  return (
    <>
      {para.map((part, i) => {
        if (typeof part === 'string') return part;
        if ('b' in part) return <strong key={i}>{part.b}</strong>;
        return <a key={i} href={part.a} target="_blank" rel="noopener noreferrer">{part.t}</a>;
      })}
    </>
  );
}

export function Paragraph({ para }: { para: Para }) {
  return <p><Parts para={para} /></p>;
}

function BlockView({ block }: { block: Block }) {
  if ('p' in block) return <Paragraph para={block.p} />;
  if ('h3' in block) return <h3 className={styles.h3}>{block.h3}</h3>;
  if ('ul' in block) return <ul className={styles.list}>{block.ul.map((it, i) => <li key={i}><Parts para={it} /></li>)}</ul>;
  if ('ol' in block) return <ol className={styles.list}>{block.ol.map((it, i) => <li key={i}><Parts para={it} /></li>)}</ol>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        {block.head && <thead><tr>{block.head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>}
        <tbody>
          {block.table.map((row, r) => (
            <tr key={r}>{row.map((c, i) => (i === 0 && !block.head ? <th key={i} scope="row"><Parts para={c} /></th> : <td key={i}><Parts para={c} /></td>))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  sections?: RuleSection[];
  children?: ReactNode;
  /** Show a list of section links above the sections. */
  toc?: boolean;
}

/** Simple page: eyebrow, big title, optional lede, then titled sections and/or custom children. */
export default function InfoPage({ eyebrow, title, lede, sections = [], children, toc = false }: Props) {
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
            {toc && (
              <nav className={styles.toc} aria-label="On this page">
                <ul>{sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}</ul>
              </nav>
            )}
            {sections.map((s) => (
              <section key={s.id} id={s.id} className={styles.section} aria-labelledby={`${s.id}-h`}>
                <h2 id={`${s.id}-h`} className={styles.h2}>{s.title}</h2>
                {s.paras.map((para, i) => <Paragraph key={i} para={para} />)}
                {s.blocks?.map((b, i) => <BlockView key={`b${i}`} block={b} />)}
              </section>
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
