import { useRef, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import Section from '../../components/Section/Section';
import Skeleton from '../../components/Skeleton/Skeleton';
import { playoffsLive } from '../../config';
import { SECRETLEAGUE_I } from '../../data/champions';
import { fmtDate, type Division } from '../../lib/playoffs';
import { ukZone } from '../../lib/time';
import Bracket from './Bracket';
import FixtureList from './FixtureList';
import ResultsStrip from './ResultsStrip';
import TeamLink from './TeamLink';
import { usePlayoffs } from './usePlayoffs';
import styles from './PlayoffsPage.module.css';

const TABS: { key: Division; label: string }[] = [
  { key: 'upper', label: 'Upper' },
  { key: 'mid', label: 'Middle' },
  { key: 'lower', label: 'Lower' },
];

const isDivision = (v: string | null): v is Division => v === 'upper' || v === 'mid' || v === 'lower';

export default function PlayoffsPage() {
  const [params, setParams] = useSearchParams();
  const { schedule, loading, stale, now } = usePlayoffs();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const raw = params.get('div');
  const division: Division = isDivision(raw) ? raw : 'upper';
  const select = (d: Division) => {
    const next = new URLSearchParams(params); // keeps ?phase= and anything else
    next.set('div', d);
    setParams(next, { replace: true });
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const t = TABS[(i + step + TABS.length) % TABS.length];
    select(t.key);
    tabRefs.current[t.key]?.focus();
  };

  const staticChamp = (d: Division) => SECRETLEAGUE_I.divisions.find((x) => x.key === d);
  const championOf = (d: Division) => schedule.champion(d) ?? staticChamp(d)?.champion.name ?? null;
  const champion = championOf(division);
  const final = schedule.finalRow(division);
  const finalRes = final ? schedule.matchResult(final) : null;
  const finalScore = finalRes?.score ? `${finalRes.score[0]}–${finalRes.score[1]}` : staticChamp(division)?.final.score;

  return (
    <Section
      id="playoffs"
      eyebrow={`${SECRETLEAGUE_I.season} · ${SECRETLEAGUE_I.year}`}
      title="Playoffs"
      lede="Double elimination, three divisions. The champion's path is lit."
      className={styles.section}
    >
      <div className={styles.status}>
        <p className={styles.clock}>
          <span className={styles.clockK}>UK time</span>
          <span className={styles.clockV}>{fmtDate(now.date)} · {now.time} {ukZone(now.date)}</span>
        </p>
        {!playoffsLive() && <p className={styles.note}>The playoffs have not started yet. This is a preview of the schedule.</p>}
      </div>

      {stale && (
        <p className={styles.banner} role="status">
          Could not reach the live schedule, so this may be out of date. Showing the last saved bracket.
        </p>
      )}

      <div className={styles.tabs} role="tablist" aria-label="Division">
        {TABS.map((t, i) => {
          const c = championOf(t.key);
          return (
            <button
              key={t.key}
              ref={(el) => { tabRefs.current[t.key] = el; }}
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={division === t.key}
              aria-controls="po-panel"
              tabIndex={division === t.key ? 0 : -1}
              className={styles.tab}
              data-div={t.key}
              onClick={() => select(t.key)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <span className={styles.tabLabel}>{t.label}</span>
              {c && <span className={styles.ribbon}><span className={styles.rk}>Champions · </span>{c}</span>}
            </button>
          );
        })}
      </div>

      <div id="po-panel" role="tabpanel" aria-labelledby={`tab-${division}`} className={styles.panel} data-div={division}>
        {loading ? (
          <div className={styles.skeleton} aria-busy="true" aria-label="Loading the bracket">
            <Skeleton height={420} />
          </div>
        ) : (
          <>
            {champion && (
              <div className={styles.champBar}>
                <span className={styles.champK}>Champions</span>
                <TeamLink name={champion} division={division} size={36} className={styles.champName} />
                {finalScore && <span className={styles.champScore}>{finalScore} in the grand final</span>}
              </div>
            )}

            <Bracket schedule={schedule} division={division} now={now} championName={champion} />

            <h3 className={styles.h}>Results</h3>
            <ResultsStrip schedule={schedule} division={division} />

            <h3 className={styles.h}>Fixtures</h3>
            <FixtureList schedule={schedule} division={division} now={now} />
          </>
        )}
      </div>
    </Section>
  );
}
