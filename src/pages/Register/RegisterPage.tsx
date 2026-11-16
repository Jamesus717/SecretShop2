import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DISCORD_URL, signupsCloseDate, signupsClosed } from '../../config';
import { getSession } from '../../lib/auth';
import { useAuth } from '../../lib/authContext';
import { supabase } from '../../lib/supabase';
import { LOGO_ACCEPT_ATTR, deleteTeamLogo, prepareLogo, saveTeamLogoRecord, uploadTeamLogo } from '../../lib/teamlogo';
import { Field, MmrField, PositionMulti, PositionRadio } from './FormParts';
import {
  DAYS, DRAFT_KEY, SLOTS, availabilityLabel, dotabuffUrl, emptySolo, emptyTeam, parseDraft, sanitizeSteam, serialiseDraft,
  soloEmbed, soloRow, soloSheetPayload, sortAvailability, stepOfError, teamEmbed, teamRow, teamSheetPayload, validatePlayer, validateSolo, validateTeam,
  type Draft, type Errors, type Mode, type PlayerForm, type SoloForm, type TeamForm,
} from './registration';
import f from './form.module.css';
import styles from './RegisterPage.module.css';

// Apps Script web app that appends the registration row (same deployment the rosters are read from).
const SHEET_URL = 'https://script.google.com/macros/s/AKfycby727bbYh0mTv8sWjyHe9DJVp5YTkZnTNyAzcxfWJPNXcnbJ32xbyX_QM7CQwlQ5Pie1Q/exec';
// Discord webhooks are secrets: never committed. Set these env vars to enable the posts; unset = skipped.
const ENV = import.meta.env as Record<string, string | undefined>;
const WEBHOOK = ENV.VITE_DISCORD_WEBHOOK_URL;
const LFT_WEBHOOK = ENV.VITE_DISCORD_LFT_WEBHOOK_URL;

const STEAM_HELP = (
  <details className={styles.help}>
    <summary>Where do I find my Steam ID?</summary>
    <p><strong>Easiest:</strong> open your Steam profile in a browser. If the URL is <code>steamcommunity.com/profiles/7656119…</code>, that 17-digit number is your Steam ID.</p>
    <p>If your URL shows a custom name instead, paste it into <strong>steamid.io</strong> and copy the <code>steamID64</code>.</p>
    <p><strong>In the Steam app:</strong> top-right, click your username, then <strong>Account details</strong>. Your Steam ID is shown below your username.</p>
  </details>
);

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function readStored(): { draft: Draft | null; forced: Mode | null } {
  try {
    const draft = parseDraft(localStorage.getItem(DRAFT_KEY));
    const forced = localStorage.getItem('sl_force_mode');
    if (forced) localStorage.removeItem('sl_force_mode');
    return { draft, forced: forced === 'solo' || forced === 'team' ? forced : null };
  } catch {
    return { draft: null, forced: null };
  }
}

function ClosedPanel() {
  const d = signupsCloseDate();
  const when = isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`container ${f.page}`}>
      <p className={f.eyebrow}>SecretLeague</p>
      <h1 className={f.title}>Register</h1>
      <div className={f.panel}>
        <h2>Sign-ups are closed</h2>
        <p>Registration for SecretLeague{when ? <> closed on <strong>{when}</strong></> : ' has closed'}. Thanks to everyone who entered; the season is now locked in.</p>
        <div className={f.actions}>
          <Link to="/team-info" className={f.btn}>View Team Info</Link>
        </div>
      </div>
      <div className={`${f.panel} ${styles.lazy}`}>
        <h2>Lazy League — coming soon</h2>
        <p>The next tournament is on its way. The date is still to be announced, so join the Discord to hear about sign-ups first.</p>
        <div className={f.actions}>
          <a href={DISCORD_URL} className={f.btnGhost} target="_blank" rel="noopener noreferrer">Join the Discord</a>
        </div>
      </div>
    </div>
  );
}

