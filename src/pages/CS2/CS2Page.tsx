import Button from '../../components/Button/Button';
import InfoPage from '../../components/InfoPage/InfoPage';
import { DISCORD_URL } from '../../config';

export default function CS2Page() {
  return (
    <InfoPage eyebrow="Counter-Strike 2" title="Coming soon" lede="CS2 games and events are on the way. Watch the Discord for news.">
      <Button href={DISCORD_URL}>Join the Discord</Button>
    </InfoPage>
  );
}
