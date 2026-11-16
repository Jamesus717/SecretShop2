import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import DivisionTag from '../../components/DivisionTag/DivisionTag';
import { KIND_LABELS, imageUrl, type NewsPost } from '../../lib/news';
import { cardLink, setPostFields, youtubeId } from './newsApi';
import styles from './News.module.css';

function fullDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  post: NewsPost;
  index: number;
  count: number;
  isAdmin: boolean;
  onClose: () => void;
  onNav: (delta: -1 | 1) => void;
  onChanged: (post: NewsPost) => void;
}

/** Native <dialog> modal: focus is trapped and Esc closes it for free; arrows move between cards. */
export default function Lightbox({ post, index, count, isAdmin, onClose, onNav, onChanged }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [show, setShow] = useState<'card' | 'video'>('card');
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => { if (d?.open) d.close(); };
  }, []);

  // A new card starts on its image, with no stale message.
  useEffect(() => { setShow('card'); setMsg(null); setCopied(false); }, [post.id]);

  const img = imageUrl(post);

  function onKeyDown(e: KeyboardEvent<HTMLDialogElement>) {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); onNav(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onNav(1); }
  }

  // A click on the backdrop lands on the <dialog> element itself.
  function onBackdrop(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === ref.current) onClose();
  }

  async function copyLink() {
    const url = cardLink(post.id);
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: post.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* share cancelled or clipboard blocked: nothing to do */
    }
  }

  async function save(patch: { hidden?: boolean; youtube_id?: string | null }) {
    setSaving(true);
    setMsg(null);
    try {
      await setPostFields(post.id, patch);
      onChanged({ ...post, ...patch });
      setMsg({ text: 'Saved.', bad: false });
    } catch (err) {
      setMsg({ text: `Couldn't save: ${err instanceof Error ? err.message : String(err)}`, bad: true });
    } finally {
      setSaving(false);
    }
  }

  function saveVideo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const id = youtubeId(new FormData(e.currentTarget).get('yt'));
    if (id === undefined) { setMsg({ text: "That isn't a YouTube video link.", bad: true }); return; }
    void save({ youtube_id: id });
  }

  const ids = (post.match_ids || []).map((m) => String(m).replace(/\D/g, '')).filter(Boolean);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={post.title}
      onKeyDown={onKeyDown}
      onClick={onBackdrop}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
    >
      <div className={styles.dInner}>
        <button type="button" className={styles.dClose} onClick={onClose} aria-label="Close">✕</button>
        <div className={styles.dMedia}>
          {show === 'video' && post.youtube_id ? (
            // youtube-nocookie, and only built on click: no YouTube request or cookies for anyone who only looks at the card.
            <iframe
              className={styles.dVideo}
              src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(post.youtube_id)}?autoplay=1&rel=0`}
              title={`${post.title} highlights`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : img ? <img key={post.id} className={styles.dImg} src={img} alt={post.title} /> : null}
          {count > 1 && (
            <>
              <button type="button" className={`${styles.dNav} ${styles.dPrev}`} onClick={() => onNav(-1)} aria-label="Previous card" disabled={index <= 0}>‹</button>
              <button type="button" className={`${styles.dNav} ${styles.dNext}`} onClick={() => onNav(1)} aria-label="Next card" disabled={index >= count - 1}>›</button>
            </>
          )}
        </div>

        <div className={styles.dBody}>
          <h2 className={styles.dTitle}>{post.title}</h2>
          <div className={styles.meta}>
            {post.division && <DivisionTag division={post.division} />}
            <span>{KIND_LABELS[post.kind] || 'News'}</span>
            <time dateTime={post.created_at}>{fullDate(post.created_at)}</time>
            {post.hidden && <span className={styles.hiddenTag}>Hidden</span>}
          </div>
          {post.teams && post.teams.length > 0 && <p className={styles.teams}>{post.teams.join(' vs ')}</p>}

          {post.youtube_id && (
            <div className={styles.switch} role="group" aria-label="View">
              <button type="button" className={`${styles.sw} ${show === 'card' ? styles.swOn : ''}`} aria-pressed={show === 'card'} onClick={() => setShow('card')}>Card</button>
              <button type="button" className={`${styles.sw} ${show === 'video' ? styles.swOn : ''}`} aria-pressed={show === 'video'} onClick={() => setShow('video')}>▶ Highlights</button>
            </div>
          )}

          {ids.length > 0 && (
            <ul className={styles.links}>
              {ids.map((id, i) => (
                <li key={id}>
                  <span>{ids.length > 1 ? `Game ${i + 1}` : 'Match'}</span>
                  <a href={`https://www.opendota.com/matches/${id}`} target="_blank" rel="noopener noreferrer">OpenDota</a>
                  <a href={`https://www.dotabuff.com/matches/${id}`} target="_blank" rel="noopener noreferrer">Dotabuff</a>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.dActions}>
            <button type="button" className={styles.ghost} onClick={() => void copyLink()}>{copied ? 'Link copied' : 'Share / copy link'}</button>
            {count > 1 && <span className={styles.pos} aria-live="polite">{index + 1} / {count}</span>}
          </div>

          {isAdmin && (
            <div className={styles.admin}>
              <form className={styles.yt} onSubmit={saveVideo}>
                <input
                  className={styles.input}
                  type="url"
                  name="yt"
                  aria-label="YouTube link for this series' highlights"
                  placeholder="YouTube link for this series' highlights"
                  defaultValue={post.youtube_id ? `https://youtu.be/${post.youtube_id}` : ''}
                  key={post.id}
                />
                <button type="submit" className={styles.ghost} disabled={saving}>Save video</button>
              </form>
              <button type="button" className={styles.ghost} disabled={saving} onClick={() => void save({ hidden: !post.hidden })}>
                {post.hidden ? 'Show on the site' : 'Hide from the site'}
              </button>
              <p className={`${styles.msg} ${msg?.bad ? styles.bad : ''}`} role="status">{msg?.text ?? ''}</p>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
