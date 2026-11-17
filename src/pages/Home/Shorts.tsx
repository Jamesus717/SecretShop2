import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import Section from '../../components/Section/Section';
import { SHORTS, shortThumb, shortUrl, type Short } from '../../data/shorts';
import { SOCIALS } from '../../data/socials';
import { setConsent, useConsent } from '../../lib/consent';
import { youtubeAnchor } from '../../lib/youtubeApp';
import styles from './Shorts.module.css';

const SHOW = 3;
const YOUTUBE = SOCIALS.find((s) => s.name === 'YouTube')?.href ?? 'https://www.youtube.com/@SecretShopDOTA';

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** "Clips from Season 1": a random handful of our YouTube Shorts; click one to watch and step through them. */
export default function Shorts() {
  const [order, setOrder] = useState<Short[]>(() => shuffled(SHORTS));
  const [open, setOpen] = useState<number | null>(null);
  const shown = order.slice(0, SHOW);

  return (
    <Section id="clips" className={styles.centred} title="Clips from Season 1" lede="Three random clips from SecretLeague I. Shuffle for more.">
      <ul className={styles.grid}>
        {shown.map((s, i) => (
          <li key={s.id}>
            <button type="button" className={styles.card} onClick={() => setOpen(i)} aria-label={`Play: ${s.title}`}>
              <img src={shortThumb(s.id)} alt="" loading="lazy" width={360} height={640} />
              <span className={styles.play} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
              </span>
              <span className={styles.title}>{s.title}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <button type="button" className={styles.shuffle} onClick={() => setOrder(shuffled(SHORTS))}>Shuffle clips</button>
        <a {...youtubeAnchor(YOUTUBE)} className={styles.more}>More on YouTube ↗</a>
      </div>
      {open !== null && (
        <Player list={shown} index={open} onNav={(d) => setOpen((o) => (o === null ? o : (o + d + shown.length) % shown.length))} onClose={() => setOpen(null)} />
      )}
    </Section>
  );
}

function Player({ list, index, onNav, onClose }: { list: Short[]; index: number; onNav: (d: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const consent = useConsent();
  const s = list[index];

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => { if (d?.open) d.close(); };
  }, []);

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); onNav(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); onNav(-1); }
  }, [onNav]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={s.title}
      onKeyDown={onKey}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.inner}>
        <div className={styles.media}>
          {consent === 'all' ? (
            // youtube-nocookie, built only once the visitor opens a clip with consent.
            <iframe
              key={s.id}
              src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(s.id)}?autoplay=1&rel=0&playsinline=1`}
              title={s.title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : (
            <div className={styles.consent} style={{ backgroundImage: `url(${shortThumb(s.id)})` }}>
              <div className={styles.consentBox}>
                <p>This clip is hosted by YouTube, which may set cookies and see your IP address. It plays here only if you accept optional cookies.</p>
                <button type="button" className={styles.btn} onClick={() => setConsent('all')}>Accept all and play</button>
                <a className={styles.btnGhost} {...youtubeAnchor(shortUrl(s.id))}>Watch on YouTube ↗</a>
                <p className={styles.small}><Link to="/privacy" onClick={onClose}>Privacy &amp; cookies</Link></p>
              </div>
            </div>
          )}
        </div>
        <div className={styles.bar}>
          <button type="button" className={styles.nav} onClick={() => onNav(-1)} aria-label="Previous clip">‹</button>
          <p className={styles.now}><span className="num">{index + 1}/{list.length}</span> {s.title}</p>
          <button type="button" className={styles.nav} onClick={() => onNav(1)} aria-label="Next clip">›</button>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">✕</button>
        </div>
      </div>
    </dialog>
  );
}
