import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { FAQ, INFO, PAGE_TITLE, RULES, TAB_LABELS, type Para, type RuleSection, type TabKey } from './content';
import styles from './Rules.module.css';

const TABS: TabKey[] = ['rules', 'info', 'faq'];
const DATA: Record<TabKey, RuleSection[]> = { rules: RULES, info: INFO, faq: FAQ };

/** Which tab holds a given section id (for /rules#stand-ins style links). */
function tabForHash(hash: string): TabKey | null {
  const id = decodeURIComponent(hash.replace(/^#/, ''));
  if ((TABS as string[]).includes(id)) return id as TabKey;
  return TABS.find((t) => DATA[t].some((s) => s.id === id)) ?? null;
}

function Paragraph({ para }: { para: Para }) {
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

export default function RulesPage() {
  const { hash } = useLocation();
  const [tab, setTab] = useState<TabKey>(() => tabForHash(hash) ?? 'rules');
  const [open, setOpen] = useState<Set<string>>(new Set());

  // Follow hash changes (links from elsewhere, back/forward), then scroll to the section.
  useEffect(() => {
    const t = tabForHash(hash);
    if (!t) return;
    setTab(t);
    const id = decodeURIComponent(hash.replace(/^#/, ''));
    if (t === 'faq') setOpen((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    const raf = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(raf);
  }, [hash]);

  const select = useCallback((t: TabKey) => {
    setTab(t);
    window.history.replaceState(null, '', `${window.location.pathname}#${t}`);
    window.scrollTo({ top: 0 });
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.indexOf(tab);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    select(TABS[next]);
    document.getElementById(`rules-tab-${TABS[next]}`)?.focus();
  }

  const toggle = (id: string) => setOpen((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div className={styles.page}>
      <header className="container">
        <p className={styles.eyebrow}>SecretLeague</p>
        <h1 className={styles.title}>{PAGE_TITLE.replace('SecretLeague — ', '')}</h1>
      </header>

      <div className={styles.tabbar}>
        <div className="container">
          <div className={styles.tabs} role="tablist" aria-label="Rules, info and FAQ" onKeyDown={onKeyDown}>
            {TABS.map((t) => (
              <button
                key={t}
                id={`rules-tab-${t}`}
                type="button"
                role="tab"
                aria-selected={tab === t}
                aria-controls={`rules-panel-${t}`}
                tabIndex={tab === t ? 0 : -1}
                className={`${styles.tab} ${tab === t ? styles.on : ''}`}
                onClick={() => select(t)}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="container">
        <div className={styles.layout}>
          {tab !== 'faq' && (
            <nav className={styles.toc} aria-label="On this page">
              <ul>
                {DATA[tab].map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
              </ul>
            </nav>
          )}

          <div
            id={`rules-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`rules-tab-${tab}`}
            className={styles.panel}
          >
            {tab !== 'faq' ? (
              DATA[tab].map((s) => (
                <section key={s.id} id={s.id} className={styles.section} aria-labelledby={`${s.id}-h`}>
                  <h2 id={`${s.id}-h`} className={styles.h2}>
                    <a href={`#${s.id}`} className={styles.anchor} aria-label={`Link to ${s.title}`}>{s.title}</a>
                  </h2>
                  {s.paras.map((para, i) => <Paragraph key={i} para={para} />)}
                </section>
              ))
            ) : (
              <div className={styles.faq}>
                {FAQ.map((s) => {
                  const isOpen = open.has(s.id);
                  return (
                    <section key={s.id} id={s.id} className={styles.faqItem}>
                      <h2 className={styles.faqQ}>
                        <button
                          type="button"
                          className={styles.faqBtn}
                          aria-expanded={isOpen}
                          aria-controls={`${s.id}-a`}
                          onClick={() => toggle(s.id)}
                        >
                          <span>{s.title}</span>
                          <span className={styles.chev} aria-hidden="true" />
                        </button>
                      </h2>
                      <div id={`${s.id}-a`} role="region" aria-labelledby={s.id} hidden={!isOpen} className={styles.faqA}>
                        {s.paras.map((para, i) => <Paragraph key={i} para={para} />)}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
