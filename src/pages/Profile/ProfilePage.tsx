import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Crest from '../../components/Crest/Crest';
import Skeleton from '../../components/Skeleton/Skeleton';
import { useAuth } from '../../lib/authContext';
import { supabase } from '../../lib/supabase';
import { LOGO_ACCEPT_ATTR, logoKey, prepareLogo, saveTeamLogoRecord, uploadTeamLogo } from '../../lib/teamlogo';
import { altAccountsFor, mmrToRank } from '../../lib/rosters';
import { loadLogoMap } from '../../hooks/useTeamLogos';
import { Field, MmrField, PositionRadio } from '../Register/FormParts';
import { MAX_MMR, dotabuffUrl, isSteamId, parseMmr, sanitizeSteam } from '../Register/registration';
import f from '../Register/form.module.css';
import styles from './ProfilePage.module.css';

interface Registration { id: string; type: 'team' | 'solo'; label: string; status: string; created_at: string }
interface TeamRow { id: string; team_name: string }
type Msg = { kind: 'ok' | 'err'; text: string } | null;

const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path fill="currentColor" d="M20.3 4.4a19.7 19.7 0 0 0-4.8-1.5l-.2.4a18.3 18.3 0 0 1 3.6 1.1c-1.6-.8-3.3-1.3-5.1-1.6a17.8 17.8 0 0 0-3.6 0c-1.8.3-3.5.8-5.1 1.6a18.3 18.3 0 0 1 3.6-1.1l-.2-.4a19.7 19.7 0 0 0-4.8 1.5A19.4 19.4 0 0 0 1.8 17a19.8 19.8 0 0 0 6.1 3l.7-1.2a12.2 12.2 0 0 1-1.9-.9l.5-.4c1.1.5 2.3.9 3.5 1.1a16 16 0 0 0 2.6 0c1.2-.2 2.4-.6 3.5-1.1l.5.4c-.6.4-1.2.7-1.9.9l.7 1.2a19.8 19.8 0 0 0 6.1-3 19.4 19.4 0 0 0-1.6-12.6ZM9.3 14.8c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm5.4 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
  </svg>
);

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });
}

