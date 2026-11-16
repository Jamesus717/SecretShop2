import { Fragment, useMemo, useState } from 'react';
import Crest from '../../components/Crest/Crest';
import { DIV_LABELS, DIV_ORDER, POSITIONS } from '../../lib/standings/aliases';
import { groupByDivision, sortedKeys, tiebreakNotes, winRate } from '../../lib/standings/records';
import type { Division, RosterPlayer, Team } from '../../lib/standings/types';
import styles from './DivisionBoard.module.css';

interface Props {
  teams: Map<string, Team>;
  playoffs: boolean;
  isAdmin: boolean;
  onMove?: (key: string, dir: 'up' | 'down') => void;
  summary: string;
}

const crestDiv = (d: Division) => (d === 'unassigned' ? undefined : d);
const shortLabel = (d: Division) => DIV_LABELS[d].replace(' Division', '');

function dotabuff(accountId: number | string): string {
  const id = String(accountId ?? '').trim();
  return /^\d+$/.test(id) ? `https://www.dotabuff.com/players/${id}` : '';
}

function ratingTone(label: string | null): 'good' | 'bad' | 'mid' {
  const l = (label || '').toLowerCase();
  if (l.includes('high')) return 'good';
  if (l.includes('low')) return 'bad';
  return 'mid';
}

function PlayerRow({ p }: { p: RosterPlayer }) {
  const url = dotabuff(p.accountId);
  return (
    <li className={styles.player}>
      <span className={styles.pos}>POS {p.position || '?'}</span>
      <span className={styles.pname}>
        {url ? <a href={url} target="_blank" rel="noopener noreferrer">{p.name}</a> : p.name}
        {!p.isCore && <span className={styles.sub}>SUB</span>}
        {p.aka.length > 0 && <span className={styles.aka} title={`Also played as: ${p.aka.join(', ')}`}>aka +{p.aka.length}</span>}
      </span>
      {p.rating != null && (
        <span className={styles.rating} data-tone={ratingTone(p.ratingLabel)} title={`${p.ratingLabel || ''} Imprint rating`.trim()}>
          {Number(p.rating).toFixed(1)}
        </span>
      )}
      <span className={styles.pwl}>{p.noGamesRecorded ? 'no games yet' : `${p.wins}-${p.losses}`}</span>
    </li>
  );
}

function Roster({ T, standins }: { T: Team; standins: boolean }) {
  const cores = POSITIONS.map((pos) => (T.roster[pos] || []).find((p) => p.isCore) || null);
  const subs = [0, ...POSITIONS].flatMap((pos) => (T.roster[pos] || []).filter((p) => !p.isCore));
  return (
    <div className={styles.rosterWrap}>
      {T.statsIncomplete && (
        <p className={styles.note}>Player stats still syncing for {T.statsGap} game(s). They fill in over the next few loads.</p>
      )}
      <ul className={styles.roster}>
        {cores.map((p, i) => (p ? <PlayerRow key={`${p.accountId}-${p.position}`} p={p} /> : (
          <li key={`empty-${i}`} className={styles.empty}>Pos {i + 1}: no player on record yet</li>
        )))}
      </ul>
      {standins && subs.length > 0 && (
        <>
          <h4 className={styles.subhead}>Stand-ins ({subs.length})</h4>
          <ul className={styles.roster}>{subs.map((p) => <PlayerRow key={`${p.accountId}-${p.position}`} p={p} />)}</ul>
        </>
      )}
    </div>
  );
}

