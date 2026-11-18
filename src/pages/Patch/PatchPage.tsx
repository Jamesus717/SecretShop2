import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Patch } from '../../data/patches';
import Heroes from './Heroes';
import { Biggest, General, Items, NeutralCreeps, NeutralItems } from './Lists';
import Overview from './Overview';
import { isTabId, normQuery, tabCounts, TABS, type TabId } from './patchSearch';
import styles from './Patch.module.css';

const VERSION = '7.42';

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default function PatchPage() {
  const [patch, setPatch] = useState<Patch | null>(null);
  const [failed, setFailed] = useState(false);
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(() => params.get('q') ?? '');
  const input = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // The patch JSON is ~450 KB: load it as its own chunk, after the page shell paints.
  useEffect(() => {
    let live = true;
    import('../../data/patches')
      .then((m) => { const p = m.getPatch(VERSION); if (live) { if (p) setPatch(p); else setFailed(true); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  const rawTab = params.get('tab');
  const tab: TabId = isTabId(rawTab) ? rawTab : 'overview';
  const q = normQuery(useDeferredValue(text));

  const writeParams = useCallback((nextTab: TabId, nextText: string, replace: boolean) => {
    const p = new URLSearchParams();
    if (nextTab !== 'overview') p.set('tab', nextTab);
    if (nextText.trim()) p.set('q', nextText.trim());
    setParams(p, { replace });
  }, [setParams]);

  const counts = useMemo(() => (patch && q ? tabCounts(patch, q) : null), [patch, q]);

  const onSearch = (value: string) => {
    setText(value);
    const nq = normQuery(value);
    let next = tab;
    if (patch && nq) {
      const c = tabCounts(patch, nq);
      if (c[tab] === 0) { const hit = TABS.find((t) => c[t.id] > 0); if (hit) next = hit.id; }
    }
    writeParams(next, value, true);
  };
  const selectTab = (id: TabId) => { writeParams(id, text, false); };

  // "/" focuses the search box; Esc inside it clears.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (text) { e.preventDefault(); onSearch(''); } else input.current?.blur();
    }
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TABS.length - 1;
    if (n < 0) return;
    e.preventDefault();
    selectTab(TABS[n].id);
    tabRefs.current[TABS[n].id]?.focus();
  };

  const others = counts ? TABS.filter((t) => t.id !== tab && counts[t.id] > 0) : [];

  return (
    <div className={styles.page}>
      <header className="container">
        <p className={styles.eyebrow}>Dota 2 · Gameplay patch</p>
        <h1 className={styles.title}>Patch {VERSION}</h1>
        <p className={styles.lede}>
          {patch ? `Released ${formatDate(patch.timestamp)}. ` : ''}Every change, filterable and searchable. Numbers are Valve&apos;s own.
        </p>
        <form className={styles.search} role="search" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="patch-search" className={styles.searchLabel}>Search the patch <span className="visually-hidden">(press / to focus)</span></label>
          <div className={styles.searchRow}>
            <input
              id="patch-search"
              ref={input}
              type="search"
              className={styles.input}
              placeholder="Search heroes, items, abilities"
              autoComplete="off"
              spellCheck={false}
              value={text}
              onChange={(e) => onSearch(e.target.value)}
              onKeyDown={onInputKey}
              aria-describedby="patch-search-status"
            />
            {text && <button type="button" className={styles.clear} onClick={() => { onSearch(''); input.current?.focus(); }}>Clear</button>}
          </div>
          <p id="patch-search-status" className={styles.searchStatus} role="status">
            {counts ? `${Object.values(counts).reduce((a, b) => a + b, 0)} matches across ${TABS.filter((t) => counts[t.id] > 0).length} tabs` : ''}
          </p>
        </form>
      </header>

      <div className={styles.tabsBar}>
        <div className="container">
          <div role="tablist" aria-label="Patch sections" className={styles.tabs}>
            {TABS.map((t) => (
              <button
                key={t.id}
                ref={(el) => { tabRefs.current[t.id] = el; }}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="patch-panel"
                tabIndex={tab === t.id ? 0 : -1}
                className={styles.tab}
                onClick={() => selectTab(t.id)}
                onKeyDown={onTabKey}
              >
                {t.label}
                {counts && <span className={`${styles.tabCount} ${counts[t.id] === 0 ? styles.zero : ''}`}>{counts[t.id]}<span className="visually-hidden"> matches</span></span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="container">
        <div id="patch-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className={styles.panelWrap}>
          {failed && <p className={styles.empty}>Could not load the patch notes. Refresh to try again.</p>}
          {!patch && !failed && <p className={styles.empty} role="status">Loading patch notes…</p>}
          {patch && (
            <>
              {counts && counts[tab] === 0 && others.length > 0 && (
                <p className={styles.jump}>
                  Nothing in this tab. Matches in:{' '}
                  {others.map((t) => (
                    <button key={t.id} type="button" className={styles.link} onClick={() => selectTab(t.id)}>{t.label} ({counts[t.id]})</button>
                  ))}
                </p>
              )}
              {tab === 'overview' && <Overview patch={patch} q={q} goTab={selectTab} />}
              {tab === 'general' && <General patch={patch} q={q} />}
              {tab === 'heroes' && <Heroes patch={patch} q={q} />}
              {tab === 'items' && <Items patch={patch} q={q} />}
              {tab === 'neutral-items' && <NeutralItems patch={patch} q={q} />}
              {tab === 'neutral-creeps' && <NeutralCreeps patch={patch} q={q} />}
              {tab === 'biggest' && <Biggest patch={patch} q={q} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
