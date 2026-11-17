import Button from '../../components/Button/Button';
import InfoPage from '../../components/InfoPage/InfoPage';
import { DISCORD_URL } from '../../config';

export default function DeadlockPage() {
  return (
    <InfoPage eyebrow="Deadlock" title="Coming soon" lede="Deadlock games and events are on the way. Watch the Discord for news.">
      <Button href={DISCORD_URL}>Join the Discord</Button>
    </InfoPage>
  );
}
