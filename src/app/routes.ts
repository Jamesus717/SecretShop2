import { lazy, type ComponentType } from 'react';
import HomePage from '../pages/Home/HomePage';

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

export interface RouteDef {
  path: string;
  Component: ComponentType;
}

/** Old URLs are kept: Discord, the bot and bookmarks link to them. */
export const routeTable: RouteDef[] = [
  { path: '/', Component: HomePage },
  { path: '/team-info', Component: TeamInfoPage },
  { path: '/playoffs', Component: PlayoffsPage },
  { path: '/groupstage', Component: GroupStagePage },
  { path: '/standings', Component: StandingsPage },
  { path: '/news', Component: NewsPage },
  { path: '/rules', Component: RulesPage },
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
