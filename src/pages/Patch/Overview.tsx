import type { Patch } from '../../data/patches';
import { AdminNote, Glyph, Hl, Icon, Rich } from './Lines';
import { Empty } from './Lists';
import { type TabId } from './patchSearch';
import styles from './Patch.module.css';

const TYPE_LABEL = { hero: 'Hero', item: 'Item', general: 'General' } as const;
const TAB_NAME: Record<string, string> = { general: 'General', 'neutral-items': 'Neutral items', items: 'Items', heroes: 'Heroes' };

export default function Overview({ patch, q, goTab }: { patch: Patch; q: string; goTab: (t: TabId) => void }) {
  const h = patch.highlights;
  const verdicts = Object.values(h.heroVerdicts);
  const count = (v: string) => verdicts.filter((x) => x.verdict === v).length;
  const crazy = h.crazyChanges.filter((c) => {
    const t = `${c.name} ${c.blurb} ${c.line} ${c.ref}`.replace(/\*\*/g, '').toLowerCase();
    return !q || t.includes(q);
  });
  const cards = patch.tldr.cards.filter((c) => !q || `${c.title} ${c.bullets.map((b) => b.text).join(' ')}`.toLowerCase().includes(q));

  return (
    <div className={styles.stack}>
      {!q && (
        <section aria-label="Patch at a glance">
          <dl className={styles.stats}>
            <div><dt>Heroes changed</dt><dd>{verdicts.length}</dd></div>
            <div><dt>Buffed</dt><dd>{count('buffed')}</dd></div>
            <div><dt>Nerfed</dt><dd>{count('nerfed')}</dd></div>
            <div><dt>Reworked</dt><dd>{count('reworked')}</dd></div>
            <div><dt>Items changed</dt><dd>{patch.items.length}</dd></div>
          </dl>
        </section>
      )}

      <section aria-labelledby="ov-short">
        <h2 id="ov-short" className={styles.h2}>The short version</h2>
        {cards.length === 0 ? <Empty what="systems" /> : (
          <div className={styles.tldr}>
            {cards.map((c) => (
              <article key={c.id} className={styles.tldrCard}>
                <h3 className={styles.tldrTitle}><Hl text={c.title} q={q} /></h3>
                <ul className={styles.tldrList}>
                  {c.bullets.map((b) => <li key={b.text}><Hl text={b.text} q={q} /></li>)}
                </ul>
                <button type="button" className={styles.link} onClick={() => goTab(c.tab)}>
                  See all in {TAB_NAME[c.tab]}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="ov-crazy">
        <h2 id="ov-crazy" className={styles.h2}>Crazy changes</h2>
        <AdminNote />
        {crazy.length === 0 ? <Empty what="crazy changes" /> : (
          <ol className={styles.crazy}>
            {crazy.map((c) => (
              <li key={c.id} className={styles.crazyItem}>
                {c.type === 'general'
                  ? <Glyph name={c.name} className={styles.crazyIcon} />
                  : <Icon src={c.icon} name={c.name} className={c.type === 'hero' ? styles.crazyHero : styles.crazyItemIcon} />}
                <div className={styles.crazyBody}>
                  <p className={styles.crazyMeta}><span><Hl text={c.name} q={q} /></span><span className={styles.badge}>{TYPE_LABEL[c.type]}</span></p>
                  <h3 className={styles.crazyBlurb}><Rich text={c.blurb} q={q} /></h3>
                  <p className={styles.valve}><span className={styles.valveTag}>Valve&apos;s line</span> <Rich text={c.line} q={q} /></p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