export default function ProfilePage() {
  const { user, profile, isAdmin, loading, signIn, signOut } = useAuth();
  const navigate = useNavigate();

  const [ready, setReady] = useState(false);
  const [ign, setIgn] = useState('');
  const [steam, setSteam] = useState('');
  const [mmr, setMmr] = useState('');
  const [pos, setPos] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [regs, setRegs] = useState<Registration[] | null>(null);
  const [team, setTeam] = useState<TeamRow | null>(null);

  // team logo (captains)
  const [logoBlob, setLogoBlob] = useState<Blob | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoMsg, setLogoMsg] = useState<Msg>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // account deletion
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<Msg>(null);

  const userId = user?.id;
  const fallbackName = profile?.name ?? '';

  useEffect(() => {
    if (!userId) { setReady(false); return; }
    let live = true;
    (async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!live) return;
      if (data) {
        setIgn(data.ign ?? '');
        setSteam(data.steam_id ?? '');
        setMmr(data.mmr ? String(data.mmr) : '');
        setPos(data.primary_position ? String(data.primary_position) : '');
      }
      setReady(true);

      const uname = data?.discord_username || fallbackName;
      const out: Registration[] = [];
      if (uname) {
        const solo = await supabase.from('solo_registrations').select('id,status,created_at').eq('discord_username', uname).order('created_at', { ascending: false });
        (solo.data ?? []).forEach((r) => out.push({ ...r, type: 'solo', label: 'Solo' }));
        const teams = await supabase.from('team_registrations').select('id,status,created_at,team_name').contains('players', [{ discord_username: uname }]).order('created_at', { ascending: false });
        (teams.data ?? []).forEach((r) => out.push({ id: r.id, status: r.status, created_at: r.created_at, type: 'team', label: r.team_name || 'Team' }));
      }
      out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      if (live) setRegs(out);

      const own = await supabase.from('team_registrations').select('id, team_name').eq('captain_user_id', userId).maybeSingle();
      if (live) setTeam(own.data ?? null);
    })().catch((e) => { console.error('Profile failed to load:', e); if (live) { setReady(true); setRegs([]); } });
    return () => { live = false; };
  }, [userId, fallbackName]);

  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);

  const rank = mmrToRank(parseMmr(mmr));
  const alts = altAccountsFor(steam);

  const save = useCallback(async () => {
    if (!userId) return;
    const e: Record<string, string> = {};
    if (steam && !isSteamId(steam)) e.steam = 'Steam ID must be exactly 17 digits.';
    if (mmr.trim() && parseMmr(mmr) === null) e.mmr = `MMR must be a whole number from 1 to ${MAX_MMR.toLocaleString('en-GB')}.`;
    setErrors(e);
    if (Object.keys(e).length) { setMsg({ kind: 'err', text: 'Please fix the highlighted fields.' }); return; }
    setSaving(true);
    setMsg(null);
    const m = parseMmr(mmr);
    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      ign: ign.trim() || null,
      steam_id: steam || null,
      mmr: m,
      rank: m ? mmrToRank(m)?.label ?? null : null,
      primary_position: pos ? Number(pos) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    setSaving(false);
    setMsg(error ? { kind: 'err', text: 'Save failed. Please try again.' } : { kind: 'ok', text: 'Profile saved.' });
  }, [userId, ign, steam, mmr, pos]);

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    setLogoMsg({ kind: 'ok', text: 'Processing image…' });
    try {
      const blob = await prepareLogo(file);
      setLogoBlob(blob);
      setLogoPreview(URL.createObjectURL(blob));
      setLogoMsg({ kind: 'ok', text: `Ready, resized to 256px (${Math.round(blob.size / 1024)}KB). Press Save logo to publish it.` });
    } catch (err) {
      setLogoBlob(null);
      setLogoPreview(null);
      setLogoMsg({ kind: 'err', text: err instanceof Error ? err.message : "Couldn't use that image." });
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  async function saveLogo() {
    if (!userId || !team || !logoBlob) return;
    setLogoBusy(true);
    setLogoMsg(null);
    try {
      const url = await uploadTeamLogo(userId, logoBlob);
      await saveTeamLogoRecord(userId, team.team_name, url);
      (await loadLogoMap()).set(logoKey(team.team_name), url);
      setLogoBlob(null);
      setLogoMsg({ kind: 'ok', text: 'Team logo updated. It may take a moment to show everywhere.' });
    } catch (err) {
      console.error('Team logo upload failed:', err);
      setLogoMsg({ kind: 'err', text: 'The logo could not be uploaded. Please try again.' });
    }
    setLogoBusy(false);
  }

  async function deleteAccount() {
    if (!userId) return;
    setDeleting(true);
    setDeleteMsg({ kind: 'ok', text: 'Deleting account…' });
    try {
      const uname = (await supabase.from('profiles').select('discord_username').eq('id', userId).maybeSingle()).data?.discord_username;
      if (uname) {
        const { error } = await supabase.from('solo_registrations').delete().eq('discord_username', uname);
        if (error) throw error;
      }
      const t = await supabase.from('team_registrations').delete().eq('captain_user_id', userId);
      if (t.error) throw t.error;
      const p = await supabase.from('profiles').delete().eq('id', userId);
      if (p.error) throw p.error;
      await signOut();
      setDeleteMsg({ kind: 'ok', text: 'Account deleted.' });
      window.setTimeout(() => navigate('/'), 1500);
    } catch (e) {
      console.error('Account deletion failed:', e);
      setDeleteMsg({ kind: 'err', text: 'Delete failed. Please try again or contact staff.' });
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className={`container ${f.page}`} aria-busy="true">
        <h1 className={f.title}>Profile</h1>
        <div className={f.card}><Skeleton width={64} height={64} /><Skeleton height={20} className={styles.sk} /><Skeleton height={48} className={styles.sk} /></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`container ${f.page}`}>
        <p className={f.eyebrow}>Account</p>
        <h1 className={f.title}>Profile</h1>
        <div className={f.panel}>
          <h2>Log in to view your profile</h2>
          <p>Your profile holds your Steam ID, MMR and preferred position so registering takes seconds. We use Discord to log you in; we never see your password.</p>
          <div className={f.actions}>
            <button type="button" className={f.btn} onClick={() => void signIn('/profile')}><DiscordIcon /> Login with Discord</button>
          </div>
        </div>
      </div>
    );
  }

  const name = profile?.name ?? 'Discord user';
  return (
    <div className={`container ${f.page}`}>
      <p className={f.eyebrow}>Account</p>
      <h1 className={f.title}>Profile</h1>

      <section className={`${f.card} ${styles.identity}`} aria-label="Discord identity">
        {profile?.avatarUrl
          ? <img className={styles.avatar} src={profile.avatarUrl} alt="" width={72} height={72} referrerPolicy="no-referrer" />
          : <span className={styles.avatar} aria-hidden="true" />}
        <div className={styles.idText}>
          <p className={styles.name}>{name}{isAdmin && <span className={styles.admin}>Admin</span>}</p>
          <p className={f.hint}>Connected via Discord</p>
        </div>
        <button type="button" className={f.btnGhost} onClick={() => void signOut()}>Log out</button>
      </section>

      <section className={f.card} aria-labelledby="tp-title">
        <h2 id="tp-title">Tournament profile</h2>
        {!ready ? <><Skeleton height={48} className={styles.sk} /><Skeleton height={48} className={styles.sk} /></> : (
          <form onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
            <Field label="In-game name" value={ign} onChange={setIgn} maxLength={40} autoComplete="off" optional hint="Prefilled on the registration form." />
            <Field
              label="Steam ID (17 digits)"
              value={steam}
              onChange={(v) => setSteam(sanitizeSteam(v))}
              inputMode="numeric"
              maxLength={17}
              placeholder="17 digits"
              autoComplete="off"
              error={errors.steam}
              hint={isSteamId(steam) ? <a className={f.link} href={dotabuffUrl(steam)} target="_blank" rel="noopener noreferrer">View Dotabuff profile →</a> : undefined}
            />
            <MmrField value={mmr} onChange={setMmr} error={errors.mmr} label="MMR" />
            <PositionRadio legend="Primary position" name="pos-profile" value={pos} onChange={setPos} />
            <div className={f.actions}>
              <button type="submit" className={f.btn} disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
            </div>
            <p className={f.status} data-kind={msg?.kind} role="status">{msg?.text}</p>
            {rank && <p className={f.hint}>Rank is worked out from your MMR: {rank.label}.</p>}
          </form>
        )}
      </section>

      <section className={f.card} aria-labelledby="alt-title">
        <h2 id="alt-title">Second accounts</h2>
        {alts.length ? (
          <ul className={styles.list}>
            {alts.map((a) => (
              <li key={a.url}><a className={f.link} href={a.url} target="_blank" rel="noopener noreferrer">{a.label} account on Dotabuff ↗</a></li>
            ))}
          </ul>
        ) : (
          <p className={f.sub} style={{ margin: 0 }}>No second account is linked to your Steam ID. If you play on another account, ask staff in the Discord and we will list it next to your name on Team Info.</p>
        )}
      </section>

      {team && (
        <section className={f.card} aria-labelledby="logo-title">
          <h2 id="logo-title">Team logo</h2>
          <p className={f.sub}>You are the captain of <strong>{team.team_name}</strong>. Upload a new crest for Team Info and the other pages.</p>
          <div className={styles.logoRow}>
            {logoPreview
              ? <img className={styles.logoPreview} src={logoPreview} alt="New logo preview" width={96} height={96} />
              : <Crest name={team.team_name} size={96} />}
            <div className={styles.logoActions}>
              <input ref={fileRef} type="file" accept={LOGO_ACCEPT_ATTR} className="visually-hidden" id="logo-file" onChange={(e) => void pickLogo(e.target.files?.[0])} />
              <label htmlFor="logo-file" className={f.btnGhost} style={{ cursor: 'pointer' }}>Choose image</label>
              <button type="button" className={f.btn} disabled={!logoBlob || logoBusy} onClick={() => void saveLogo()}>{logoBusy ? 'Uploading…' : 'Save logo'}</button>
            </div>
          </div>
          <p className={f.hint}>PNG, JPG, WEBP or GIF. Square images look best; we resize it for you.</p>
          <p className={f.status} data-kind={logoMsg?.kind} role="status">{logoMsg?.text}</p>
        </section>
      )}

      <section className={f.card} aria-labelledby="reg-title">
        <h2 id="reg-title">My registrations</h2>
        {regs === null ? <Skeleton height={56} /> : regs.length === 0 ? (
          <p className={f.sub} style={{ margin: 0 }}>No registrations yet. Head to <Link className={f.link} to="/register">Register</Link> to submit an entry.</p>
        ) : (
          <ul className={styles.regs}>
            {regs.map((r) => (
              <li key={`${r.type}-${r.id}`} className={styles.reg}>
                <div>
                  <p className={styles.regTitle}>{r.type === 'team' ? 'Team registration' : 'Solo registration'} · {r.label}</p>
                  <p className={f.hint}>Registered {formatDate(r.created_at)}</p>
                </div>
                <span className={styles.pill} data-status={r.status || 'pending'}>{r.status || 'pending'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${f.card} ${styles.danger}`} aria-labelledby="danger-title">
        <h2 id="danger-title">Danger zone</h2>
        <p className={f.sub}>Permanently delete your profile and all your registrations from our database. This cannot be undone.</p>
        {!confirmDelete ? (
          <button type="button" className={f.btnDanger} onClick={() => setConfirmDelete(true)}>Delete my account</button>
        ) : (
          <div className={styles.confirm} role="group" aria-label="Confirm account deletion">
            <p><strong>Last chance.</strong> This removes your profile, any solo entry, and your team registration if you are a captain.</p>
            <Field label="Type DELETE to confirm" value={deleteText} onChange={setDeleteText} autoComplete="off" spellCheck={false} />
            <div className={f.actions} style={{ marginTop: 0 }}>
              <button type="button" className={f.btnDanger} disabled={deleteText.trim() !== 'DELETE' || deleting} onClick={() => void deleteAccount()}>{deleting ? 'Deleting…' : 'Permanently delete'}</button>
              <button type="button" className={f.btnGhost} disabled={deleting} onClick={() => { setConfirmDelete(false); setDeleteText(''); setDeleteMsg(null); }}>Cancel</button>
            </div>
          </div>
        )}
        <p className={f.status} data-kind={deleteMsg?.kind} role="status">{deleteMsg?.text}</p>
      </section>
    </div>
  );
}