function AvailabilityGrid({ value, onChange, error }: { value: string[]; onChange: (v: string[]) => void; error?: string }) {
  const set = new Set(value);
  const toggle = (label: string) => {
    const next = new Set(set);
    if (next.has(label)) next.delete(label); else next.add(label);
    onChange(sortAvailability(next));
  };
  return (
    <fieldset className={styles.avail} aria-invalid={error ? true : undefined}>
      <legend className={f.label}>Availability<span className={f.req} aria-hidden="true">*</span> <span className={f.opt}>Select all times you can play. All times BST.</span></legend>
      <div className={styles.availGrid} role="group">
        <span />
        {SLOTS.map((s) => <span key={s.label} className={styles.availHead}>{s.label}<small>{s.range}</small></span>)}
        {DAYS.map((d, di) => (
          <div key={d} className={styles.availRow}>
            <span className={styles.availDay}>{d}</span>
            {SLOTS.map((s, si) => {
              const label = availabilityLabel(di, si);
              const on = set.has(label);
              return (
                <button key={label} type="button" className={styles.availCell} aria-pressed={on} aria-label={`${d} ${s.label} (${s.range})`} onClick={() => toggle(label)}>
                  {on ? '✓' : ''}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {error && <p className={f.error} role="alert">{error}</p>}
    </fieldset>
  );
}

function PlayerCard({ index, p, captain, errors, onChange, onCaptain }: {
  index: number; p: PlayerForm; captain: number; errors: Errors;
  onChange: (patch: Partial<PlayerForm>) => void; onCaptain: () => void;
}) {
  const n = index + 1;
  const k = `p${n}`;
  const isCap = captain === n;
  return (
    <div className={styles.player}>
      <div className={styles.playerHead}>
        <h3>Player {n}{isCap ? ' — Captain' : ''}</h3>
        <label className={`${styles.capToggle} ${isCap ? styles.capOn : ''}`}>
          <input type="radio" name="teamCaptain" checked={isCap} onChange={onCaptain} />
          <span>Captain</span>
        </label>
      </div>
      <Field label="Steam name" required value={p.ign} onChange={(v) => onChange({ ign: v })} error={errors[`${k}.ign`]} maxLength={40} autoComplete="off" />
      {STEAM_HELP}
      <div className={f.grid2}>
        <Field label="Steam ID (17 digits)" required value={p.steam} onChange={(v) => onChange({ steam: sanitizeSteam(v) })} error={errors[`${k}.steam`]} inputMode="numeric" maxLength={17} placeholder="17 digits" autoComplete="off" />
        <Field label="Discord" required={isCap} optional={!isCap} value={p.discord} onChange={(v) => onChange({ discord: v })} error={errors[`${k}.discord`]} maxLength={32} autoComplete="off" />
      </div>
      <MmrField label="MMR" value={p.mmr} onChange={(v) => onChange({ mmr: v })} error={errors[`${k}.mmr`]} />
      <PositionRadio legend="Position" name={`pos-${k}`} value={p.pos} onChange={(v) => onChange({ pos: v })} error={errors[`${k}.pos`]} />
    </div>
  );
}

export default function RegisterPage() {
  const { user, loading: authLoading, signIn } = useAuth();
  const [params] = useSearchParams();
  // Dev-only escape hatch so the form can be reviewed after the deadline; stripped from production builds.
  const forceOpen = import.meta.env.DEV && params.get('forceopen') === '1';
  const isClosed = useCallback(() => !forceOpen && signupsClosed(), [forceOpen]);

  const stored = useMemo(readStored, []);
  const [closed, setClosed] = useState(isClosed);
  const [mode, setMode] = useState<Mode>(stored.forced ?? stored.draft?.mode ?? 'team');
  const [solo, setSolo] = useState<SoloForm>(stored.draft?.solo ?? emptySolo());
  const [team, setTeam] = useState<TeamForm>(stored.draft?.team ?? emptyTeam());
  const [availability, setAvailability] = useState<string[]>(stored.draft?.availability ?? []);
  const [logoData, setLogoData] = useState<string | null>(stored.draft?.logo ?? null);
  const [logoBlob, setLogoBlob] = useState<Blob | null>(null);
  const [logoMsg, setLogoMsg] = useState<{ err: boolean; text: string } | null>(null);
  const [step, setStep] = useState(1);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState('');
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState<{ err: boolean; text: string } | null>(null);
  const [existing, setExisting] = useState<{ id: string; team_name: string } | null>(null);
  const [gateLoading, setGateLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const userId = user?.id;

  // A tab left open across the deadline closes in place.
  useEffect(() => {
    if (forceOpen) return;
    const d = signupsCloseDate().getTime();
    const left = d - Date.now();
    // setTimeout overflows past ~24.8 days, so only arm it when close.
    if (!isNaN(left) && left > 0 && left < 86400000) {
      const t = window.setTimeout(() => setClosed(true), left);
      return () => window.clearTimeout(t);
    }
  }, [forceOpen]);

  // Restore the logo blob from the saved draft's data URL.
  useEffect(() => {
    if (!stored.draft?.logo) return;
    let live = true;
    fetch(stored.draft.logo).then((r) => r.blob()).then((b) => { if (live) setLogoBlob(b); }).catch(() => { if (live) setLogoData(null); });
    return () => { live = false; };
  }, [stored]);

  // Persist the draft.
  useEffect(() => {
    if (done || closed) return;
    try { localStorage.setItem(DRAFT_KEY, serialiseDraft({ mode, solo, team, logo: logoData, availability })); } catch { /* quota */ }
  }, [mode, solo, team, logoData, availability, done, closed]);

  // Team gate: one team per captain account.
  useEffect(() => {
    if (authLoading) return;
    if (!userId) { setExisting(null); setGateLoading(false); return; }
    let live = true;
    supabase.from('team_registrations').select('id, team_name').eq('captain_user_id', userId).maybeSingle()
      .then(({ data }) => { if (live) { setExisting(data ?? null); setGateLoading(false); } });
    return () => { live = false; };
  }, [userId, authLoading]);

  // Prefill from the profile, only into empty fields.
  useEffect(() => {
    if (!userId) return;
    let live = true;
    const md = user?.user_metadata ?? {};
    const discordName: string = md.full_name || md.name || '';
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle().then(({ data }) => {
      if (!live) return;
      const mmr = data?.mmr ? String(data.mmr) : '';
      const ign: string = data?.ign ?? '';
      const steam: string = data?.steam_id ? sanitizeSteam(String(data.steam_id)) : '';
      const pos = data?.primary_position ? String(data.primary_position) : '';
      setSolo((s) => ({ ...s, ign: s.ign || ign, steam: s.steam || steam, discord: s.discord || discordName, mmr: s.mmr || mmr, positions: s.positions.length || !pos ? s.positions : [pos] }));
      setTeam((t) => {
        const p = { ...t.players[0] };
        p.ign ||= ign; p.steam ||= steam; p.mmr ||= mmr; p.pos ||= pos; p.discord ||= discordName;
        return { ...t, players: [p, ...t.players.slice(1)] };
      });
    });
    return () => { live = false; };
  }, [userId, user]);

  const hasLogo = !!logoBlob;
  const liveErrors: Errors = useMemo(
    () => (mode === 'solo' ? validateSolo(solo, availability) : validateTeam(team, hasLogo, availability)),
    [mode, solo, team, hasLogo, availability],
  );
  const errors: Errors = useMemo(() => {
    const out: Errors = {};
    for (const k of Object.keys(liveErrors)) if (shown.has(k)) out[k] = liveErrors[k];
    return out;
  }, [liveErrors, shown]);

  const reveal = (keys: string[]) => setShown((s) => new Set([...s, ...keys]));
  const focusFirstInvalid = () => window.setTimeout(() => {
    const el = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.focus?.();
  }, 60);

  const patchPlayer = (i: number, patch: Partial<PlayerForm>) =>
    setTeam((t) => ({ ...t, players: t.players.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    setLogoMsg({ err: false, text: 'Processing image…' });
    try {
      const blob = await prepareLogo(file);
      setLogoBlob(blob);
      setLogoData(await blobToDataUrl(blob));
      setLogoMsg({ err: false, text: `Ready, resized to 256px (${Math.round(blob.size / 1024)}KB).` });
    } catch (e) {
      setLogoBlob(null); setLogoData(null);
      setLogoMsg({ err: true, text: e instanceof Error ? e.message : "Couldn't use that image. Try a different file." });
    }
    if (fileRef.current) fileRef.current.value = '';
  }
  const clearLogo = () => { setLogoBlob(null); setLogoData(null); setLogoMsg(null); };

  function nextStep() {
    const i = step - 1;
    const errs = { ...validatePlayer(team.players[i], i, team.captain), ...(step === 1 && !team.name.trim() ? { name: 'Enter a team name' } : {}) };
    if (Object.keys(errs).length) {
      reveal(Object.keys(errs));
      setNotice({ err: true, text: 'Please fill out all required fields correctly.' });
      focusFirstInvalid();
      return;
    }
    setNotice(null);
    setStep(step + 1);
  }

  async function deleteExistingTeam() {
    if (!existing) return;
    setDeleting(true);
    const { error } = await supabase.from('team_registrations').delete().eq('id', existing.id);
    if (!error) await deleteTeamLogo(userId);
    setDeleting(false);
    if (error) { setNotice({ err: true, text: 'Delete failed. Please try again or contact staff.' }); return; }
    setExisting(null);
    setConfirmDelete(false);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setTeam(emptyTeam()); clearLogo(); setStep(1); setShown(new Set());
    setNotice({ err: false, text: 'Team registration deleted. You can register a new team now.' });
  }

  async function postWebhook(url: string | undefined, body: unknown): Promise<boolean> {
    if (!url) return true;
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) console.error('Discord webhook failed:', res.status);
      return res.ok;
    } catch (e) {
      console.error('Discord webhook failed:', e);
      return false;
    }
  }

  async function submit() {
    // Defence in depth: a tab opened before the deadline must still not be able to submit.
    if (isClosed()) { setClosed(true); return; }
    setNotice(null);

    const isSolo = mode === 'solo';
    if (!isSolo && (!userId || existing)) { setNotice({ err: true, text: existing ? "You've already registered a team on this Discord account." : 'Please log in with Discord to register a team.' }); return; }

    const errs = isSolo ? validateSolo(solo, availability) : validateTeam(team, hasLogo, availability);
    if (Object.keys(errs).length) {
      reveal(Object.keys(errs));
      const firstStep = Math.min(...Object.keys(errs).map(stepOfError).filter((s) => s > 0), 99);
      if (!isSolo && firstStep <= 5 && !errs.name) setStep(firstStep);
      setNotice({ err: true, text: 'Please fix the highlighted fields.' });
      focusFirstInvalid();
      return;
    }

    if (isSolo) {
      let taken = false;
      try {
        const { data } = await supabase.rpc('solo_steam_id_registered', { p_steam_id: solo.steam });
        taken = !!data;
      } catch { taken = false; }
      if (taken) { setNotice({ err: true, text: 'This Steam ID is already registered for solo entry.' }); return; }
    }

    setSubmitting('Transmitting…');
    try {
      const timestamp = new Date().toLocaleString();
      if (isSolo) {
        const embed = soloEmbed(solo, availability);
        const { error } = await supabase.from('solo_registrations').insert(soloRow(solo));
        if (error) console.error('Solo registration insert failed:', error);
        void postWebhook(LFT_WEBHOOK, { content: `${solo.discord.trim() || solo.ign.trim()} is looking for a team:`, embeds: [embed], allowed_mentions: { parse: [] } });
        await postWebhook(WEBHOOK, { embeds: [embed], allowed_mentions: { parse: [] } });
        void fetch(SHEET_URL, { method: 'POST', mode: 'no-cors', cache: 'no-cache', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(soloSheetPayload(solo, availability, timestamp)) }).catch(() => {});
      } else {
        // Fresh session rather than the page-load one, in case it went stale in a long-open tab.
        const fresh = await getSession();
        const captainUserId = fresh?.user?.id;
        if (!captainUserId || !logoBlob) throw new Error('your Discord login expired. Please log in again and resubmit.');

        // Logo first: if the upload fails nothing has been written anywhere yet.
        setSubmitting('Uploading logo…');
        const logoUrl = await uploadTeamLogo(captainUserId, logoBlob).catch((err) => {
          console.error('Team logo upload failed:', err);
          throw new Error('the team logo could not be uploaded. Please try again.');
        });
        setSubmitting('Transmitting…');

        // Insert before notifying Discord/the sheet so a duplicate-captain rejection (23505) writes nothing else.
        const { error } = await supabase.from('team_registrations').insert(teamRow(team, captainUserId, logoUrl));
        if (error?.code === '23505') {
          setExisting({ id: '', team_name: team.name.trim() });
          setNotice({ err: true, text: "You've already registered a team on this Discord account." });
          setSubmitting('');
          return;
        }
        if (error) throw new Error('your registration could not be saved. Please try again or contact staff.');

        // Public name -> logo lookup that Team Info reads (team_registrations is private).
        await saveTeamLogoRecord(captainUserId, team.name.trim(), logoUrl).catch((err) => console.error('Failed to save team logo record:', err));

        const embed = { ...teamEmbed(team, availability), thumbnail: { url: logoUrl } };
        await postWebhook(WEBHOOK, { embeds: [embed], allowed_mentions: { parse: [] } });
        void fetch(SHEET_URL, { method: 'POST', mode: 'no-cors', cache: 'no-cache', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(teamSheetPayload(team, availability, logoUrl, timestamp)) }).catch(() => {});
      }
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      console.error('Submission error:', e);
      setNotice({ err: true, text: `Transmission failed: ${e instanceof Error ? e.message : 'please try again.'}` });
    }
    setSubmitting('');
  }

  if (closed) return <ClosedPanel />;

  if (done) {
    return (
      <div className={`container ${f.page}`}>
        <p className={f.eyebrow}>SecretLeague</p>
        <h1 className={f.title}>Register</h1>
        <div className={f.panel} role="status">
          <h2>Registration received</h2>
          <p>Your entry has been submitted to SecretLeague. Staff will review it and get in touch on Discord.</p>
          <div className={f.actions}>
            <Link to="/team-info" className={f.btn}>View Team Info</Link>
            <Link to="/profile" className={f.btnGhost}>My profile</Link>
          </div>
        </div>
      </div>
    );
  }

  const gated = mode === 'team' && (!user || !!existing);
  const isSolo = mode === 'solo';

  return (
    <div className={`container ${f.page}`}>
      <p className={f.eyebrow}>SecretLeague</p>
      <h1 className={f.title}>Register</h1>
      <p className={f.lede}>Enter as a full team, or sign up solo and let teams find you.</p>

      <div className={styles.modes} role="tablist" aria-label="Entry type">
        <button type="button" role="tab" aria-selected={!isSolo} className={styles.mode} onClick={() => setMode('team')}>Team entry</button>
        <button type="button" role="tab" aria-selected={isSolo} className={styles.mode} onClick={() => setMode('solo')}>Solo entry</button>
      </div>

      {notice && <p className={f.status} data-kind={notice.err ? 'err' : 'ok'} role="alert">{notice.text}</p>}

      {mode === 'team' && (authLoading || (!!user && gateLoading)) ? (
        <div className={f.panel} aria-busy="true"><p>Checking your registration status…</p></div>
      ) : gated && !user ? (
        <div className={f.panel}>
          <h2>Log in to register a team</h2>
          <p>So teams cannot sign up more than once by accident, whoever is registering the team logs in with Discord first.</p>
          <div className={f.actions}><button type="button" className={f.btn} onClick={() => void signIn('/register')}>Login with Discord</button></div>
        </div>
      ) : gated && existing ? (
        <div className={f.panel}>
          <h2>You are already signed up</h2>
          <p>Your team <strong>{existing.team_name}</strong> is registered for SecretLeague. Head to Team Info to see your squad and the rest of the competition.</p>
          <div className={f.actions}>
            <Link to="/team-info" className={f.btn}>View Team Info</Link>
            {!confirmDelete && <button type="button" className={f.btnDanger} onClick={() => setConfirmDelete(true)}>Delete my team registration</button>}
          </div>
          {confirmDelete && (
            <div className={styles.confirm} role="group" aria-label="Confirm team deletion">
              <p>Delete <strong>{existing.team_name}</strong>? You will need to resubmit your full roster to register again. This only removes it from our system: an admin must delete the Google Sheet row and Team Info entry separately.</p>
              <div className={f.actions} style={{ marginTop: 0 }}>
                <button type="button" className={f.btnDanger} disabled={deleting} onClick={() => void deleteExistingTeam()}>{deleting ? 'Deleting…' : 'Yes, delete it'}</button>
                <button type="button" className={f.btnGhost} disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
          {isSolo ? (
            <section className={f.card} aria-labelledby="solo-title">
              <h2 id="solo-title">Player info</h2>
              <p className={f.sub}>Looking for a team? Sign up on your own. Your details are posted to the looking-for-team channel so teams can find you.</p>
              <Field label="Steam name" required value={solo.ign} onChange={(v) => setSolo({ ...solo, ign: v })} error={errors.ign} maxLength={40} autoComplete="off" />
              {STEAM_HELP}
              <Field label="Steam ID (17 digits)" required value={solo.steam} onChange={(v) => setSolo({ ...solo, steam: sanitizeSteam(v) })} error={errors.steam} inputMode="numeric" maxLength={17} placeholder="17 digits" autoComplete="off"
                hint={solo.steam.length === 17 ? <a className={f.link} href={dotabuffUrl(solo.steam)} target="_blank" rel="noopener noreferrer">Check your Dotabuff profile →</a> : undefined} />
              <Field label="Discord username" optional value={solo.discord} onChange={(v) => setSolo({ ...solo, discord: v })} maxLength={32} autoComplete="off" />
              <MmrField value={solo.mmr} onChange={(v) => setSolo({ ...solo, mmr: v })} error={errors.mmr} />
              <PositionMulti legend="Positions" name="pos-solo" value={solo.positions} onChange={(v) => setSolo({ ...solo, positions: v })} error={errors.positions} />
              <p className={f.hint} style={{ marginTop: 8 }}>Select every role you play. Your first pick is your primary role, the rest are secondary.</p>
            </section>
          ) : (
            <>
              <section className={f.card} aria-labelledby="team-title">
                <h2 id="team-title">Team info</h2>
                <p className={f.sub}>Already have a squad? Register your full 5-player roster here.</p>
                <Field label="Team name" required value={team.name} onChange={(v) => setTeam({ ...team, name: v })} error={errors.name} maxLength={40} autoComplete="off" />
                <div className={f.field}>
                  <span className={f.label} id="logo-label">Team logo<span className={f.req} aria-hidden="true">*</span></span>
                  <div className={styles.logoRow}>
                    <span className={styles.logoBox} aria-hidden="true">{logoData ? <img src={logoData} alt="" /> : <span>🛡</span>}</span>
                    <input ref={fileRef} id="team-logo" type="file" accept={LOGO_ACCEPT_ATTR} className="visually-hidden" aria-labelledby="logo-label" aria-invalid={errors.logo ? true : undefined} onChange={(e) => void pickLogo(e.target.files?.[0])} />
                    <label htmlFor="team-logo" className={f.btnGhost} style={{ cursor: 'pointer' }}>Choose image</label>
                    {logoData && <button type="button" className={f.btnGhost} onClick={clearLogo}>Remove</button>}
                  </div>
                  <p className={f.hint}>PNG, JPG, WEBP or GIF. Square images look best; we resize it for you.</p>
                  {logoMsg && <p className={logoMsg.err ? f.error : f.hint} role={logoMsg.err ? 'alert' : 'status'}>{logoMsg.text}</p>}
                  {errors.logo && <p className={f.error} role="alert">{errors.logo}</p>}
                </div>
              </section>

              <section className={f.card} aria-labelledby="players-title">
                <h2 id="players-title">Players <span className={`${styles.stepNum} num`}>{step} of 5</span></h2>
                <div className={styles.dots} aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={n === step ? styles.dotOn : n < step ? styles.dotDone : styles.dot} />)}</div>
                <PlayerCard
                  key={step}
                  index={step - 1}
                  p={team.players[step - 1]}
                  captain={team.captain}
                  errors={errors}
                  onChange={(patch) => patchPlayer(step - 1, patch)}
                  onCaptain={() => setTeam({ ...team, captain: step })}
                />
                <div className={styles.stepper}>
                  <button type="button" className={f.btnGhost} disabled={step === 1} onClick={() => { setNotice(null); setStep(step - 1); }}>◄ Previous</button>
                  {step < 5 && <button type="button" className={f.btn} onClick={nextStep}>Next ►</button>}
                </div>
              </section>
            </>
          )}

          <section className={f.card} aria-label="Availability">
            <AvailabilityGrid value={availability} onChange={setAvailability} error={errors.availability} />
          </section>

          {(isSolo || step === 5) && (
            <div className={f.actions}>
              <button type="submit" className={f.btn} disabled={!!submitting}>{submitting || 'Submit entry'}</button>
            </div>
          )}
          {!isSolo && step < 5 && <p className={f.hint} style={{ marginTop: 16 }}>Fill in all five players, then submit on the last step.</p>}
        </form>
      )}
    </div>
  );
}
