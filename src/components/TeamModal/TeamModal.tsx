import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { SEASON_PAGES_VISIBLE } from '../../config';
import { SEASON_TARGETS } from '../../lib/archive/paths';
import Crest from '../Crest/Crest';
import DivisionTag from '../DivisionTag/DivisionTag';
import Laurel from './Laurel';
import { honourFor, type DivisionKey } from '../../data/divisions';
import { altAccountsFor, rankIconFor, teamStrength, type Team } from '../../lib/rosters';
import styles from './TeamModal.module.css';

interface Props {
  team: Team;
  division: DivisionKey | null;
  onClose: () => void;
}

/** Roster detail dialog (port of legacy teammodal.js). Escape, backdrop click and the close button dismiss it. */
export default function TeamModal({ team, division, onClose }: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const honour = honourFor(team.teamName);
  const strength = teamStrength(team.players);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const f = dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} data-div={division ?? undefined}>
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Close team details">×</button>
        <header className={styles.head}>
          <Crest name={team.teamName} size={96} division={division ?? undefined} />
          <div className={styles.headText}>
            <div className={styles.tags}>
              {division && <DivisionTag division={division} />}
              {honour && <Laurel honour={honour} withLabel />}
            </div>
            <h2 id={titleId} className={styles.name}>{team.teamName}</h2>
            <p className={styles.meta}>
              {team.players.length} player{team.players.length === 1 ? '' : 's'}
              {strength && <> · <span className="num">{strength.label}</span></>}
            </p>
          </div>
        </header>

        <ul className={styles.roster}>
          {team.players.map((p, i) => {
            const icon = rankIconFor(p.rank);
            const alts = altAccountsFor(p.steam);
            return (
              <li key={`${p.ign}-${i}`} className={`${styles.row} ${p.isCaptain ? styles.captain : ''}`}>
                {icon ? <img className={styles.rank} src={icon} alt={p.rank} width={40} height={40} /> : <span className={styles.rank} aria-hidden="true" />}
                <div className={styles.info}>
                  <span className={styles.ign}>
                    {p.ign || 'Unknown'}
                    {p.isCaptain && <span className={styles.crown} title="Team captain" aria-label="Team captain">C</span>}
                  </span>
                  <span className={styles.sub}>
                    {p.isCaptain ? 'Captain · ' : ''}{p.rank || 'Unranked'}{p.mmr ? <> · <span className="num">{p.mmr.toLocaleString('en-GB')} MMR</span></> : null} · Pos {p.position || '?'}
                  </span>
                </div>
                <div className={styles.links}>
                  {p.dotabuff
                    ? <a href={p.dotabuff} target="_blank" rel="noopener noreferrer">Dotabuff ↗</a>
                    : <span className={styles.missing}>No Dotabuff</span>}
                  {alts.map((a) => (
                    <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" title="Second account">{a.label} ↗</a>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>

        <footer className={styles.foot}>
          <Link to={SEASON_TARGETS.standings} className={styles.standings}>{SEASON_PAGES_VISIBLE ? 'View standings →' : 'Season 1 stats →'}</Link>
        </footer>
      </div>
    </div>
  );
}
