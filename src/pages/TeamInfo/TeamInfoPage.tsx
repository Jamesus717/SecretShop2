import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Crest from '../../components/Crest/Crest';
import DivisionTag from '../../components/DivisionTag/DivisionTag';
import Skeleton from '../../components/Skeleton/Skeleton';
import TeamModal from '../../components/TeamModal/TeamModal';
import Laurel from '../../components/TeamModal/Laurel';
import { DIVISION_ORDER, DIVISION_SEED_NAMES, divisionFor, honourFor, type DivisionKey } from '../../data/divisions';
import { cachedRosters, fetchDivisionOverrides, fetchRosters, findTeam, rankIconFor, teamStrength, type Team } from '../../lib/rosters';
import { logoKey } from '../../lib/teamlogo';
import styles from './TeamInfoPage.module.css';

type Slot = { name: string; team: Team | null };
type Group = { key: DivisionKey | 'other'; slots: Slot[] };

const DIV_NAME: Record<DivisionKey | 'other', string> = { upper: 'Upper Division', mid: 'Middle Division', lower: 'Lower Division', other: 'Other teams' };

function buildGroups(teams: Team[], overrides: Record<string, string>): Group[] {
  const groups = new Map<DivisionKey | 'other', Slot[]>();
  const push = (k: DivisionKey | 'other', s: Slot) => groups.set(k, [...(groups.get(k) ?? []), s]);
  const seen = new Set<string>();
  // Seeded teams drive the layout, so a team with no published roster still shows (dimmed).
  for (const d of DIVISION_ORDER) {
    for (const name of DIVISION_SEED_NAMES[d]) {
      const k = logoKey(name);
      if (seen.has(k)) continue;
      seen.add(k);
      const team = findTeam(teams, name) ?? null;
      push(divisionFor(name, overrides) ?? d, { name: team?.teamName ?? name, team });
    }
  }
  for (const t of teams) {
    const k = logoKey(t.teamName);
    if (seen.has(k)) continue;
    seen.add(k);
    push(divisionFor(t.teamName, overrides) ?? 'other', { name: t.teamName, team: t });
  }
  return [...DIVISION_ORDER, 'other' as const].map((key) => ({ key, slots: groups.get(key) ?? [] })).filter((g) => g.slots.length);
}

function matches(s: Slot, q: string): boolean {
  if (!q) return true;
  if (s.name.toLowerCase().includes(q)) return true;
  return !!s.team?.players.some((p) => p.ign.toLowerCase().includes(q));
}

function TeamCard({ slot, division, onOpen }: { slot: Slot; division: DivisionKey | null; onOpen: (t: Team) => void }) {
  const { team, name } = slot;
  const honour = honourFor(name);
  const strength = team ? teamStrength(team.players) : null;
  const captain = team?.players.find((p) => p.isCaptain)?.ign || team?.captain;

  const body = (
    <>
      <span className={styles.top}>
        <Crest name={name} size={60} division={division ?? undefined} />
        <span className={styles.topText}>
          <span className={styles.name}>{name}{honour && <Laurel honour={honour} />}</span>
          {team
            ? <span className={`${styles.strength} num`}>{strength ? strength.label : 'No MMR yet'}</span>
            : <span className={styles.strength}>Roster not published yet</span>}
        </span>
      </span>
      {team && (
        <>
          {captain && <span className={styles.captain}><span className={styles.cTag}>C</span>{captain}</span>}
          <span className={styles.players}>
            {team.players.slice(0, 5).map((p, i) => {
              const icon = rankIconFor(p.rank);
              return (
                <span key={`${p.ign}-${i}`} className={styles.player}>
                  {icon ? <img src={icon} alt={p.rank} width={22} height={22} loading="lazy" /> : <span className={styles.noRank} aria-hidden="true" />}
                  <span className={styles.ign}>{p.ign || 'Unknown'}</span>
                  <span className={styles.pos}>P{p.position || '?'}</span>
                </span>
              );
            })}
          </span>
        </>
      )}
    </>
  );

  if (!team) return <li className={styles.empty}>{body}</li>;
  return (
    <li className={styles.cardWrap}>
      <button type="button" className={styles.card} data-div={division ?? undefined} onClick={() => onOpen(team)} aria-label={`View roster for ${name}`}>
        {body}
      </button>
    </li>
  );
}

