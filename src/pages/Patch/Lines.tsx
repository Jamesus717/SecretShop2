import { useState } from 'react';
import { toSegments } from '../../data/patches/helpers.mjs';
import type { ChangeKind, PatchLine, Verdict } from '../../data/patches';
import { splitMatches } from './patchSearch';
import styles from './Patch.module.css';

/** Highlights search hits inside plain text. */
export function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  return (
    <>
      {splitMatches(text, q).map((p, i) => (p.hit ? <mark key={i} className={styles.mark}>{p.text}</mark> : p.text))}
    </>
  );
}

/** Valve text with **bold** markers, plus highlights. */
export function Rich({ text, q }: { text: string; q: string }) {
  return (
    <>
      {toSegments(text).map((s, i) => (s.bold ? <strong key={i}><Hl text={s.text} q={q} /></strong> : <Hl key={i} text={s.text} q={q} />))}
    </>
  );
}

const KIND: Record<ChangeKind, { glyph: string; word: string }> = {
  buff: { glyph: '▲', word: 'Buff' },
  nerf: { glyph: '▼', word: 'Nerf' },
  rework: { glyph: '↻', word: 'Rework' },
  neutral: { glyph: '•', word: 'Change' },
};
const SIZE = ['small', 'medium', 'big'];

/** Small marker: a shape plus a hidden word, so colour is never the only signal. Size = repeats (1 to 3). */
export function Marker({ kind, magnitude = 1 }: { kind: ChangeKind; magnitude?: 1 | 2 | 3 }) {
  const k = KIND[kind];
  return (
    <span className={`${styles.mk} ${styles[`k_${kind}`]}`}>
      <span aria-hidden="true">{kind === 'neutral' ? k.glyph : k.glyph.repeat(magnitude)}</span>
      <span className="visually-hidden">{k.word}{kind === 'neutral' ? '' : `, ${SIZE[magnitude - 1]}`}: </span>
    </span>
  );
}

export function LineList({ lines, q }: { lines: PatchLine[]; q: string }) {
  if (!lines.length) return null;
  return (
    <ul className={styles.lines}>
      {lines.map((l, i) =>
        l.heading ? (
          <li key={i} className={styles.lineHead}><Rich text={l.text} q={q} /></li>
        ) : (
          <li key={i} className={`${styles.line} ${l.indent > 1 ? styles.deep : ''}`}>
            <Marker kind={l.kind} magnitude={l.magnitude} />
            <span className={styles.lineBody}>
              <span><Rich text={l.text} q={q} />{l.aghs && <span className={styles.aghs}>{l.aghs === 'scepter' ? 'Scepter' : 'Shard'}</span>}</span>
              {l.info && <span className={styles.info}><Rich text={l.info} q={q} /></span>}
            </span>
          </li>
        ),
      )}
    </ul>
  );
}

/** Valve CDN icon, or a neutral placeholder (new abilities have no icon yet; failed loads fall back too). */
export function Icon({ src, name, className }: { src: string | null | undefined; name: string; className?: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) {
    return <span className={`${styles.iconPh} ${className ?? ''}`} aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>;
  }
  return <img className={`${styles.icon} ${className ?? ''}`} src={src} alt="" loading="lazy" decoding="async" onError={() => setBad(true)} />;
}

const VERDICT: Record<Verdict, { glyph: string; word: string; cls: ChangeKind }> = {
  buffed: { glyph: '▲', word: 'Buffed', cls: 'buff' },
  nerfed: { glyph: '▼', word: 'Nerfed', cls: 'nerf' },
  reworked: { glyph: '↻', word: 'Reworked', cls: 'rework' },
  mixed: { glyph: '±', word: 'Mixed', cls: 'neutral' },
};

export function VerdictBadge({ verdict }: { verdict: Verdict | undefined }) {
  if (!verdict) return <span className={`${styles.badge} ${styles.k_neutral}`}>No change</span>;
  const v = VERDICT[verdict];
  return (
    <span className={`${styles.badge} ${styles[`k_${v.cls}`]}`}>
      <span aria-hidden="true">{v.glyph}</span> {v.word}
    </span>
  );
}

/** The "picks are ours" note required on Crazy Changes and Biggest buffs & nerfs. */
export function AdminNote() {
  return <p className={styles.adminNote}>Admins are still reading. Picks by SecretShop. Numbers are always Valve&apos;s.</p>;
}
