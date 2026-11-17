import { Link } from 'react-router-dom';
import Button from '../../components/Button/Button';
import Countdown from '../../components/Countdown/Countdown';
import InfoPage from '../../components/InfoPage/InfoPage';
import { LAZY_LEAGUE_SECTIONS } from './lazyLeagueContent';
import { DISCORD_URL, lazyLeagueStartDate } from '../../config';

export default function LazyLeaguePage() {
  const start = lazyLeagueStartDate();
  return (
    <InfoPage
      eyebrow="Dota 2 · Coming soon"
      title="Lazy League"
      lede={start ? <Countdown target={start} /> : 'A real Dota 2 league where fans run the economy. Date to be announced.'}
      sections={LAZY_LEAGUE_SECTIONS}
      toc
    >
      <p style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginTop: 36 }}>
        <Button href={DISCORD_URL}>Join the Discord</Button>
        <Link to="/dota/secretleague">SecretLeague Dota rules</Link>
      </p>
    </InfoPage>
  );
}
