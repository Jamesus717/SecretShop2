import { useId, useState, type PointerEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Crest from '../../components/Crest/Crest';
import DivisionTag from '../../components/DivisionTag/DivisionTag';
import type { ChampionDivision } from '../../data/champions';
import styles from './ChampionPanel.module.css';

const Trophy = ({ size = 28 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
    <path d="M7 3h10v2h3a1 1 0 0 1 1 1v1.5A4.5 4.5 0 0 1 16.6 12 5 5 0 0 1 13 14.9V17h3a1 1 0 0 1 1 1v2H7v-2a1 1 0 0 1 1-1h3v-2.1A5 5 0 0 1 7.4 12 4.5 4.5 0 0 1 3 7.5V6a1 1 0 0 1 1-1h3V3Zm-2 4v.5A2.5 2.5 0 0 0 7 10V7H5Zm14 0h-2v3a2.5 2.5 0 0 0 2-2.5V7Z" />
  </svg>
);

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

interface Props {
  division: ChampionDivision;
  featured?: boolean;
}

export default function ChampionPanel({ division: d, featured = false }: Props) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const pathId = useId();
  const crestSize = featured ? 160 : 120;

  // Hover opens the path for mouse users; tap/click/keyboard toggles for everyone.
  const onEnter = (e: PointerEvent) => { if (e.pointerType === 'mouse') setOpen(true); };
  const onLeave = (e: PointerEvent) => { if (e.pointerType === 'mouse') setOpen(false); };

  return (
    <motion.article
      className={`${styles.panel} ${featured ? styles.featured : ''}`}
      data-div={d.key}
      aria-label={`${d.label} champions`}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: [0.22, 0.8, 0.3, 1] }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      <div className={styles.glow} aria-hidden="true" />

      <div className={styles.top}>
        <div className={styles.crestWrap}>
          <Crest name={d.champion.name} division={d.key} size={crestSize} />
        </div>
        <div className={styles.head}>
          <div className={styles.tags}>
            <DivisionTag division={d.key} label={d.label} />
            <span className={styles.crown}><Trophy size={18} /> Champions</span>
          </div>
          <h3 className={styles.name}>{d.champion.name}</h3>
          <p className={styles.final}>
            Won the final <strong className="num">{d.final.score}</strong>
            <span className={styles.sep} aria-hidden="true" />
            {d.final.format}, {formatDate(d.final.date)}
          </p>
        </div>
        <span className={styles.trophy} aria-hidden="true"><Trophy size={featured ? 72 : 48} /></span>
      </div>

      <ul className={styles.roster} aria-label={`${d.champion.name} roster`}>
        {d.champion.roster.map(([ign, pos], i) => (
          <li key={`${ign}-${i}`} className={styles.chip}>
            <span className={styles.pos} title={`Position ${pos}`}><span className="visually-hidden">Position </span>{pos}</span>
            <span className={styles.ign}>{ign}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={pathId}
        onClick={() => setOpen((o) => !o)}
      >
        <span>Path to the title</span>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" className={styles.chev} data-open={open}>
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={pathId}
            className={styles.pathWrap}
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            <ol className={styles.path}>
              {d.path.map((step, i) => {
                const last = i === d.path.length - 1;
                return (
                  <motion.li
                    key={step}
                    className={`${styles.step} ${last ? styles.stepFinal : ''}`}
                    initial={reduce ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: reduce ? 0 : 0.08 * i, ease: 'easeOut' }}
                  >
                    {step}
                  </motion.li>
                );
              })}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.runner}>
        <Crest name={d.runnerUp.name} division={d.key} size={40} />
        <div className={styles.runnerText}>
          <span className={styles.runnerLabel}>Runner-up</span>
          <span className={styles.runnerName}>{d.runnerUp.name}</span>
        </div>
        <span className={`${styles.runnerScore} num`}>{d.final.score.split('–').reverse().join('–')}</span>
        <span className={styles.third}>Third: {d.third}</span>
      </div>
    </motion.article>
  );
}
