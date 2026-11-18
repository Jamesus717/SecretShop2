import type { Patch, PatchLine } from '../../data/patches';
import { AdminNote, Hl, Icon, Rich } from './Lines';
import { Empty } from './Lists';
import { viewSections, type TabId } from './patchSearch';
import styles from './Patch.module.css';

const topLines = (lines: PatchLine[], n: number): PatchLine[] =>
  lines
    .filter((l) => !l.heading && l.kind !== 'neutral')
    .map((l, i) => ({ l, i }))
    .sort((a, b) => b.l.magnitude - a.l.magnitude || a.i - b.i)
    .slice(0, n)
    .map((x) => x.l);

const TYPE_LABEL = { hero: 'Hero', item: 'Item', general: 'General' } as const;
const GLYPH = { buff: '▲', nerf: '▼', rework: '↻', neutral: '•' } as const;

export default function Overview({ patch, q, goTab }: { patch: Patch; q: string; goTab: (t: TabId) => void }) {
  const h = patch.highlights;
  const verdicts = Object.values(h.heroVerdicts);
  const count = (v: string) => verdicts.filter((x) => x.verdict === v).length;
  const crazy = h.crazyChanges.filter((c) => {
    const t = `${c.name} ${c.blurb} ${c.line} ${c.ref}`.replace(/\*\*/g, '').toLowerCase();
    return !q || t.includes(q);
  });
  const sections = viewSections(patch.general, q);

  return (
    <div className={styles.stack}>
      {!q && (
        <section aria-label="Patch at a glance">
          <dl className={styles.stats}>
            <div><dt>Heroes changed</dt><dd>{verdicts.length}</dd></div>
            <div><dt><span aria-hidden="true">{GLYPH.buff}</span> Buffed</dt><dd>{count('buffed')}</dd></div>
            <div><dt><span aria-hidden="true">{GLYPH.nerf}</span> Nerfed</dt><dd>{count('nerfed')}</dd></div>
            <div><dt><span aria-hidden="true">{GLYPH.rework}</span> Reworked</dt><dd>{count('reworked')}</dd></div>
            <div><dt>Items changed</dt><dd>{patch.items.length}</dd></div>
          </dl>
        </section>
      )}

      <section aria-labelledby="ov-short">
        <h2 id="ov-short" className={styles.h2}>The short version</h2>
        {sections.length === 0 ? <Empty what="systems" /> : (
          <div className={styles.cards}>
            {sections.map(({ section, lines }) => {
              const top = topLines(lines, 3);
              return (
                <article key={section.title} className={styles.card}>
                  <h3 className={styles.h3}><Hl text={section.title} q={q} /></h3>
                  {top.length > 0 && (
                    <ul className={styles.lines}>
                      {top.map((l, i) => (
                        <li key={i} className={styles.line}>
                          <span className={`${styles.mk} ${styles[`k_${l.kind}`]}`}>
                            <span aria-hidden="true">{GLYPH[l.kind]}</span>
                            <span className="visually-hidden">{l.kind}: </span>
                          </span>
                          <span className={styles.lineBody}><span><Rich text={l.text} q={q} /></span></span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button type="button" className={styles.link} onClick={() => goTab('general')}>
                    All {section.lines.filter((l) => !l.heading).length} changes in General
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="ov-crazy">
        <h2 id="ov-crazy" className={styles.h2}>Crazy changes</h2>
        <AdminNote />
        {crazy.length === 0 ? <Empty what="crazy changes" /> : (
          <ol className={styles.crazy}>
            {crazy.map((c) => (
              <li key={c.id} className={styles.card}>
                <div className={styles.heroHead}>
                  <Icon src={c.icon} name={c.name} className={c.type === 'hero' ? styles.heroIcon : styles.itemIcon} />
                  <h3 className={styles.heroName}><Hl text={c.name} q={q} /></h3>
                  <span className={styles.badge}>{TYPE_LABEL[c.type]}</span>
                </div>
                <p className={styles.blurb}><Rich text={c.blurb} q={q} /></p>
                <p className={styles.valve}><span className={styles.valveTag}>Valve&apos;s line</span> <Rich text={c.line} q={q} /></p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
