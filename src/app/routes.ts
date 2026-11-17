import { lazy, type ComponentType } from 'react';
import HomePage from '../pages/Home/HomePage';
import { SEASON_PAGES_VISIBLE } from '../config';

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
const DeadlockPage = lazy(() => import('../pages/Deadlock/DeadlockPage'));
const MinecraftPage = lazy(() => import('../pages/Minecraft/MinecraftPage'));
const GalleryPage = lazy(() => import('../pages/Minecraft/GalleryPage'));

/** Season pages are hidden between seasons (see SEASON_PAGES_VISIBLE in config): they redirect instead. */
const season = (C: ComponentType): Pick<RouteDef, 'Component' | 'redirect'> =>
  (SEASON_PAGES_VISIBLE ? { Component: C } : { redirect: '/dota/secretleague' });

export interface RouteDef {
  path: string;
  /** Page to render, or */
  Component?: ComponentType;
  /** a path to redirect to (query + hash kept). Redirects render outside Layout: a Navigate inside its AnimatePresence stalls. */
  redirect?: string;
}

/** Old URLs are kept: Discord, the bot and bookmarks link to them. */
export const routeTable: RouteDef[] = [
  { path: '/', Component: HomePage },
  { path: '/dota', Component: DotaPage },
  { path: '/dota/secretleague', Component: RulesPage },
  { path: '/dota/lazy-league', Component: LazyLeaguePage },
  { path: '/deadlock', Component: DeadlockPage },
  { path: '/minecraft', Component: MinecraftPage },
  { path: '/minecraft/gallery', Component: GalleryPage },
  { path: '/news', Component: NewsPage },
  { path: '/rules', redirect: '/dota/secretleague' },
  { path: '/team-info', ...season(TeamInfoPage) },
  { path: '/playoffs', ...season(PlayoffsPage) },
  { path: '/groupstage', ...season(GroupStagePage) },
  { path: '/standings', ...season(StandingsPage) },
  { path: '/profile', Component: ProfilePage },
  { path: '/register', Component: RegisterPage },
  { path: '/balancer', Component: BalancerPage },
  { path: '/clips', Component: ClipsPage },
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
