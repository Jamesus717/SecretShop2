import { useEffect, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { championMatchNumbers, layoutBracket, type Division, type Schedule, type UkClock } from '../../lib/playoffs';
import BracketMatch from './BracketMatch';
import styles from './Bracket.module.css';

// Geometry in px. The bracket scrolls inside its own container, never the page.
const CARD_W = 232;
const CARD_H = 104;
const COL_W = 272;
const ROW_H = 128;
const PAD_X = 16;
const PAD_Y = 34;

interface Props {
  schedule: Schedule;
  division: Division;
  now: UkClock;
  /** Champion name from the sheet's grand final, else the static champions data. */
  championName: string | null;
}

export default function Bracket({ schedule: s, division, now, championName }: Props) {
  const reduce = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => layoutBracket(s, division), [s, division]);
  const onPathNums = useMemo(() => championMatchNumbers(s, division, championName), [s, division, championName]);

  // Phones: open on the right so the grand final is in view; the user swipes back through the rounds.
  useEffect(() => {
    const el = scroller.current;
    if (el && window.innerWidth < 720) el.scrollLeft = el.scrollWidth;
  }, [division, layout]);

  const width = PAD_X * 2 + (layout.cols - 1) * COL_W + CARD_W;
  const height = PAD_Y + layout.rows * ROW_H + 8;
  const pos = new Map(layout.nodes.map((n) => [n.match.n as number, { x: PAD_X + n.col * COL_W, y: PAD_Y + n.row * ROW_H, node: n }]));

  const edgePath = (from: number, to: number): string | null => {
    const a = pos.get(from);
    const b = pos.get(to);
    if (!a || !b) return null;
    const x1 = a.x + CARD_W;
    const y1 = a.y + CARD_H / 2;
    const x2 = b.x;
    const y2 = b.y + CARD_H / 2;
    const mid = x2 - (COL_W - CARD_W) / 2;
    return `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`;
  };

  const sectionLabels = [
    { text: 'Winners bracket', x: PAD_X, y: PAD_Y - 22 },
    ...(layout.elimStartRow != null ? [{ text: 'Elimination bracket', x: PAD_X, y: PAD_Y + layout.elimStartRow * ROW_H - 22 }] : []),
    ...(layout.finalMatch ? [{ text: 'Grand final', x: PAD_X + (layout.cols - 1) * COL_W, y: (pos.get(layout.finalMatch.n as number)?.y ?? 0) - 22 }] : []),
  ];

  return (
    <div className={styles.wrap}>
      <p className={styles.swipe} aria-hidden="true">Swipe the bracket sideways</p>
      <div className={styles.scroller} ref={scroller} tabIndex={0} role="region" aria-label="Bracket, scrolls sideways">
        <div className={styles.canvas} style={{ width, height }}>
          <svg className={styles.lines} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            {layout.edges.map((e) => {
              const d = edgePath(e.from, e.to);
              return d ? <path key={`${e.from}-${e.to}`} d={d} className={styles.line} /> : null;
            })}
            {layout.edges.map((e) => {
              const d = edgePath(e.from, e.to);
              const from = s.findMatch(division, e.from);
              const lit = Boolean(d && from && championName && s.sameTeam(s.matchResult(from)?.winner, championName));
              if (!d || !lit) return null;
              const col = pos.get(e.from)?.node.col ?? 0;
              return reduce ? (
                <path key={`lit-${e.from}-${e.to}`} d={d} className={styles.lit} />
              ) : (
                <motion.path
                  key={`lit-${e.from}-${e.to}`}
                  d={d}
                  className={styles.lit}
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.7, delay: 0.15 + col * 0.35, ease: [0.22, 0.8, 0.3, 1] }}
                />
              );
            })}
          </svg>
          {sectionLabels.map((l) => (
            <span key={l.text} className={styles.label} style={{ left: l.x, top: l.y }}>{l.text}</span>
          ))}
          {layout.nodes.map((n) => {
            const m = n.match;
            const state = s.matchState(m, now);
            const onPath = onPathNums.has(m.n as number);
            return (
              <BracketMatch
                key={m.n}
                match={m}
                schedule={s}
                state={state}
                isFinal={n.section === 'final'}
                onPath={onPath}
                dim={state === 'done' && !onPath}
                championName={championName}
                style={{ left: pos.get(m.n as number)?.x, top: pos.get(m.n as number)?.y, width: CARD_W, height: CARD_H }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
