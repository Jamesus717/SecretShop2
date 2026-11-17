import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import NewsCard from '../../components/NewsCard/NewsCard';
import Skeleton from '../../components/Skeleton/Skeleton';
import { DIVISION_LABEL, DIVISION_ORDER, isDivisionKey, type DivisionKey } from '../../data/divisions';
import { hostOf, loadPublicClips, safeFileUrl, safeLink, when, type Clip } from '../../lib/clips';
import { loadNewsPosts, type NewsPost } from '../../lib/news';
import ArchiveShell from './ArchiveShell';
import styles from './Archive.module.css';

type Load<T> = { state: 'loading' | 'ready' | 'error'; items: T[] };

function ClipCard({ clip, mock }: { clip: Clip; mock: boolean }) {
  const link = safeLink(clip.link) ?? safeLink(clip.post_urls?.[0]);
  const file = safeFileUrl(clip.file_url ?? clip.file_path, mock);
  return (
    <li className={styles.clip}>
      {file && <video src={file} controls preload="metadata" />}
      <p className={styles.clipDesc}>{clip.description || 'Untitled clip'}</p>
      <span className={styles.clipMeta}>
        {clip.teams?.length ? `${clip.teams.join(' vs ')} · ` : ''}by {clip.submitter_name} · {when(clip.created_at)}
      </span>
      {link && <a href={link} target="_blank" rel="noopener noreferrer" className={styles.clipLink}>Watch on {hostOf(link)} ↗</a>}
    </li>
  );
}

/** Highlights: approved clips (when the clip queue can be read) and the match cards posted during the season. */
export default function ArchiveHighlightsPage() {
  const [params, setParams] = useSearchParams();
  const mock = params.has('mock');
  const rawDiv = params.get('div');
  const div: DivisionKey | null = isDivisionKey(rawDiv) ? rawDiv : null;

  const [clips, setClips] = useState<Load<Clip>>({ state: 'loading', items: [] });
  const [posts, setPosts] = useState<Load<NewsPost>>({ state: 'loading', items: [] });

  // Public, link-only clip list (GET /api/clips/public). Hidden when empty or unavailable.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const items = await loadPublicClips(mock);
        if (live) setClips({ state: 'ready', items: items.filter((c) => safeLink(c.link) || safeLink(c.post_urls?.[0]) || (mock && (c.file_path || c.file_url))) });
      } catch (e) {
        console.warn('Clips unavailable:', e instanceof Error ? e.message : e);
        if (live) setClips({ state: 'error', items: [] });
      }
    })();
    return () => { live = false; };
  }, [mock]);

  useEffect(() => {
    let live = true;
    setPosts((p) => ({ ...p, state: 'loading' }));
    loadNewsPosts({ limit: 24, division: div })
      .then((items) => { if (live) setPosts({ state: 'ready', items }); })
      .catch((e) => { console.warn('News cards unavailable:', e instanceof Error ? e.message : e); if (live) setPosts({ state: 'error', items: [] }); });
    return () => { live = false; };
  }, [div]);

  const setDiv = (d: DivisionKey | null) => {
    const next = new URLSearchParams(params);
    if (d) next.set('div', d); else next.delete('div');
    setParams(next, { replace: true });
  };

  return (
    <ArchiveShell tab="highlights" heading="Highlights" lede="The best moments and the match cards from SecretLeague I.">
      <div className={styles.hl}>
        {(clips.items.length > 0 || clips.state === 'loading') && (
          <section aria-labelledby="hl-clips">
            <h2 id="hl-clips" className={styles.hlHead}>Clips</h2>
            {clips.state === 'loading'
              ? <div className={styles.skCards} aria-busy="true" aria-label="Loading clips">{[0, 1, 2].map((i) => <Skeleton key={i} height={150} />)}</div>
              : <ul className={styles.clips}>{clips.items.map((c) => <ClipCard key={c.id} clip={c} mock={mock} />)}</ul>}
          </section>
        )}

        <section aria-labelledby="hl-cards">
          <h2 id="hl-cards" className={styles.hlHead}>Match cards</h2>
          <div className={styles.filters}>
            <div className={styles.filterRow} role="group" aria-label="Division">
              <span className={styles.filterLabel}>Division</span>
              <button type="button" className={styles.chip} aria-pressed={!div} onClick={() => setDiv(null)}>All</button>
              {DIVISION_ORDER.map((d) => (
                <button key={d} type="button" className={styles.chip} aria-pressed={div === d} onClick={() => setDiv(d)}>{DIVISION_LABEL[d]}</button>
              ))}
            </div>
          </div>

          {posts.state === 'loading' && (
            <div className={styles.skCards} aria-busy="true" aria-label="Loading match cards">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={200} />)}
            </div>
          )}
          {posts.state === 'error' && (
            <div className={styles.state} role="alert">
              <p>The match cards could not be loaded right now.</p>
              <p>Highlights are posted on the <Link to="/news">News page</Link> too. Try again in a minute.</p>
            </div>
          )}
          {posts.state === 'ready' && posts.items.length === 0 && (
            <div className={styles.state}>
              <p>{div ? `No ${DIVISION_LABEL[div]} division cards yet.` : 'No match cards have been posted yet.'}</p>
              <p>Browse everything on the <Link to="/news">News page</Link>.</p>
            </div>
          )}
          {posts.state === 'ready' && posts.items.length > 0 && (
            <>
              <ul className={styles.posts}>{posts.items.map((p) => <li key={p.id}><NewsCard post={p} /></li>)}</ul>
              <p className={styles.more}><Link to="/news">All news →</Link></p>
            </>
          )}
        </section>
      </div>
    </ArchiveShell>
  );
}
