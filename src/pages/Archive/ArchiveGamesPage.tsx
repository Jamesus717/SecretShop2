import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Crest from '../../components/Crest/Crest';
import Skeleton from '../../components/Skeleton/Skeleton';
import { DIVISION_LABEL, isDivisionKey } from '../../data/divisions';
import {
  NO_FILTER, buildGames, filterGames, gameNumbers, groupByRound, teamNames, type ArchiveGame, type GameFilter, type Stage,
} from '../../lib/archive/games';
import { streamLabel, fmtDate } from '../../lib/playoffs';
import { SCHEDULE } from '../GroupStage/schedule';
import { usePlayoffs } from '../Playoffs/usePlayoffs';
import ArchiveShell from './ArchiveShell';
import styles from './Archive.module.css';

const STAGES: { key: Stage | 'all'; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'playoffs', label: 'Playoffs' }, { key: 'group', label: 'Group stage' },
];
const DIVS = [{ key: 'all', label: 'All' }, ...(['upper', 'mid', 'lower'] as const).map((k) => ({ key: k, label: DIVISION_LABEL[k] }))];

function GameCard({ g }: { g: ArchiveGame }) {
  const out = (side: 'a' | 'b') => (g.winner === 'tie' || !g.winner ? undefined : g.winner === side ? 'win' : 'loss');
  const side = (s: 'a' | 'b') => {
    const name = g[s];
    const real = !/^(Winner|Loser) of #|^TBD$/.test(name);
    return (
      <div className={styles.side} data-out={out(s)}>
        {real ? <Crest name={name} size={26} division={g.div} /> : <span style={{ width: 22, height: 26 }} aria-hidden="true" />}
        <span className={styles.sideName}>{name}</span>
        {g.score && <span className={styles.pts}>{g.score[s === 'a' ? 0 : 1]}</span>}
      </div>
    );
  };
  return (
    <li className={styles.game} data-div={g.div} data-final={g.grandFinal || undefined}>
      <div className={styles.meta}>
        <span className={styles.divName}>{DIVISION_LABEL[g.div]}</span>
        {g.n != null && <span>#{g.n}</span>}
        <span>{fmtDate(g.date)}{g.time ? ` · ${g.time}` : ''}</span>
      </div>
      {side('a')}
      {side('b')}
      <div className={styles.tags}>
        {g.grandFinal && <span className={`${styles.tag} ${styles.tagGold}`}>Grand final</span>}
        {g.winner === 'tie' && <span className={styles.tag}>Tie</span>}
        {g.forfeit && <span className={styles.tag}>Forfeit</span>}
        {g.cast && g.stage === 'group' && <span className={styles.tag}>Cast · SL</span>}
        {!g.score && <span className={styles.noResult}>No result recorded</span>}
        {g.streams.slice(0, 2).map((u) => (
          <a key={u} href={u} target="_blank" rel="noopener noreferrer" className={styles.vod}>Watch on {streamLabel(u)} ↗</a>
        ))}
      </div>
    </li>
  );
}

export default function ArchiveGamesPage() {
  const [params, setParams] = useSearchParams();
  const { schedule, loading, stale } = usePlayoffs();
  const all = useMemo(() => buildGames(SCHEDULE, schedule), [schedule]);
  const teams = useMemo(() => teamNames(all), [all]);

  const rawDiv = params.get('div');
  const rawStage = params.get('stage');
  const rawTeam = params.get('team') ?? '';
  const filter: GameFilter = {
    div: isDivisionKey(rawDiv) ? rawDiv : 'all',
    stage: rawStage === 'group' || rawStage === 'playoffs' ? rawStage : 'all',
    team: teams.includes(rawTeam) ? rawTeam : NO_FILTER.team,
  };
  const set = (patch: Partial<Record<'div' | 'stage' | 'team', string>>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (!v || v === 'all') next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };

  const shown = useMemo(() => filterGames(all, filter), [all, filter.div, filter.stage, filter.team]); // eslint-disable-line react-hooks/exhaustive-deps
  const rounds = useMemo(() => groupByRound(shown), [shown]);
  const n = useMemo(() => gameNumbers(all), [all]);

  return (
    <ArchiveShell
      tab="games"
      heading="Games"
      lede="Every series from SecretLeague I: the group stage and the double-elimination playoffs. Filter by division, stage or team."
    >
      {stale && (
        <p className={styles.banner} role="status">
          Could not reach the live playoff schedule, so playoff scores are missing. Group stage results are complete.
        </p>
      )}

      <div className={styles.filters}>
        <div className={styles.filterRow} role="group" aria-label="Division">
          <span className={styles.filterLabel}>Division</span>
          {DIVS.map((d) => (
            <button key={d.key} type="button" className={styles.chip} aria-pressed={filter.div === d.key} onClick={() => set({ div: d.key })}>{d.label}</button>
          ))}
        </div>
        <div className={styles.filterRow} role="group" aria-label="Stage">
          <span className={styles.filterLabel}>Stage</span>
          {STAGES.map((s) => (
            <button key={s.key} type="button" className={styles.chip} aria-pressed={filter.stage === s.key} onClick={() => set({ stage: s.key })}>{s.label}</button>
          ))}
        </div>
        <div className={styles.filterRow}>
          <label className={styles.filterLabel} htmlFor="arch-team">Team</label>
          <select id="arch-team" className={styles.select} value={filter.team} onChange={(e) => set({ team: e.target.value })}>
            <option value="">All teams</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <p className={styles.count} aria-live="polite">
          {loading ? 'Loading games…' : `${shown.length} of ${all.length} games · ${n.played} with a result`}
        </p>
      </div>

      {loading ? (
        <div className={styles.skCards} aria-busy="true" aria-label="Loading games">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={120} />)}
        </div>
      ) : rounds.length === 0 ? (
        <div className={styles.state}>
          <p>No games match those filters.</p>
          <button type="button" onClick={() => setParams({}, { replace: true })}>Clear filters</button>
        </div>
      ) : (
        rounds.map((r) => (
          <section key={r.key} className={styles.round} aria-label={`${r.stage === 'playoffs' ? 'Playoffs' : 'Group stage'} ${r.round}`}>
            <h2 className={styles.roundHead}>
              <span className={styles.roundStage}>{r.stage === 'playoffs' ? 'Playoffs' : 'Group stage'}</span>
              {r.round}
            </h2>
            <ul className={styles.games}>{r.games.map((g) => <GameCard key={g.id} g={g} />)}</ul>
          </section>
        ))
      )}
    </ArchiveShell>
  );
}
