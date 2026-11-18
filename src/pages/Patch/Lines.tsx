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

const WORD: Record<ChangeKind, string> = { buff: 'Buff', nerf: 'Nerf', rework: 'Rework', neutral: 'Change' };
const SIZE = ['small', 'medium', 'big'];

/**
 * One marker everywhere: a text pill (BUFF / NERF / REWORK) with magnitude as 1 to 3 filled ticks.
 * Neutral lines get a plain bullet, no box. The word is always visible, so colour is never the only signal.
 */
export function Marker({ kind, magnitude = 1 }: { kind: ChangeKind; magnitude?: 1 | 2 | 3 }) {
  if (kind === 'neutral') return <span className={styles.bullet} aria-hidden="true">•</span>;
  return (
    <span className={`${styles.pill} ${styles[`k_${kind}`]}`}>
      {WORD[kind]}
      {kind !== 'rework' && (
        <span className={styles.ticks} aria-hidden="true">
          {[1, 2, 3].map((n) => <i key={n} className={n <= magnitude ? styles.on : undefined} />)}
        </span>
      )}
      {kind !== 'rework' && <span className="visually-hidden">, {SIZE[magnitude - 1]}: </span>}
    </span>
  );
}

const REQ = /^(Requires .*?)\.?\s+(Total cost: [\d,]+g)\s*$/;

/** Valve text, with long "Requires ..." recipes split so the total cost stands out. */
function LineText({ text, q }: { text: string; q: string }) {
  const m = REQ.exec(text);
  if (!m) return <Rich text={text} q={q} />;
  return (
    <>
      <span className={styles.req}><Rich text={m[1]} q={q} /></span>
      <span className={styles.cost}><Hl text={m[2]} q={q} /></span>
    </>
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
              <span><LineText text={l.text} q={q} />{l.aghs && <span className={styles.aghs}>{l.aghs === 'scepter' ? 'Scepter' : 'Shard'}</span>}</span>
              {l.info && <span className={styles.info}><Rich text={l.info} q={q} /></span>}
            </span>
          </li>
        ),
      )}
    </ul>
  );
}

type GlyphName = 'global' | 'lanes' | 'objectives' | 'terrain' | 'creep';
const GLYPH_FOR: Record<string, GlyphName> = {
  'global mechanics': 'global',
  'lane creeps, towers and bases': 'lanes',
  'map objectives': 'objectives',
  'terrain changes': 'terrain',
  'general changes': 'creep',
};
const PATHS: Record<GlyphName, string> = {
  global: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  lanes: 'M5 21V9l3-2V4h2v3l2 1 2-1V4h2v3l3 2v12M9 21v-5h6v5',
  objectives: 'M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8Z',
  terrain: 'M2 20 9 7l4 7 3-4 6 10Z',
  creep: 'M12 4c-3 0-5 2.5-5 5.5 0 2 1 3 1 5 0 3 2 5.500 4 5.500s4-2.500 4-5.500c0-2 1-3 1-5C17 6.500 15 4 12 4ZM9.500 10h.01M14.500 10h.01',
};

/** Line-art glyph for entries that have no Valve icon (General sections, neutral creeps). */
export function Glyph({ name, className }: { name: string; className?: string }) {
  const key = GLYPH_FOR[name.trim().toLowerCase()] ?? 'global';
  return (
    <span className={`${styles.glyph} ${className ?? ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={PATHS[key]} /></svg>
    </span>
  );
}

/** Valve CDN icon, or a neutral placeholder (new abilities have no icon yet; failed loads fall back too). */
export function Icon({ src, name, className, eager = false }: { src: string | null | undefined; name: string; className?: string; eager?: boolean }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) {
    return <span className={`${styles.iconPh} ${className ?? ''}`} aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>;
  }
  return <img className={`${styles.icon} ${className ?? ''}`} src={src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setBad(true)} />;
}

const VERDICT: Record<Verdict, { word: string; cls: ChangeKind }> = {
  buffed: { word: 'Buffed', cls: 'buff' },
  nerfed: { word: 'Nerfed', cls: 'nerf' },
  reworked: { word: 'Reworked', cls: 'rework' },
  mixed: { word: 'Mixed', cls: 'neutral' },
};

export function VerdictBadge({ verdict }: { verdict: Verdict | undefined }) {
  if (!verdict) return <span className={`${styles.badge} ${styles.k_neutral}`}>No change</span>;
  const v = VERDICT[verdict];
  return (
    <span className={`${styles.badge} ${styles[`k_${v.cls}`]}`}>
      {v.word}
    </span>
  );
}

/** The "picks are ours" note required on Crazy Changes and Biggest buffs & nerfs. */
export function AdminNote() {
  return <p className={styles.adminNote}>Admins are still reading. Picks by SecretShop. Numbers are always Valve&apos;s.</p>;
}
