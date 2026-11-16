import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DivisionTag from '../../components/DivisionTag/DivisionTag';
import Skeleton from '../../components/Skeleton/Skeleton';
import { useAuth } from '../../lib/authContext';
import { DIV_LABELS, KIND_LABELS, formatPostDate, thumbUrl, type DivisionKey, type NewsPost } from '../../lib/news';
import AddCard from './AddCard';
import Lightbox from './Lightbox';
import { loadNewsPosts } from '../../lib/news';
import { PAGE_SIZE, cardLink, loadOne } from './newsApi';
import styles from './News.module.css';

const DIVISIONS: DivisionKey[] = ['upper', 'mid', 'lower'];
const KINDS = Object.keys(KIND_LABELS);

export default function NewsPage() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const cardParam = params.get('card');

  const [division, setDivision] = useState<DivisionKey | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [extra, setExtra] = useState<NewsPost | null>(null); // a ?card= post that isn't in the loaded pages
  const [toast, setToast] = useState('');
  const seq = useRef(0);

  const load = useCallback(async (reset: boolean, before: string | null) => {
    const mine = ++seq.current;
    setLoading(true);
    setFailed(false);
    try {
      const page = await loadNewsPosts({ limit: PAGE_SIZE, before, division, kind, includeHidden: true });
      if (mine !== seq.current) return;
      setPosts((prev) => (reset ? page : [...prev, ...page]));
      setDone(page.length < PAGE_SIZE);
    } catch (e) {
      if (mine !== seq.current) return;
      console.error('Could not load cards:', e);
      setFailed(true);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [division, kind]);

  // Reload from the top on filter change, and when admin status lands (hidden posts appear).
  useEffect(() => { setPosts([]); setDone(false); void load(true, null); }, [load, isAdmin]);

  // ?card=<id> deep link: use the loaded post, or fetch it.
  const found = cardParam ? posts.find((p) => String(p.id) === cardParam) ?? (extra && String(extra.id) === cardParam ? extra : null) : null;
  useEffect(() => {
    if (!cardParam || found || loading) return;
    let live = true;
    void loadOne(cardParam).then((p) => { if (live && p) setExtra(p); });
    return () => { live = false; };
  }, [cardParam, found, loading]);

  const list = found && !posts.some((p) => p.id === found.id) ? [found] : posts;
  const index = found ? list.findIndex((p) => p.id === found.id) : -1;

  const openCard = (p: NewsPost) => setParams((prev) => { const n = new URLSearchParams(prev); n.set('card', String(p.id)); return n; }, { replace: false });
  const closeCard = useCallback(() => setParams((prev) => { const n = new URLSearchParams(prev); n.delete('card'); return n; }, { replace: true }), [setParams]);
  const nav = (delta: -1 | 1) => {
    const next = list[index + delta];
    if (next) setParams((prev) => { const n = new URLSearchParams(prev); n.set('card', String(next.id)); return n; }, { replace: true });
  };
  const changed = (p: NewsPost) => {
    setPosts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    setExtra((x) => (x && x.id === p.id ? p : x));
  };

  async function share(p: NewsPost) {
    try {
      await navigator.clipboard.writeText(cardLink(p.id));
      setToast('Link copied');
    } catch {
      setToast("Couldn't copy the link");
    }
    window.setTimeout(() => setToast(''), 2000);
  }

  const empty = !loading && !failed && posts.length === 0;

  return (
    <div className={`container ${styles.pad}`}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>SecretLeague</p>
          <h1 className={styles.title}>News</h1>
          <p className={styles.lede}>Every result card, newest first.</p>
        </div>
        {isAdmin && <button type="button" className={styles.primary} onClick={() => setAdding(true)}>+ Add card</button>}
      </header>

      <div className={styles.filters} aria-label="Filters">
        <div className={styles.chips} role="group" aria-label="Division">
          <button type="button" className={`${styles.chip} ${!division ? styles.chipOn : ''}`} aria-pressed={!division} onClick={() => setDivision(null)}>All divisions</button>
          {DIVISIONS.map((d) => (
            <button key={d} type="button" className={`${styles.chip} ${division === d ? styles.chipOn : ''}`} aria-pressed={division === d} onClick={() => setDivision(d)}>
              {DIV_LABELS[d]}
            </button>
          ))}
        </div>
        <div className={styles.chips} role="group" aria-label="Type">
          <button type="button" className={`${styles.chip} ${!kind ? styles.chipOn : ''}`} aria-pressed={!kind} onClick={() => setKind(null)}>All types</button>
          {KINDS.map((k) => (
            <button key={k} type="button" className={`${styles.chip} ${kind === k ? styles.chipOn : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      {posts.length > 0 && (
        <ul className={styles.grid}>
          {posts.map((p) => {
            const img = thumbUrl(p);
            return (
              <li key={p.id} className={`${styles.tile} ${p.hidden ? styles.tileHidden : ''}`}>
                <button type="button" className={styles.tileBtn} onClick={() => openCard(p)} aria-label={`Open ${p.title}`}>
                  <span className={styles.media}>
                    {img && <img src={img} alt="" loading="lazy" decoding="async" />}
                    {p.youtube_id && <span className={styles.play} aria-label="Has highlights video">▶</span>}
                  </span>
                  <span className={styles.tBody}>
                    <span className={styles.meta}>
                      {p.division && <DivisionTag division={p.division} />}
                      <span>{KIND_LABELS[p.kind] || 'News'}</span>
                      <time dateTime={p.created_at}>{formatPostDate(p.created_at)}</time>
                      {p.hidden && <span className={styles.hiddenTag}>Hidden</span>}
                    </span>
                    <span className={styles.tTitle}>{p.title}</span>
                  </span>
                </button>
                <button type="button" className={styles.shareBtn} onClick={() => void share(p)} aria-label={`Copy link to ${p.title}`} title="Copy link">⧉</button>
              </li>
            );
          })}
        </ul>
      )}

      {loading && posts.length === 0 && (
        <ul className={styles.grid} aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <li key={i}><Skeleton height={260} /></li>)}
        </ul>
      )}

      <p className={styles.status} role="status">
        {failed ? "Couldn't load cards. Try refreshing." : empty ? 'No cards here yet.' : loading && posts.length > 0 ? 'Loading cards…' : ''}
      </p>
      {!done && !loading && posts.length > 0 && (
        <p className={styles.moreRow}>
          <button type="button" className={styles.ghost} onClick={() => void load(false, posts[posts.length - 1].created_at)}>Load more</button>
        </p>
      )}

      {found && index >= 0 && (
        <Lightbox post={found} index={index} count={list.length} isAdmin={isAdmin} onClose={closeCard} onNav={nav} onChanged={changed} />
      )}
      {adding && <AddCard onClose={() => setAdding(false)} onDone={() => { setAdding(false); void load(true, null); }} />}
      <div className={`${styles.toast} ${toast ? styles.toastOn : ''}`} role="status">{toast}</div>
    </div>
  );
}
