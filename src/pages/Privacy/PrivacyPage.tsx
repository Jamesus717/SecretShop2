import { CONTACT_EMAIL } from '../../config';
import { openConsentSettings, useConsent } from '../../lib/consent';
import styles from './Privacy.module.css';

/*
 * ADMINS: PLEASE REVIEW THIS PAGE BEFORE RELYING ON IT. It is a plain-English draft written from an audit of the code
 * (localStorage / sessionStorage / cookies / iframes / third-party requests in src/, index.html and functions/).
 * It is NOT legal advice. If you add analytics, a new embed or a new data field, update the tables below and LAST_UPDATED.
 * Audit facts this relies on:
 *  - No analytics, ad or tracking scripts. No first-party cookies are set by our own code.
 *  - Supabase JS client keeps the login session in localStorage (key sb-<project>-auth-token).
 *  - localStorage: theme, secretshop_draft_v2 (registration draft), sl_force_mode (one-off), sl_consent_v1 (this choice).
 *  - sessionStorage: ss_rosters_v1 (roster cache, 10 min).
 *  - Fonts load from Google Fonts. YouTube highlights load via youtube-nocookie.com only after consent + a click.
 *  - Twitch / Discord / Ko-fi / Instagram / X / TikTok are plain links, not embeds.
 *  - Registrations go to Supabase and a Google Apps Script / Google Sheet; an optional Discord webhook may post them.
 */
const LAST_UPDATED = '2026-11-17';

interface Row { name: string; purpose: string; type: string; where: string; duration: string }

const STORAGE: Row[] = [
  { name: 'sb-…-auth-token', purpose: 'Keeps you logged in after Discord login (Supabase session).', type: 'Essential', where: 'localStorage', duration: 'Until you log out; the session token refreshes itself' },
  { name: 'sl_consent_v1', purpose: 'Remembers your choice in the cookie banner.', type: 'Essential', where: 'localStorage', duration: 'Until you clear site data' },
  { name: 'theme', purpose: 'Remembers light or dark mode.', type: 'Functional', where: 'localStorage', duration: 'Until you clear site data' },
  { name: 'secretshop_draft_v2', purpose: 'Saves your half-filled registration form (including a chosen logo) so you do not lose it.', type: 'Functional', where: 'localStorage', duration: 'Until you submit or clear the form, or clear site data' },
  { name: 'sl_force_mode', purpose: 'One-off flag that opens the registration form in solo or team mode.', type: 'Functional', where: 'localStorage', duration: 'Removed as soon as it is read' },
  { name: 'ss_rosters_v1', purpose: 'Caches team rosters so pages load faster.', type: 'Functional', where: 'sessionStorage', duration: 'Up to 10 minutes, and gone when you close the tab' },
];

