import { useEffect, useMemo, useRef, useState } from 'react';
import type { Attribute, Patch, Verdict } from '../../data/patches';
import { Hl, Icon, LineList, VerdictBadge } from './Lines';
import { viewHero, type HeroView } from './patchSearch';
import styles from './Patch.module.css';

const ATTRS: { id: Attribute | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'strength', label: 'Strength' },
  { id: 'agility', label: 'Agility' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'universal', label: 'Universal' },
];
const KINDS: { id: Verdict | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'buffed', label: 'Buffed' },
  { id: 'nerfed', label: 'Nerfed' },
  { id: 'reworked', label: 'Reworked' },
  { id: 'mixed', label: 'Mixed' },
];
const LIST_CAP = 30;

function HeroDiff({ v, q }: { v: HeroView; q: string }) {
  const { hero } = v;
  return (
    <div className={styles.diff}>
      {v.notes.length > 0 && (
        <div className={styles.diffBlock}>
          <h4 className={styles.h4}>Hero changes</h4>
          <LineList lines={v.notes} q={q} />
        </div>
      )}
      {v.abilities.map(({ ability, lines }) => (
        <div key={ability.id} className={styles.diffBlock}>
          <h4 className={styles.h4}><Icon src={ability.icon} name={ability.name} className={styles.abIcon} /><span><Hl text={ability.name} q={q} /></span></h4>
          <LineList lines={lines} q={q} />
        </div>
      ))}
      {v.talents.length > 0 && (
        <div className={styles.diffBlock}>
          <h4 className={styles.h4}>Talents</h4>
          <LineList lines={v.talents} q={q} />
        </div>
      )}
      {!v.notes.length && !v.abilities.length && !v.talents.length && <p className={styles.empty}>No listed changes for {hero.name}.</p>}
    </div>
  );
}

function HeroHead({ v, verdict, q }: { v: HeroView; verdict: Verdict | undefined; q: string }) {
  return (
    <div className={styles.heroHead}>
      <Icon src={v.hero.icon} name={v.hero.name} className={styles.heroIcon} />
      <h3 className={styles.heroName}><Hl text={v.hero.name} q={q} /></h3>
      <VerdictBadge verdict={verdict} />
    </div>
  );
}

export default function Heroes({ patch, q }: { patch: Patch; q: string }) {
  const [attr, setAttr] = useState<Attribute | 'all'>('all');
  const [kind, setKind] = useState<Verdict | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const verdicts = patch.highlights.heroVerdicts;

  const rows = useMemo(
    () =>
      patch.heroes
        .filter((h) => (attr === 'all' || h.attribute === attr) && (kind === 'all' || verdicts[h.shortName]?.verdict === kind))
        .map((h) => viewHero(h, q))
        .filter((v): v is HeroView => !!v),
    [patch, attr, kind, q, verdicts],
  );

  const openView = open ? rows.find((r) => r.hero.shortName === open) ?? null : null;
  // Bring the filter row and the panel under the sticky bar together (scroll-margin on .filters keeps the gap).
  useEffect(() => { if (open) filtersRef.current?.scrollIntoView({ block: 'start' }); }, [open]);

  const searching = !!q;
  const shown = searching && !showAll ? rows.slice(0, LIST_CAP) : rows;

  return (
    <div>
      <div ref={filtersRef} className={styles.filters}>
        <div role="group" aria-label="Filter by attribute" className={styles.chips}>
          {ATTRS.map((a) => (
            <button key={a.id} type="button" className={styles.chip} aria-pressed={attr === a.id} onClick={() => setAttr(a.id)}>{a.label}</button>
          ))}
        </div>
        <div role="group" aria-label="Filter by change type" className={styles.chips}>
          {KINDS.map((k) => (
            <button key={k.id} type="button" className={styles.chip} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>
          ))}
        </div>
        <p className={styles.count} role="status">
          {attr === 'all' && kind === 'all' && !q
            ? `All ${rows.length} heroes changed in ${patch.version}. Nobody is missing.`
            : `Showing ${rows.length} of ${patch.heroes.length} heroes`}
        </p>
      </div>

      {rows.length === 0 && <p className={styles.empty}>No heroes match these filters.</p>}

      {searching ? (
        <div className={styles.cards}>
          {shown.map((v) => (
            <article key={v.hero.shortName} className={styles.card}>
              <HeroHead v={v} verdict={verdicts[v.hero.shortName]?.verdict} q={q} />
              <HeroDiff v={v} q={q} />
            </article>
          ))}
          {rows.length > shown.length && (
            <button type="button" className={styles.more} onClick={() => setShowAll(true)}>Show all {rows.length} heroes</button>
          )}
        </div>
      ) : (
        <>
          {openView && (
            <div id="hero-panel" className={styles.panel} role="region" aria-label={`${openView.hero.name} changes`}>
              <div className={styles.panelTop}>
                <HeroHead v={openView} verdict={verdicts[openView.hero.shortName]?.verdict} q="" />
                <button type="button" className={styles.close} onClick={() => setOpen(null)}>Close</button>
              </div>
              <HeroDiff v={openView} q="" />
            </div>
          )}
          <ul className={styles.grid}>
            {rows.map((v, idx) => {
              const on = open === v.hero.shortName;
              return (
                <li key={v.hero.shortName}>
                  <button
                    type="button"
                    className={styles.tile}
                    aria-expanded={on}
                    aria-controls={on ? 'hero-panel' : undefined}
                    onClick={() => setOpen(on ? null : v.hero.shortName)}
                  >
                    <Icon src={v.hero.icon} name={v.hero.name} className={styles.tileIcon} eager={idx < 24} />
                    <span className={styles.tileName}>{v.hero.name}</span>
                    <VerdictBadge verdict={verdicts[v.hero.shortName]?.verdict} />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
