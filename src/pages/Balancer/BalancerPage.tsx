import { useEffect, useRef, useState } from 'react';
import Section from '../../components/Section/Section';
import Skeleton from '../../components/Skeleton/Skeleton';
import { useAuth } from '../../lib/authContext';
import {
  MAX_PLAYERS, POSITION_OPTIONS, RANKS, RANK_MMR, balanceSummary, buildTeams, copyText, coverageText, positionBadgeLabel,
  positionLabel, rankKey, seedStarterPlayers, validatePlayers, type BuildResult, type Options, type Player, type PlayerInput,
} from '../../lib/balancer';
import styles from './Balancer.module.css';

const OPTION_LABELS: { key: keyof Options; label: string }[] = [
  { key: 'mmr', label: '⚖ Spread MMR evenly' },
  { key: 'pos', label: '🎯 Distribute positions' },
  { key: 'variance', label: '🎲 Add slight variance' },
];

export default function BalancerPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  if (!isAdmin) {
    return (
      <Section id="balancer" eyebrow="Admin" title="Team Balancer">
        {authLoading ? <Skeleton height={96} /> : (
          <div className={styles.gate} role="status">
            <h3>Admins only</h3>
            <p>Sign in with an admin Discord account to use the team balancer.</p>
          </div>
        )}
      </Section>
    );
  }
  return <Balancer />;
}

