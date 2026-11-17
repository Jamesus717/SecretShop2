import { Link } from 'react-router-dom';
import Button from '../../components/Button/Button';
import Countdown from '../../components/Countdown/Countdown';
import InfoPage from '../../components/InfoPage/InfoPage';
import type { RuleSection } from '../Rules/content';
import { DISCORD_URL, lazyLeagueStartDate } from '../../config';

// Fill these in as details are confirmed.
const SECTIONS: RuleSection[] = [
  { id: 'about', title: 'About Lazy League', paras: [['Lazy League is our next Dota 2 tournament. Full details are on the way.']] },
  { id: 'format', title: 'Format', paras: [['To be announced.']] },
  { id: 'rules', title: 'Rules', paras: [['Rules will be posted here before sign-ups open.']] },
];

export default function LazyLeaguePage() {
  const start = lazyLeagueStartDate();
  return (
    <InfoPage
      eyebrow="Dota 2 · Coming soon"
      title="Lazy League"
      lede={start ? <Countdown target={start} /> : 'Date to be announced. Join the Discord to hear first.'}
      sections={SECTIONS}
    >
      <p style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginTop: 36 }}>
        <Button href={DISCORD_URL}>Join the Discord</Button>
        <Link to="/dota/secretleague">SecretLeague Dota rules</Link>
      </p>
    </InfoPage>
  );
}
