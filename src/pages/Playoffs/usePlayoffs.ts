import { useEffect, useMemo, useState } from 'react';
import { SECRETLEAGUE_I } from '../../data/champions';
import { createSchedule, fallbackRows, loadSchedule, type MatchRow, type Schedule } from '../../lib/playoffs';
import { ukNow, type UkClock } from '../../lib/time';

const KNOWN_NAMES = SECRETLEAGUE_I.divisions.flatMap((d) => [d.champion.name, d.runnerUp.name, d.third]);

export interface PlayoffsData {
  schedule: Schedule;
  loading: boolean;
  /** The live sheet could not be read; the seed rows are shown and may be stale. */
  stale: boolean;
  now: UkClock;
}

/** Live schedule from the Google Sheet (fallback seed on failure) plus a UK clock that ticks every 30 s. */
export function usePlayoffs(): PlayoffsData {
  const [load, setLoad] = useState<{ rows: MatchRow[]; stale: boolean; loading: boolean }>({
    rows: [], stale: false, loading: true,
  });
  const [now, setNow] = useState<UkClock>(() => ukNow());

  useEffect(() => {
    let live = true;
    loadSchedule().then((r) => { if (live) setLoad({ rows: r.rows, stale: r.stale, loading: false }); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(ukNow()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const schedule = useMemo(() => {
    const rows = load.rows.length ? load.rows : fallbackRows();
    const names = [...KNOWN_NAMES];
    return createSchedule(rows, names);
  }, [load.rows]);

  return { schedule, loading: load.loading, stale: load.stale, now };
}