export default function TeamInfoPage() {
  const [params, setParams] = useSearchParams();
  const [teams, setTeams] = useState<Team[] | null>(() => cachedRosters());
  const [failed, setFailed] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');

  const load = useCallback((force = false) => {
    setFailed(false);
    if (force) setTeams(null);
    fetchRosters(force).then(setTeams).catch((e) => { console.error('Failed to load team data:', e); setFailed(true); });
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchDivisionOverrides().then(setOverrides); }, []);

  const groups = useMemo(() => (teams ? buildGroups(teams, overrides) : []), [teams, overrides]);
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => groups.map((g) => ({ ...g, slots: g.slots.filter((s) => matches(s, q)) })).filter((g) => g.slots.length),
    [groups, q],
  );

  const teamParam = params.get('team');
  const selected = useMemo(() => (teams && teamParam ? findTeam(teams, teamParam) ?? null : null), [teams, teamParam]);
  const open = useCallback((t: Team) => setParams({ team: t.teamName }), [setParams]);
  const close = useCallback(() => setParams({}, { replace: true }), [setParams]);

  const published = teams?.length ?? 0;

  return (
    <div className="container">
      <header className={styles.head}>
        <p className={styles.eyebrow}>SecretLeague</p>
        <h1 className={styles.title}>Team Info</h1>
        <p className={styles.lede}>Every registered squad, grouped by division. Click a team for the full roster.</p>
        <div className={styles.tools}>
          <label className={styles.search}>
            <span className="visually-hidden">Search teams or players</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teams or players"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          {teams && <span className={`${styles.count} num`} aria-live="polite">{published} team{published === 1 ? '' : 's'} published</span>}
        </div>
        <p className={styles.note}>Divisions are group-stage seedings and may change after the group stage.</p>
      </header>

      {failed && (
        <div className={styles.state} role="alert">
          <p>Could not load team data. The roster sheet can be slow to wake up.</p>
          <button type="button" className={styles.retry} onClick={() => load(true)}>Try again</button>
        </div>
      )}

      {!teams && !failed && (
        <div className={styles.skeletons} aria-busy="true" aria-label="Loading teams">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={styles.skCard}>
              <Skeleton width={52} height={60} />
              <div className={styles.skLines}><Skeleton width="70%" height={20} /><Skeleton width="45%" height={14} /></div>
              <Skeleton height={14} /><Skeleton height={14} /><Skeleton height={14} />
            </div>
          ))}
        </div>
      )}

      {teams && !shown.length && !failed && (
        <div className={styles.state}><p>{q ? `No teams or players match "${query.trim()}".` : 'No teams have been published yet.'}</p></div>
      )}

      {shown.map((g) => (
        <section key={g.key} className={styles.group} aria-labelledby={`div-${g.key}`}>
          <h2 id={`div-${g.key}`} className={styles.groupHead}>
            {g.key !== 'other' && <DivisionTag division={g.key} />}
            <span>{DIV_NAME[g.key]}</span>
            <span className={`${styles.groupCount} num`}>{g.slots.length}</span>
          </h2>
          <ul className={styles.grid}>
            {g.slots.map((s) => (
              <TeamCard key={logoKey(s.name)} slot={s} division={g.key === 'other' ? null : g.key} onOpen={open} />
            ))}
          </ul>
        </section>
      ))}

      {selected && <TeamModal team={selected} division={divisionFor(selected.teamName, overrides)} onClose={close} />}
    </div>
  );
}
