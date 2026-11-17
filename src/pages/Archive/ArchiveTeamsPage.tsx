import TeamInfoPage from '../TeamInfo/TeamInfoPage';
import ArchiveShell from './ArchiveShell';

/** Rosters: the Team Info page embedded in the archive frame. `?team=` still opens a roster. */
export default function ArchiveTeamsPage() {
  return (
    <ArchiveShell tab="teams" heading="Teams" lede="Every squad from SecretLeague I, with rosters, positions and ranks.">
      <TeamInfoPage embedded />
    </ArchiveShell>
  );
}
