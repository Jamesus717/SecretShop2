import { useCallback, useEffect, useMemo, useState } from 'react';
import { deriveStandings, type RawStandings, type Standings } from '../../lib/standings/derive';
import {
  insertForfeit, isMockMode, loadRawStandings, removeForfeit, saveDivision, triggerSync,
} from '../../lib/standings/data';
import { DIV_ORDER } from '../../lib/standings/aliases';
import type { Division } from '../../lib/standings/types';

export type LoadState = 'loading' | 'ready' | 'error';

/** `sync: false` skips the background refresh (the Season 1 archive is read-only). */
export function useStandings({ sync = true }: { sync?: boolean } = {}) {
  const mock = useMemo(() => isMockMode(), []);
  const [raw, setRaw] = useState<RawStandings | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const data = await loadRawStandings(mock);
      setRaw(data);
      setState('ready');
      return data;
    } catch (e) {
      console.error('Could not load standings:', e);
      setError(e instanceof Error ? e.message : 'unknown error');
      setState('error');
      return null;
    }
  }, [mock]);

  useEffect(() => {
    let live = true;
    (async () => {
      await load();
      // A plain sync is cheap and needs no auth; refresh only when new matches landed.
      if (live && !mock && sync) {
        const res = await triggerSync(false);
        if (live && res?.updated) {
          await load();
          setNotice('Standings updated with the latest match data.');
        }
      }
    })();
    return () => { live = false; };
  }, [load, mock, sync]);

  const standings: Standings | null = useMemo(() => (raw ? deriveStandings(raw) : null), [raw]);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((n) => (n === msg ? '' : n)), 3200);
  }, []);

  /** Admin: move a team one division up or down (optimistic; reverts when the write fails). */
  const moveTeam = useCallback(async (key: string, dir: 'up' | 'down') => {
    if (!raw || !standings) return;
    const T = standings.teams.get(key);
    if (!T) return;
    const idx = DIV_ORDER.indexOf(T.division);
    const next: Division = DIV_ORDER[dir === 'up' ? Math.max(0, idx - 1) : Math.min(DIV_ORDER.length - 1, idx + 1)];
    if (next === T.division) return;
    const prev = raw.divisionOverrides;
    setRaw({ ...raw, divisionOverrides: { ...prev, [key]: next } });
    try {
      await saveDivision(key, T.name, next);
    } catch (e) {
      console.error('Could not save division change:', e);
      setRaw((r) => (r ? { ...r, divisionOverrides: prev } : r));
      flash('Could not save. Try again.');
    }
  }, [raw, standings, flash]);

  const addForfeit = useCallback(async (winnerKey: string, loserKey: string, note: string): Promise<string | null> => {
    if (!raw || !standings) return 'Not loaded yet.';
    const w = standings.teams.get(winnerKey), l = standings.teams.get(loserKey);
    if (!w || !l || w.key === l.key) return 'Pick two different teams.';
    try {
      const row = await insertForfeit(w, l, note.trim());
      setRaw((r) => (r ? { ...r, forfeits: [row, ...r.forfeits] } : r));
      flash('Forfeit recorded.');
      return null;
    } catch (e) {
      console.error('Could not record forfeit:', e);
      return 'Could not save. Try again.';
    }
  }, [raw, standings, flash]);

  const deleteForfeit = useCallback(async (id: string) => {
    try {
      await removeForfeit(id);
      setRaw((r) => (r ? { ...r, forfeits: r.forfeits.filter((f) => f.id !== id) } : r));
      flash('Forfeit removed.');
    } catch (e) {
      console.error('Could not remove forfeit:', e);
      flash('Could not remove. Try again.');
    }
  }, [flash]);

  const syncNow = useCallback(async () => {
    setBusy(true);
    const res = await triggerSync(true);
    if (!res) { setBusy(false); flash('Refresh failed. Try again.'); return; }
    await load();
    setBusy(false);
    flash(res.updated ? `Refreshed: ${res.newMatches || 0} new match(es).` : 'Already up to date.');
  }, [load, flash]);

  return { mock, raw, standings, state, error, notice, busy, reload: load, moveTeam, addForfeit, deleteForfeit, syncNow };
}
