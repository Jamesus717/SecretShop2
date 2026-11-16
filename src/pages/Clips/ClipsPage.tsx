import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import Section from '../../components/Section/Section';
import Skeleton from '../../components/Skeleton/Skeleton';
import { useAuth } from '../../lib/authContext';
import {
  CLIP_EMPTY, CLIP_STATUSES, ClipApiError, actOnClip, hostOf, isMatchId, loadClips, safeFileUrl, safeLink, when,
  type Clip, type ClipAction, type ClipStatus,
} from '../../lib/clips';
import styles from './Clips.module.css';

export default function ClipsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const mock = useSearchParams()[0].has('mock');
  const allowed = isAdmin; // ?mock=1 only swaps the data source; the admin gate still applies

  const [status, setStatus] = useState<ClipStatus>('pending');
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const seq = useRef(0);

  const load = useCallback(async (s: ClipStatus) => {
    const mine = ++seq.current;
    setLoading(true);
    setMessage('');
    setRejecting(null);
    try {
      const rows = await loadClips(s, mock);
      if (mine === seq.current) setClips(rows);
    } catch (e) {
      if (mine !== seq.current) return;
      console.error('Could not load clips:', e);
      const err = e as ClipApiError;
      setClips([]);
      setMessage(err.status === 401 ? 'Admins only. Sign in with an admin Discord account to see the queue.'
        : err.status === 0 ? "Couldn't reach the clip queue. It may not be deployed yet."
        : `Couldn't load clips: ${err.message}`);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [mock]);

  useEffect(() => {
    if (allowed) void load(status);
  }, [allowed, status, load]);

  const setBusyId = (id: number, on: boolean) =>
    setBusy((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });

  async function act(id: number, kind: ClipAction, reason = '') {
    if (busy.has(id)) return;
    setBusyId(id, true);
    setError('');
    try {
      await actOnClip(id, kind, mock, reason);
      setClips((cs) => cs.filter((c) => c.id !== id)); // it has moved to another tab
      if (rejecting === id) setRejecting(null);
    } catch (e) {
      console.error(`Could not ${kind} clip ${id}:`, e);
      const err = e as ClipApiError;
      setError(`Couldn't ${kind === 'posted' ? 'mark that clip posted' : `${kind} that clip`}: ${err.message}`);
      if (err.status === 409) void load(status);
    } finally {
      setBusyId(id, false);
    }
  }

  function markPosted(id: number) {
    if (window.confirm("Mark this clip as posted? Owen's Highlight Cutter normally does this itself after posting.")) void act(id, 'posted');
  }

  if (!allowed) {
    return (
      <Section id="clips" eyebrow="Admin" title="Clip Queue">
        {authLoading ? <Skeleton height={96} /> : (
          <div className={styles.gate} role="status">
            <h3>Admins only</h3>
            <p>Sign in with an admin Discord account to see the clip queue.</p>
          </div>
        )}
      </Section>
    );
  }

  const statusText = loading ? 'Loading clips…' : message || (clips.length ? '' : CLIP_EMPTY[status]);

  return (
    <Section id="clips" eyebrow="Admin" title="Clip Queue">
      <p className={styles.intro}>
        Clips members sent through the Discord bot. Approve the good ones and Owen renders and posts them. Admins only.
      </p>
      <div className={styles.tabs} role="tablist" aria-label="Clip status">
        {CLIP_STATUSES.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={status === t.key}
            className={`${styles.tab} ${status === t.key ? styles.on : ''}`}
            disabled={loading && status !== t.key}
            onClick={() => t.key !== status && setStatus(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <ul className={styles.list} aria-live="polite">
        {!loading && !message && clips.map((c) => (
          <ClipItem
            key={c.id}
            clip={c}
            mock={mock}
            busy={busy.has(c.id)}
            rejecting={rejecting === c.id}
            onApprove={() => void act(c.id, 'approve')}
            onPosted={() => markPosted(c.id)}
            onStartReject={() => setRejecting(c.id)}
            onCancel={() => setRejecting(null)}
            onReject={(reason) => void act(c.id, 'reject', reason)}
          />
        ))}
      </ul>
      {statusText && <p className={styles.status}>{statusText}</p>}
    </Section>
  );
}

interface ItemProps {
  clip: Clip; mock: boolean; busy: boolean; rejecting: boolean;
  onApprove: () => void; onPosted: () => void; onStartReject: () => void; onCancel: () => void; onReject: (reason: string) => void;
}

function ClipItem({ clip: c, mock, busy, rejecting, onApprove, onPosted, onStartReject, onCancel, onReject }: ItemProps) {
  const reasonRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (rejecting) reasonRef.current?.focus(); }, [rejecting]);

  const file = safeFileUrl(c.file_url, mock);
  const link = safeLink(c.link);
  const posts = (c.post_urls || []).map(safeLink).filter((u): u is string => !!u);
  const teams = c.teams || [];
  const matchOk = isMatchId(c.match_id);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = (new FormData(e.currentTarget).get('reason') as string | null) ?? '';
    onReject(reason.trim());
  }

  return (
    <li className={`${styles.item} ${busy ? styles.busy : ''}`}>
      <div className={styles.itemHead}>
        <span className={styles.who}>{c.submitter_name}</span>
        <time className={styles.when} dateTime={c.created_at}>{when(c.created_at)}</time>
      </div>

      {(teams.length > 0 || matchOk) && (
        <div className={styles.tags}>
          {teams.map((t, i) => <span key={`${t}-${i}`} className={styles.team}>{t}</span>)}
          {matchOk && (
            <a className={styles.match} href={`https://www.opendota.com/matches/${c.match_id}`} target="_blank" rel="noopener noreferrer">
              Match {c.match_id} ↗
            </a>
          )}
        </div>
      )}

      {c.description && <p className={styles.desc}>{c.description}</p>}

      {file ? <video className={styles.video} controls preload="metadata" src={file} />
        : c.file_path ? <p className={styles.note}>Uploaded file (no longer stored).</p>
        : link ? <a className={styles.link} href={link} target="_blank" rel="noopener noreferrer">Open clip on {hostOf(link)} ↗</a>
        : <p className={styles.note}>No clip link.</p>}

      {(c.reviewed_by || c.reject_reason || c.posted_at || posts.length > 0) && (
        <p className={styles.review}>
          {c.reviewed_by && (
            <span>{c.status === 'rejected' ? 'Rejected' : 'Approved'} by <strong>{c.reviewed_by}</strong>
              {c.reviewed_via === 'discord' ? ' in Discord' : ''} · {when(c.reviewed_at)}</span>
          )}
          {c.reject_reason && <span>Reason: {c.reject_reason}</span>}
          {c.posted_at && <span>Posted {when(c.posted_at)}</span>}
          {posts.length > 0 && (
            <span>
              {posts.map((u, i) => (
                <span key={u}>{i > 0 && ' · '}<a href={u} target="_blank" rel="noopener noreferrer">{hostOf(u)} ↗</a></span>
              ))}
            </span>
          )}
        </p>
      )}

      {rejecting ? (
        <form className={styles.reject} onSubmit={submit}>
          <label className={styles.rejectLabel} htmlFor={`clReason${c.id}`}>Reason (optional, the member may see it)</label>
          <input ref={reasonRef} className={styles.rejectInput} id={`clReason${c.id}`} name="reason" maxLength={300} autoComplete="off" />
          {c.file_path && <p className={styles.note}>The uploaded file is deleted. This can't be undone.</p>}
          <div className={styles.actions}>
            <button type="submit" className={`${styles.btn} ${styles.btnReject}`} disabled={busy}>Reject clip</button>
            <button type="button" className={styles.btn} onClick={onCancel} disabled={busy}>Cancel</button>
          </div>
        </form>
      ) : c.status === 'pending' ? (
        <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnApprove}`} onClick={onApprove} disabled={busy}>Approve</button>
          <button type="button" className={styles.btn} onClick={onStartReject} disabled={busy}>Reject…</button>
        </div>
      ) : c.status === 'approved' ? (
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={onPosted} disabled={busy}>Mark posted</button>
          <button type="button" className={styles.btn} onClick={onStartReject} disabled={busy}>Reject…</button>
        </div>
      ) : null}
    </li>
  );
}
