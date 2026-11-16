import { useRef, useState } from 'react';
import type { Forfeit, Team } from '../../lib/standings/types';
import styles from './AdminBar.module.css';

interface Props {
  teams: Team[];
  forfeits: Forfeit[];
  busy: boolean;
  onSync: () => void;
  onAdd: (winnerKey: string, loserKey: string, note: string) => Promise<string | null>;
  onDelete: (id: string) => void;
}

/** Only rendered for admins (the page checks useAuth().isAdmin). RLS is the real gate. */
export default function AdminBar({ teams, forfeits, busy, onSync, onAdd, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [winner, setWinner] = useState('');
  const [loser, setLoser] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  const submit = async () => {
    setErr('');
    if (!winner || !loser || winner === loser) { setErr('Pick two different teams.'); return; }
    setSaving(true);
    const msg = await onAdd(winner, loser, note);
    setSaving(false);
    if (msg) setErr(msg); else setNote('');
  };

  // Two-step delete: the first click arms it, a second within 4s removes the forfeit.
  const del = (id: string) => {
    if (armed === id) { window.clearTimeout(timer.current); setArmed(null); onDelete(id); return; }
    setArmed(id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setArmed(null), 4000);
  };

  return (
    <div className={styles.bar} role="region" aria-label="Admin controls">
      <span className={styles.tag}>Admin</span>
      <button type="button" className={styles.btn} onClick={onSync} disabled={busy}>{busy ? 'Refreshing...' : 'Sync now'}</button>
      <button type="button" className={styles.btn} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Forfeits ({forfeits.length})
      </button>
      {open && (
        <div className={styles.panel}>
          <div className={styles.form}>
            <label>Winner
              <select value={winner} onChange={(e) => setWinner(e.target.value)}>
                <option value="">Choose team</option>
                {sorted.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              </select>
            </label>
            <label>Loser
              <select value={loser} onChange={(e) => setLoser(e.target.value)}>
                <option value="">Choose team</option>
                {sorted.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              </select>
            </label>
            <label className={styles.wide}>Note (optional)
              <input type="text" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button type="button" className={styles.btn} onClick={submit} disabled={saving}>Record forfeit</button>
          </div>
          {err && <p className={styles.err} role="alert">{err}</p>}
          <ul className={styles.list}>
            {forfeits.length === 0 && <li className={styles.none}>No forfeits recorded yet.</li>}
            {forfeits.map((f) => (
              <li key={f.id}>
                <span><b>{f.winner_name}</b> beat {f.loser_name} by forfeit{f.note ? <em> ({f.note})</em> : null}</span>
                <button type="button" className={styles.btn} onClick={() => del(f.id)} aria-label={`Remove forfeit ${f.winner_name} over ${f.loser_name}`}>
                  {armed === f.id ? 'Sure?' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