function Balancer() {
  const [players, setPlayers] = useState<PlayerInput[]>(() => seedStarterPlayers());
  const nextId = useRef(players.length + 1);
  const [options, setOptions] = useState<Options>({ mmr: true, pos: true, variance: false });
  const [banner, setBanner] = useState('');
  const [balancing, setBalancing] = useState(false);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [copied, setCopied] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const update = (id: number, patch: Partial<PlayerInput>) =>
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  function addPlayer() {
    if (players.length >= MAX_PLAYERS) { setBanner('Maximum of 10 players allowed.'); return; }
    setPlayers((ps) => [...ps, { id: nextId.current++, name: '', rank: '', pos1: '', pos2: '' }]);
    setBanner('');
  }

  async function run(opts: Options = options) {
    const problem = validatePlayers(players);
    if (problem) { setBanner(problem); return; }
    setBanner('');
    setBalancing(true);
    await new Promise<void>((r) => { timers.current.push(window.setTimeout(r, 450)); });
    setResult(buildTeams(players, opts));
    setBalancing(false);
  }

  function reroll() {
    const next = { ...options, variance: true };
    setOptions(next);
    void run(next);
  }

  function reset() {
    setPlayers([]);
    nextId.current = 1;
    setResult(null);
    setBanner('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function copy() {
    if (!result) return;
    const { parsed } = result;
    try {
      await navigator.clipboard.writeText(copyText(parsed.teamA, parsed.teamB, parsed.reasoning));
      setCopied(true);
      timers.current.push(window.setTimeout(() => setCopied(false), 2000));
    } catch {
      setBanner("Couldn't copy to the clipboard.");
    }
  }

  /** Move a player to the other side (result view only; recomputes both averages). */
  function move(p: Player, from: 'A' | 'B') {
    setResult((r) => {
      if (!r) return r;
      const src = from === 'A' ? r.teamA : r.teamB;
      const dst = from === 'A' ? r.teamB : r.teamA;
      const nextSrc = src.filter((x) => x.id !== p.id);
      const nextDst = [...dst, p];
      const teamA = from === 'A' ? nextSrc : nextDst;
      const teamB = from === 'A' ? nextDst : nextSrc;
      return { ...r, teamA, teamB, parsed: { ...r.parsed, teamA: teamA.map((x) => x.name), teamB: teamB.map((x) => x.name) } };
    });
  }

  const summary = result ? balanceSummary(result.teamA, result.teamB, result.parsed.reasoning) : null;

  return (
    <Section
      id="balancer"
      eyebrow="Admin · BortyGPT"
      title="Balance a custom 5v5 draft"
      lede="Add players, tune the balance rules, and generate a cleaner split for your next in-house."
    >
      <div className={styles.workspace}>
        <div className={styles.inputCard}>
          <div className={styles.cols}>
            <section aria-labelledby="bal-players">
              <h3 id="bal-players" className={styles.h3}>Registered Players <span className={styles.chip}>Balanced</span></h3>
              <ul className={styles.rows}>
                {players.map((p, i) => (
                  <li key={p.id} className={styles.row}>
                    <span className={styles.num} aria-hidden="true">{i + 1}</span>
                    <input
                      className={styles.input}
                      type="text"
                      placeholder="Player name…"
                      aria-label={`Player ${i + 1} name`}
                      value={p.name}
                      onChange={(e) => update(p.id, { name: e.target.value })}
                    />
                    <select className={styles.select} aria-label={`Player ${i + 1} rank`} value={p.rank} onChange={(e) => update(p.id, { rank: e.target.value })}>
                      <option value="">— Rank —</option>
                      {RANKS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <select className={styles.select} aria-label={`Player ${i + 1} primary position`} value={p.pos1} onChange={(e) => update(p.id, { pos1: e.target.value })}>
                      <option value="">— Primary —</option>
                      {POSITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select className={styles.select} aria-label={`Player ${i + 1} secondary position`} value={p.pos2} onChange={(e) => update(p.id, { pos2: e.target.value })}>
                      <option value="">— Secondary —</option>
                      {POSITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`Remove player ${i + 1}`}
                      onClick={() => setPlayers((ps) => ps.filter((x) => x.id !== p.id))}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              {players.length < MAX_PLAYERS && (
                <button type="button" className={styles.add} onClick={addPlayer}><span aria-hidden="true">＋</span> Add Player</button>
              )}
              {banner && <p className={styles.banner} role="alert">⚠ {banner}</p>}
            </section>

            <aside aria-labelledby="bal-opts" className={styles.controls}>
              <h3 id="bal-opts" className={styles.h3}>Balancing Options</h3>
              <div className={styles.pills}>
                {OPTION_LABELS.map(({ key, label }) => (
                  <label key={key} className={`${styles.pill} ${options[key] ? styles.pillOn : ''}`}>
                    <input
                      type="checkbox"
                      className="visually-hidden"
                      checked={options[key]}
                      onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className={styles.helper}>
                Use ranks and preferred roles to generate two cleaner 5-player teams for custom drafts and in-house games.
              </p>
              <button type="button" className={styles.balance} onClick={() => void run()} disabled={balancing}>
                {balancing ? <><span className={styles.spinner} aria-hidden="true" /> Balancing…</> : '⚔ Balance Teams ⚔'}
              </button>
            </aside>
          </div>
        </div>

        <div className={styles.resultCard} aria-live="polite">
          <h3 className={styles.h3}>Draft Result</h3>
          {!result || !summary ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon} aria-hidden="true">⚔</div>
              <p className={styles.emptyTitle}>Awaiting Balance</p>
              <p className={styles.emptyCopy}>
                Build a pool of 2 to 10 players on the left, then run the balancer to preview Radiant and Dire side by side here.
              </p>
            </div>
          ) : (
            <>
              <div className={styles.teams}>
                <TeamBlock name="🌿 Radiant" side="radiant" avg={summary.avgA} team={result.teamA} onMove={(p) => move(p, 'A')} />
                <TeamBlock name="🔥 Dire" side="dire" avg={summary.avgB} team={result.teamB} onMove={(p) => move(p, 'B')} />
              </div>

              <div className={styles.meter}>
                <div className={styles.meterLabel}>
                  <span>Balance Score</span>
                  <span className={styles.mono}>{summary.diff} MMR diff</span>
                </div>
                <div className={styles.track}>
                  <div className={styles.needle} style={{ left: `${summary.needlePct}%` }} />
                </div>
                <div className={styles.score}>{summary.score} / 100</div>
                <div className={styles.desc}>{summary.desc}</div>
              </div>

              <div className={styles.actions}>
                <button type="button" className={styles.action} onClick={reroll} disabled={balancing}>🎲 Re-Roll Draft</button>
                <button type="button" className={styles.action} onClick={() => void copy()}>{copied ? '✅ Copied!' : '📋 Copy to Discord'}</button>
                <button type="button" className={styles.action} onClick={reset}>↺ New Session</button>
              </div>
            </>
          )}
        </div>
      </div>
    </Section>
  );
}

function TeamBlock({ name, side, avg, team, onMove }: { name: string; side: 'radiant' | 'dire'; avg: number; team: Player[]; onMove: (p: Player) => void }) {
  return (
    <div className={`${styles.team} ${styles[side]}`}>
      <div className={styles.teamTitle}>
        <span>{name}</span>
        <span className={styles.avg}>{avg} avg MMR</span>
      </div>
      <ul className={styles.teamList}>
        {team.map((p) => {
          const key = rankKey(p.rank || 'Herald');
          const mmr = p.mmr || RANK_MMR.Herald;
          const pct = Math.min(100, Math.round((mmr / 10000) * 100));
          const fill = p.pos1 === 'fill' || p.pos2 === 'fill';
          return (
            <li key={p.id} className={styles.player}>
              <span className={`${styles.badge} ${fill ? styles.badgeFill : ''}`}>{positionBadgeLabel(p.pos1, p.pos2)}</span>
              <span className={styles.info}>
                <span className={styles.pname}>{p.name} <span className={styles.ppos}>· {positionLabel(p.pos1, p.pos2)}</span></span>
                <span className={`${styles.prank}`}>{p.rank || 'Herald'}</span>
              </span>
              <span className={styles.bar}>
                <span className={styles.barBg}><span className={`${styles.barFill} ${styles[`b_${key}`]}`} style={{ width: `${pct}%` }} /></span>
                <span className={styles.mmr}>~{mmr}</span>
              </span>
              <button type="button" className={styles.move} onClick={() => onMove(p)} aria-label={`Move ${p.name} to the other team`} title="Move to the other team">⇄</button>
            </li>
          );
        })}
      </ul>
      <p className={styles.coverage}>{coverageText(team)}</p>
    </div>
  );
}