export default function DivisionBoard({ teams, playoffs, isAdmin, onMove, summary }: Props) {
  const [active, setActive] = useState<Division>('upper');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [standins, setStandins] = useState(false);

  const { groups, notes } = useMemo(() => {
    const keys = sortedKeys(teams);
    return { groups: groupByDivision(teams, keys), notes: tiebreakNotes(teams, keys) };
  }, [teams]);

  // Unassigned only when it has teams (an admin has to place them); never an empty tab.
  const divs = DIV_ORDER.filter((d) => d !== 'unassigned' || groups[d].length > 0);
  const current: Division = divs.includes(active) ? active : divs[0];

  if (!teams.size) {
    return <p className={styles.state}>{playoffs ? 'No playoff games synced yet.' : 'Not synced yet. No standings data to show.'}</p>;
  }

  const toggle = (key: string) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  const keys = groups[current];
  const cols = playoffs ? 5 : 6;

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.divTabs} role="tablist" aria-label="Division">
          {divs.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={d === current}
              className={styles.divTab}
              data-div={crestDiv(d)}
              data-empty={groups[d].length === 0 || undefined}
              onClick={() => setActive(d)}
            >
              {shortLabel(d)}<span className={styles.count}>{groups[d].length}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={standins}
          onClick={() => setStandins((v) => !v)}
        >
          Stand-ins: {standins ? 'on' : 'off'}
        </button>
      </div>
      <p className={styles.summary}>{summary}</p>

      {keys.length === 0 ? (
        <p className={styles.state}>
          {playoffs ? 'No playoff games played in this division yet.'
            : current === 'unassigned' ? 'Every team is assigned to a division.'
              : 'No teams in this division yet.'}
        </p>
      ) : (
        <div className={styles.scroll} role="tabpanel" tabIndex={0} aria-label={`${shortLabel(current)} standings`}>
          <table className={styles.table} data-div={crestDiv(current)}>
            <thead>
              <tr>
                <th className={styles.rank}>#</th>
                <th className={styles.teamCol}>Team</th>
                <th className={styles.num}>W</th>
                {!playoffs && <th className={styles.num}>T</th>}
                <th className={styles.num}>L</th>
                <th className={styles.rate}>Win rate</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k, i) => {
                const T = teams.get(k)!;
                const isOpen = open.has(k);
                const rate = winRate(T);
                const forfeit = T.forfeitWins || T.forfeitLosses;
                return (
                  <Fragment key={k}>
                    <tr className={styles.row} data-lead={i === 0 && T.statsSynced ? '' : undefined} data-open={isOpen || undefined}>
                      <td className={styles.rank}>{i + 1}</td>
                      <td className={styles.teamCol}>
                        <button
                          type="button"
                          className={styles.teamBtn}
                          aria-expanded={isOpen}
                          aria-controls={`roster-${k}`}
                          onClick={() => toggle(k)}
                        >
                          <Crest name={T.name} size={34} division={crestDiv(T.division)} />
                          <span className={styles.teamText}>
                            <span className={styles.tname}>{T.name}</span>
                            {notes.get(k) && <span className={styles.h2h}>{notes.get(k)}</span>}
                            {!T.statsSynced && <span className={styles.pending}>not synced yet</span>}
                          </span>
                          <span className={styles.chev} aria-hidden="true" />
                        </button>
                      </td>
                      {T.statsSynced ? (
                        <>
                          <td className={styles.num}>{T.wins}</td>
                          {!playoffs && <td className={styles.num}>{T.ties}</td>}
                          <td className={`${styles.num} ${styles.loss}`}>
                            {T.losses}{forfeit > 0 && !playoffs && (
                              <span className={styles.flag} title={`Includes ${T.forfeitWins} forfeit win(s) and ${T.forfeitLosses} forfeit loss(es)`}>F</span>
                            )}
                          </td>
                          <td className={styles.rate}>
                            <span className={styles.pct}>{Math.round(rate * 100)}%</span>
                            <span className={styles.bar} aria-hidden="true"><i style={{ transform: `scaleX(${rate})` }} /></span>
                          </td>
                        </>
                      ) : (
                        <td colSpan={playoffs ? 3 : 4} className={styles.dash}>-</td>
                      )}
                    </tr>
                    {isOpen && (
                      <tr className={styles.detail} id={`roster-${k}`}>
                        <td colSpan={cols}>
                          <Roster T={T} standins={standins} />
                          {isAdmin && !playoffs && onMove && (
                            <div className={styles.admin} role="group" aria-label={`Move ${T.name} between divisions`}>
                              <span className={styles.adminLbl}>Admin: division</span>
                              <button type="button" onClick={() => onMove(k, 'up')} disabled={T.division === 'upper'} aria-label="Move up a division">Up</button>
                              <span className={styles.adminCur}>{shortLabel(T.division)}</span>
                              <button type="button" onClick={() => onMove(k, 'down')} disabled={T.division === 'unassigned'} aria-label="Move down a division">Down</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
