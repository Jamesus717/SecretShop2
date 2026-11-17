import { SEASON_PAGES_VISIBLE } from '../../config';

/** The self-contained SecretLeague I archive. Always available, whatever SEASON_PAGES_VISIBLE says. */
export const ARCHIVE_BASE = '/dota/secretleague/season-1';

export type ArchiveTab = 'overview' | 'games' | 'teams' | 'stats' | 'highlights';

export const ARCHIVE_TABS: { id: ArchiveTab; label: string; path: string }[] = [
  { id: 'overview', label: 'Overview', path: ARCHIVE_BASE },
  { id: 'games', label: 'Games', path: `${ARCHIVE_BASE}/games` },
  { id: 'teams', label: 'Teams', path: `${ARCHIVE_BASE}/teams` },
  { id: 'stats', label: 'Stats', path: `${ARCHIVE_BASE}/stats` },
  { id: 'highlights', label: 'Highlights', path: `${ARCHIVE_BASE}/highlights` },
];

/** Where each old season page lives right now: the live page when visible, else its archive tab. */
export const SEASON_TARGETS = {
  standings: SEASON_PAGES_VISIBLE ? '/standings' : `${ARCHIVE_BASE}/stats`,
  teamInfo: SEASON_PAGES_VISIBLE ? '/team-info' : `${ARCHIVE_BASE}/teams`,
  games: SEASON_PAGES_VISIBLE ? '/groupstage' : `${ARCHIVE_BASE}/games`,
  playoffs: SEASON_PAGES_VISIBLE ? '/playoffs' : `${ARCHIVE_BASE}/games`,
} as const;
