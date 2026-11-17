import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/authContext';
import { applyTheme, getTheme, type Theme } from '../lib/theme';
import styles from './Header.module.css';

interface NavItem { to: string; label: string; end?: boolean; children?: NavItem[] }

/** Top-level categories. Season pages (Team Info, Playoffs, Standings) are reached from SecretLeague Dota when visible. */
const NAV: NavItem[] = [
  { to: '/dota', label: 'Dota 2', children: [
    { to: '/dota/secretleague', label: 'SecretLeague Dota' },
    { to: '/dota/lazy-league', label: 'Lazy League' },
  ] },
  { to: '/deadlock', label: 'Deadlock' },
  { to: '/minecraft', label: 'Minecraft', children: [
    { to: '/minecraft', label: 'Rules & Info', end: true },
    { to: '/minecraft/gallery', label: 'Gallery' },
  ] },
  { to: '/news', label: 'News' },
];

const SPONSORS = [
  { name: 'Imprint Esports', href: 'https://imprint.gg/', img: '/assets/sponsoredimages/ImprintEsports/img3.png' },
  { name: 'Dota 2 Ireland', href: 'https://dota2ireland.com/', img: '/assets/sponsoredimages/IDL/logo.png' },
];

const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16">
    <path fill="currentColor" d="M20.3 4.4a19.7 19.7 0 0 0-4.8-1.5l-.2.4a18.3 18.3 0 0 1 3.6 1.1c-1.6-.8-3.3-1.3-5.1-1.6a17.8 17.8 0 0 0-3.6 0c-1.8.3-3.5.8-5.1 1.6a18.3 18.3 0 0 1 3.6-1.1l-.2-.4a19.7 19.7 0 0 0-4.8 1.5A19.4 19.4 0 0 0 1.8 17a19.8 19.8 0 0 0 6.1 3l.7-1.2a12.2 12.2 0 0 1-1.9-.9l.5-.4c1.1.5 2.3.9 3.5 1.1a16 16 0 0 0 2.6 0c1.2-.2 2.4-.6 3.5-1.1l.5.4c-.6.4-1.2.7-1.9.9l.7 1.2a19.8 19.8 0 0 0 6.1-3 19.4 19.4 0 0 0-1.6-12.6ZM9.3 14.8c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm5.4 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
  </svg>
);

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className={styles.iconBtn}
      aria-label={`Switch to ${next} theme`}
      onClick={() => { applyTheme(next); setTheme(next); }}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  );
}

function AuthMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user, profile, isAdmin, loading, signIn, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (loading) return <span className={styles.authPlaceholder} aria-hidden="true" />;

  if (!user || !profile) {
    return (
      <button type="button" className={styles.login} onClick={() => void signIn()}>
        <DiscordIcon /> Login with Discord
      </button>
    );
  }

  const go = () => { setOpen(false); onNavigate?.(); };
  return (
    <div className={styles.account} ref={ref}>
      <button type="button" className={styles.accountBtn} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        {profile.avatarUrl
          ? <img src={profile.avatarUrl} alt="" className={styles.avatar} referrerPolicy="no-referrer" />
          : <span className={styles.avatar} aria-hidden="true">{profile.name.slice(0, 1).toUpperCase()}</span>}
        <span className={styles.accountName}>{profile.name}</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <Link role="menuitem" to="/profile" onClick={go}>Profile</Link>
          {isAdmin && <Link role="menuitem" to="/clips" onClick={go}>Clips</Link>}
          {isAdmin && <Link role="menuitem" to="/balancer" onClick={go}>Balancer</Link>}
          <button role="menuitem" type="button" onClick={() => { go(); void signOut(); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const linkClass = ({ isActive }: { isActive: boolean }) => `${styles.link} ${isActive ? styles.active : ''}`;

  return (
    <header className={`${styles.header} ${scrolled || menuOpen ? styles.solid : ''}`}>
      <div className={`container ${styles.bar}`}>
        <Link to="/" className={styles.brand} aria-label="SecretLeague home">
          <img src="/assets/logo.png" alt="" width={36} height={36} className={styles.logo} />
          <span className={styles.wordmark}>SecretLeague</span>
        </Link>

        <nav className={styles.nav} aria-label="Main">
          {NAV.map((l) => (
            <div key={l.to} className={styles.item}>
              <NavLink to={l.to} className={linkClass} aria-haspopup={l.children ? 'true' : undefined}>
                {l.label}
                {l.children && <span className={styles.caret} aria-hidden="true" />}
              </NavLink>
              {l.children && (
                <div className={styles.drop}>
                  {l.children.map((c) => (
                    <NavLink key={c.to + c.label} to={c.to} end={c.end} className={({ isActive }) => `${styles.dropLink} ${isActive ? styles.dropOn : ''}`}>{c.label}</NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className={styles.right}>
          <div className={styles.sponsors}>
            {SPONSORS.map((s) => (
              <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name}>
                <img src={s.img} alt={s.name} />
              </a>
            ))}
          </div>
          <ThemeToggle />
          <div className={styles.authDesktop}><AuthMenu /></div>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.burger}`}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen ? <path d="M5 5l14 14M19 5L5 19" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="mobile-menu" className={styles.sheet}>
          <nav aria-label="Mobile">
            {NAV.map((l) => (
              <div key={l.to}>
                <NavLink to={l.to} end={!!l.children} className={({ isActive }) => `${styles.sheetLink} ${isActive ? styles.active : ''}`}>{l.label}</NavLink>
                {l.children?.map((c) => (
                  <NavLink key={c.to + c.label} to={c.to} end={c.end} className={({ isActive }) => `${styles.sheetSub} ${isActive ? styles.active : ''}`}>{c.label}</NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className={styles.sheetAuth}><AuthMenu onNavigate={() => setMenuOpen(false)} /></div>
          <div className={styles.sheetSponsors}>
            {SPONSORS.map((s) => (
              <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name}>
                <img src={s.img} alt={s.name} />
              </a>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