export default function PrivacyPage() {
  const consent = useConsent();
  return (
    <div className={`container ${styles.page}`}>
      <p className={styles.eyebrow}>SecretLeague</p>
      <h1 className={styles.title}>Privacy &amp; Cookies</h1>
      <p className={styles.updated}>Last updated {LAST_UPDATED}</p>

      <div className={styles.body}>
        <section aria-labelledby="who">
          <h2 id="who">Who we are</h2>
          <p>
            SecretLeague is a UK community that runs Dota 2 tournaments, plus Deadlock and Minecraft communities. It is run by
            volunteer admins, who are the &ldquo;controller&rdquo; of your data under UK GDPR. Contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> about anything on this page.
          </p>
        </section>

        <section aria-labelledby="data">
          <h2 id="data">What we collect, and why</h2>
          <ul>
            <li><strong>Discord login.</strong> If you log in, Discord tells us your Discord ID, username and avatar. We use them to show who you are, link your registration to you and let admins manage the league. Legal basis: our legitimate interest in running the league, and you choosing to log in.</li>
            <li><strong>Registration forms.</strong> Steam name, Steam ID, Discord name, MMR, preferred positions, availability and, for teams, the team name and logo you upload. We use them to run signups, build teams and schedule matches. Legal basis: taking part in the league at your request.</li>
            <li><strong>Team logos.</strong> The image you upload is stored and shown publicly on the site.</li>
            <li><strong>Technical logs.</strong> Our host, Cloudflare, sees your IP address and browser details when you load the site, to deliver it and keep it secure. We do not use this for tracking or profiling.</li>
          </ul>
          <p>We do not run analytics, advertising or tracking scripts, and we do not sell your data.</p>
        </section>

        <section aria-labelledby="where">
          <h2 id="where">Where it is stored</h2>
          <ul>
            <li><strong>Supabase</strong> (database, login and file storage): profile, registrations and logos.</li>
            <li><strong>Google Sheets</strong> (via a Google Apps Script): a copy of registration entries that admins use to organise teams and rosters.</li>
            <li><strong>Discord</strong>: new signups may be posted to private admin channels on our Discord server.</li>
            <li><strong>Cloudflare</strong>: hosts the site and the small server functions behind it (for example league stats from Imprint, which contain no personal data from you).</li>
          </ul>
          <p>Some of these providers process data outside the UK. They rely on standard safeguards such as the UK&rsquo;s international data transfer arrangements.</p>
        </section>

        <section aria-labelledby="keep">
          <h2 id="keep">How long we keep it</h2>
          <ul>
            <li>Registration entries: for the season they relate to, then deleted or anonymised within about 12 months unless you ask us to remove them sooner.</li>
            <li>Your login profile: until you ask us to delete your account.</li>
            <li>Browser storage: see the table below.</li>
          </ul>
        </section>

        <section aria-labelledby="rights">
          <h2 id="rights">Your rights</h2>
          <p>
            You can ask to see, correct, delete or export your data, to object to how we use it, or to withdraw consent at any time.
            Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will reply within one month. If you are unhappy, you can
            complain to the UK Information Commissioner&rsquo;s Office at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">ico.org.uk</a>.
          </p>
        </section>

        <section aria-labelledby="cookies">
          <h2 id="cookies">Cookies and browser storage</h2>
          <p>
            Our own code sets no cookies. It uses your browser&rsquo;s local and session storage, which the law treats like cookies.
            Essential items need no consent. We ask for consent for optional third-party content only.
          </p>
          <div className={styles.tableWrap} role="region" aria-label="Cookies and storage table" tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr><th scope="col">Name</th><th scope="col">Purpose</th><th scope="col">Type</th><th scope="col">Where</th><th scope="col">Duration</th></tr>
              </thead>
              <tbody>
                {STORAGE.map((r) => (
                  <tr key={r.name}>
                    <th scope="row"><code>{r.name}</code></th>
                    <td>{r.purpose}</td>
                    <td>{r.type}</td>
                    <td>{r.where}</td>
                    <td>{r.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.choice}>
            Your current choice: <strong>{consent === 'all' ? 'Accept all' : consent === 'essential' ? 'Essential only' : 'not chosen yet'}</strong>.{' '}
            <button type="button" className={styles.linkBtn} onClick={openConsentSettings}>Change cookie settings</button>
          </p>
        </section>

        <section aria-labelledby="third">
          <h2 id="third">Third parties</h2>
          <ul>
            <li><strong>YouTube (optional).</strong> News cards can show a highlights video. It uses YouTube&rsquo;s privacy-enhanced domain (youtube-nocookie.com) and only loads if you chose &ldquo;Accept all&rdquo; and press the button to load it. YouTube (Google) may then set cookies or similar storage and receive your IP address. See <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google&rsquo;s privacy policy</a>.</li>
            <li><strong>Google Fonts.</strong> The site&rsquo;s fonts load from Google, which receives your IP address and browser details when a page loads. No cookies are set for this.</li>
            <li><strong>Discord (login).</strong> Logging in sends you to Discord, which handles your password. See <a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer">Discord&rsquo;s privacy policy</a>.</li>
            <li><strong>Links out.</strong> Twitch, Discord, Ko-fi, Instagram, X, TikTok, Dotabuff and OpenDota are plain links. They only receive data about you once you click through and use their own policies.</li>
          </ul>
        </section>

        <section aria-labelledby="changes">
          <h2 id="changes">Changes</h2>
          <p>If we change this page we will update the date at the top.</p>
        </section>
      </div>
    </div>
  );
}
