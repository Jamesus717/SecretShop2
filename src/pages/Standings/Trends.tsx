import { useMemo, useState } from 'react';
import { sortHeroes, trendingHeroes, type HeroSortKey } from '../../lib/standings/heroes';
import type { HeroRow } from '../../lib/standings/types';
import styles from './Trends.module.css';

function HeroIcon({ h }: { h: HeroRow }) {
  const [bad, setBad] = useState(false);
  if (!h.icon || bad) return <span className={styles.hicon} aria-hidden="true" />;
  return <img className={styles.hicon} src={h.icon} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />;
}

const tone = (wr: number) => (wr >= 60 ? 'good' : wr <= 40 ? 'bad' : 'mid');

function BarList({ title, rows, value, label, empty, kind }: {
  title: string; rows: HeroRow[]; value: (h: HeroRow) => number; label: (h: HeroRow) => string; empty: string; kind: 'wr' | 'neutral';
}) {
  const max = Math.max(1, ...rows.map(value));
  return (
    <div className={styles.panel}>
      <h3 className={styles.h3}>{title}</h3>
      {rows.length === 0 ? <p className={styles.empty}>{empty}</p> : (
        <ul className={styles.bars}>
          {rows.map((h) => (
            <li key={h.name} className={styles.barRow}>
              <span className={styles.bname}><HeroIcon h={h} />{h.name}</span>
              <span className={styles.track} aria-hidden="true">
                <i data-tone={kind === 'wr' ? tone(h.wr) : 'neutral'} style={{ transform: `scaleX(${Math.max(0.04, value(h) / (kind === 'wr' ? 100 : max))})` }} />
              </span>
              <span className={styles.bmeta}>{label(h)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Props { heroes: HeroRow[]; teamCount: number; totalMatches: number; syncedAt: string | null }

export default function Trends({ heroes, teamCount, totalMatches, syncedAt }: Props) {
  const [query, setQuery] = useState('');
  const [minPicks, setMinPicks] = useState(0);
  const [sortKey, setSortKey] = useState<HeroSortKey>('picks');
  const [asc, setAsc] = useState(false);

  const picked = useMemo(() => heroes.filter((h) => h.picks > 0), [heroes]);
  const totalPicks = picked.reduce((s, h) => s + h.picks, 0);
  const gamesWithHeroData = Math.round(totalPicks / 10);
  const maxPicks = Math.max(1, ...picked.map((h) => h.picks));
  const { trending, struggling } = useMemo(() => trendingHeroes(heroes), [heroes]);
  const mostPicked = useMemo(() => sortHeroes(picked, 'picks', false).slice(0, 8), [picked]);
  const mostBanned = useMemo(() => sortHeroes(heroes.filter((h) => h.bans > 0), 'bans', false).slice(0, 8), [heroes]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = picked.filter((h) => (!q || h.name.toLowerCase().includes(q)) && h.picks >= minPicks);
    return sortHeroes(filtered, sortKey, asc);
  }, [picked, query, minPicks, sortKey, asc]);

  const sortBy = (k: HeroSortKey) => {
    if (sortKey === k) setAsc((a) => !a); else { setSortKey(k); setAsc(k === 'name'); }
  };
  const th = (k: HeroSortKey, text: string, cls = styles.num) => (
    <th className={cls} aria-sort={sortKey === k ? (asc ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={styles.sortBtn} onClick={() => sortBy(k)}>
        {text}{sortKey === k && <span aria-hidden="true">{asc ? ' ▲' : ' ▼'}</span>}
      </button>
    </th>
  );

  const tiles: [number, string][] = [
    [totalMatches, 'matches played'], [teamCount, 'teams tracked'], [picked.length, 'unique heroes'], [totalPicks, 'hero picks'],
  ];

  if (!heroes.length) return <p className={styles.empty}>No hero data yet.</p>;

  return (
    <div>
      <div className={styles.tiles}>
        {tiles.map(([v, k]) => (
          <div key={k} className={styles.tile}><span className={styles.tv}>{v}</span><span className={styles.tk}>{k}</span></div>
        ))}
      </div>
      {totalMatches > 0 && gamesWithHeroData < totalMatches - 1 && (
        <p className={styles.coverage}>
          Hero stats cover the {gamesWithHeroData} of {totalMatches} games Imprint has hero data for. Picks, bans and win rates are out of those.
        </p>
      )}

      <div className={styles.grid}>
        <BarList title="Most picked" rows={mostPicked} kind="neutral" value={(h) => h.picks}
          label={(h) => `${h.picks} · ${Math.round((h.picks / Math.max(1, gamesWithHeroData)) * 100)}% of games`} empty="No picks yet." />
        <BarList title="Most banned" rows={mostBanned} kind="neutral" value={(h) => h.bans}
          label={(h) => `${h.bans} bans`} empty="No bans recorded." />
        <BarList title="Trending" rows={trending} kind="wr" value={(h) => h.wr}
          label={(h) => `${h.wr.toFixed(0)}% · ${h.wins}-${h.losses}`} empty="No hero has 2+ games at 60% or better yet." />
        <BarList title="Struggling" rows={struggling} kind="wr" value={(h) => h.wr}
          label={(h) => `${h.wr.toFixed(0)}% · ${h.wins}-${h.losses}`} empty="No hero has 2+ games at 40% or worse yet." />
      </div>

      <h3 className={styles.h3t}>Hero pick table</h3>
      <div className={styles.controls}>
        <label className={styles.field}>
          <span>Search</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hero name" />
        </label>
        <label className={styles.field}>
          <span>Min picks: {minPicks > 0 ? `${minPicks}+` : 'any'}</span>
          <input type="range" min={0} max={maxPicks} value={Math.min(minPicks, maxPicks)} onChange={(e) => setMinPicks(Number(e.target.value))} />
        </label>
        <span className={styles.count}>{rows.length} of {picked.length} heroes</span>
      </div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {th('name', 'Hero', styles.name)}{th('picks', 'Picks')}{th('bans', 'Bans')}{th('wins', 'W')}{th('losses', 'L')}
              {th('wr', 'Win %')}{th('rating', 'Rating')}{th('kda', 'K/D/A')}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className={styles.empty}>No hero matches.</td></tr>}
            {rows.map((h) => (
              <tr key={h.name}>
                <td className={styles.name}><HeroIcon h={h} />{h.name}</td>
                <td className={styles.num}>
                  {h.picks}
                  <span className={styles.mini} aria-hidden="true"><i style={{ transform: `scaleX(${h.picks / maxPicks})` }} /></span>
                </td>
                <td className={styles.num}>{h.bans}</td>
                <td className={styles.num}>{h.wins}</td>
                <td className={`${styles.num} ${styles.loss}`}>{h.losses}</td>
                <td className={styles.num}><span className={styles.pill} data-tone={tone(h.wr)}>{h.wr.toFixed(0)}%</span></td>
                <td className={styles.num}>{h.rating != null && h.rating > 0 ? h.rating.toFixed(1) : '-'}</td>
                <td className={styles.num}>{h.k.toFixed(1)}/{h.d.toFixed(1)}/{h.a.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.sync}>{syncedAt ? `Data as of ${new Date(syncedAt).toLocaleString()}` : 'Data as of this page load.'}</p>
    </div>
  );
}
