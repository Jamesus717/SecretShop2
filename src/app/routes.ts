import { lazy, type ComponentType } from 'react';
import HomePage from '../pages/Home/HomePage';
import { SEASON_PAGES_VISIBLE } from '../config';
import { ARCHIVE_BASE, SEASON_TARGETS } from '../lib/archive/paths';

const TeamInfoPage = lazy(() => import('../pages/TeamInfo/TeamInfoPage'));
const PlayoffsPage = lazy(() => import('../pages/Playoffs/PlayoffsPage'));
const GroupStagePage = lazy(() => import('../pages/GroupStage/GroupStagePage'));
const StandingsPage = lazy(() => import('../pages/Standings/StandingsPage'));
const NewsPage = lazy(() => import('../pages/News/NewsPage'));
const RulesPage = lazy(() => import('../pages/Rules/RulesPage'));
const ProfilePage = lazy(() => import('../pages/Profile/ProfilePage'));
const RegisterPage = lazy(() => import('../pages/Register/RegisterPage'));
const BalancerPage = lazy(() => import('../pages/Balancer/BalancerPage'));
const ClipsPage = lazy(() => import('../pages/Clips/ClipsPage'));
const DotaPage = lazy(() => import('../pages/Dota/DotaPage'));
const LazyLeaguePage = lazy(() => import('../pages/Dota/LazyLeaguePage'));
const LazyLeagueRulesPage = lazy(() => import('../pages/Dota/LazyLeagueRulesPage'));
const DeadlockPage = lazy(() => import('../pages/Deadlock/DeadlockPage'));
const CS2Page = lazy(() => import('../pages/CS2/CS2Page'));
const PrivacyPage = lazy(() => import('../pages/Privacy/PrivacyPage'));
const MinecraftPage = lazy(() => import('../pages/Minecraft/MinecraftPage'));
const ArchiveOverviewPage = lazy(() => import('../pages/Archive/ArchiveOverviewPage'));
const ArchiveGamesPage = lazy(() => import('../pages/Archive/ArchiveGamesPage'));
const ArchiveTeamsPage = lazy(() => import('../pages/Archive/ArchiveTeamsPage'));
const ArchiveStatsPage = lazy(() => import('../pages/Archive/ArchiveStatsPage'));
const ArchiveHighlightsPage = lazy(() => import('../pages/Archive/ArchiveHighlightsPage'));
const GalleryPage = lazy(() => import('../pages/Minecraft/GalleryPage'));

/**
 * Season pages are hidden between seasons (see SEASON_PAGES_VISIBLE in config): they redirect into the
 * matching tab of the Season 1 archive instead (query and hash are kept, so ?team= still opens a roster).
 */
const season = (C: ComponentType, archiveTab: string): Pick<RouteDef, 'Component' | 'redirect'> =>
  (SEASON_PAGES_VISIBLE ? { Component: C } : { redirect: archiveTab });

export interface RouteDef {
  path: string;
  /** Page to render, or */
  Component?: ComponentType;
  /** a path to redirect to (query + hash kept). Redirects render outside Layout: a Navigate inside its AnimatePresence stalls. */
  redirect?: string;
  /** Browser tab / share title, before " | SecretLeague". Home uses the site title. */
  title?: string;
}

/** Old URLs are kept: Discord, the bot and bookmarks link to them. */
export const routeTable: RouteDef[] = [
  { path: '/', Component: HomePage },
  { path: '/dota', Component: DotaPage, title: 'Dota 2' },
  { path: '/dota/secretleague', Component: RulesPage, title: 'SecretLeague Dota: Rules & Info' },
  { path: ARCHIVE_BASE, Component: ArchiveOverviewPage, title: 'Season 1 archive' },
  { path: `${ARCHIVE_BASE}/games`, Component: ArchiveGamesPage, title: 'Season 1 games' },
  { path: `${ARCHIVE_BASE}/teams`, Component: ArchiveTeamsPage, title: 'Season 1 teams' },
  { path: `${ARCHIVE_BASE}/stats`, Component: ArchiveStatsPage, title: 'Season 1 stats' },
  { path: `${ARCHIVE_BASE}/highlights`, Component: ArchiveHighlightsPage, title: 'Season 1 highlights' },
  { path: '/dota/lazy-league', Component: LazyLeaguePage, title: 'Lazy League' },
  { path: '/dota/lazy-league/rules', Component: LazyLeagueRulesPage, title: 'Lazy League: full rulebook' },
  { path: '/deadlock', Component: DeadlockPage, title: 'Deadlock' },
  { path: '/cs2', Component: CS2Page, title: 'CS2' },
  { path: '/minecraft', Component: MinecraftPage, title: 'Minecraft server' },
  { path: '/minecraft/gallery', Component: GalleryPage, title: 'Minecraft gallery' },
  { path: '/news', Component: NewsPage, title: 'News' },
  { path: '/rules', redirect: '/dota/secretleague' },
  { path: '/team-info', ...season(TeamInfoPage, SEASON_TARGETS.teamInfo), title: 'Team Info' },
  { path: '/playoffs', ...season(PlayoffsPage, SEASON_TARGETS.playoffs), title: 'Playoffs' },
  { path: '/groupstage', ...season(GroupStagePage, SEASON_TARGETS.games), title: 'Group Stage' },
  { path: '/standings', ...season(StandingsPage, SEASON_TARGETS.standings), title: 'Standings' },
  { path: '/profile', Component: ProfilePage, title: 'Profile' },
  { path: '/register', Component: RegisterPage, title: 'Register' },
  { path: '/balancer', Component: BalancerPage, title: 'Team balancer' },
  { path: '/clips', Component: ClipsPage, title: 'Clips' },
  { path: '/privacy', Component: PrivacyPage, title: 'Privacy & cookies' },
];

/** Old `*.html` forms -> clean path. */
export function cleanPathFor(pathname: string): string | null {
  const m = pathname.match(/^\/(.+)\.html$/i);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  if (slug === 'index') return '/';
  const hit = routeTable.find((r) => r.path === `/${slug}`);
  return hit ? hit.path : null;
}
