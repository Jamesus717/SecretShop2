import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { postCard } from './newsApi';
import styles from './News.module.css';

/** Admin "+ Add card": port of the legacy upload form. Posts via /api/news with the admin session. */
export default function AddCard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; bad: boolean }>({ text: '', bad: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => { if (d?.open) d.close(); };
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get('image');
    if (!(file instanceof File) || !file.size) { setStatus({ text: 'Choose an image.', bad: true }); return; }
    const s = (k: string) => String(form.get(k) ?? '');
    setBusy(true);
    try {
      await postCard(
        { file, title: s('title'), kind: s('kind'), division: s('division'), teams: s('teams'), match_ids: s('match_ids'), youtube: s('youtube') },
        (text) => setStatus({ text, bad: false }),
      );
      onDone();
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : String(err), bad: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${styles.formDialog}`}
      aria-label="Add a card"
      onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}
      onClick={(e) => { if (e.target === ref.current && !busy) onClose(); }}
    >
      <form className={styles.form} onSubmit={(e) => void submit(e)}>
        <button type="button" className={styles.dClose} onClick={onClose} aria-label="Close" disabled={busy}>✕</button>
        <h2 className={styles.dTitle}>Add a card</h2>

        <label className={styles.field}>Image (PNG, WEBP or JPEG)
          <input className={styles.input} type="file" name="image" accept="image/png,image/webp,image/jpeg" required onChange={onFile} />
        </label>
        {preview && <img className={styles.preview} src={preview} alt="Preview of the chosen card" />}

        <label className={styles.field}>Title <small>results are shown winner first</small>
          <input className={styles.input} type="text" name="title" maxLength={140} required placeholder="Hurricane 2–1 FarmVille" />
        </label>
        <div className={styles.row2}>
          <label className={styles.field}>Type
            <select className={styles.input} name="kind" defaultValue="result">
              <option value="result">Result</option>
              <option value="match">Scoreboard</option>
              <option value="elimination">Eliminations</option>
              <option value="bracket">Bracket</option>
              <option value="hero">Hero</option>
              <option value="team">Team</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className={styles.field}>Division
            <select className={styles.input} name="division" defaultValue="">
              <option value="">None</option>
              <option value="upper">Upper</option>
              <option value="mid">Mid</option>
              <option value="lower">Lower</option>
            </select>
          </label>
        </div>
        <label className={styles.field}>Teams <small>optional, comma-separated — links the card to the result on Home and Playoffs</small>
          <input className={styles.input} type="text" name="teams" placeholder="Hurricane, FarmVille" />
        </label>
        <label className={styles.field}>Match IDs <small>optional, comma-separated, for OpenDota/Dotabuff links</small>
          <input className={styles.input} type="text" name="match_ids" inputMode="numeric" placeholder="8995123456, 8995127890" />
        </label>
        <label className={styles.field}>Highlights video <small>optional YouTube link</small>
          <input className={styles.input} type="url" name="youtube" placeholder="https://youtu.be/…" />
        </label>

        <p className={`${styles.msg} ${status.bad ? styles.bad : ''}`} role="status">{status.text}</p>
        <button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Posting…' : 'Post to the site'}</button>
      </form>
    </dialog>
  );
}
