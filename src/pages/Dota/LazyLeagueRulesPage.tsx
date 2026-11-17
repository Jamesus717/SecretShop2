import { Link } from 'react-router-dom';
import Button from '../../components/Button/Button';
import InfoPage from '../../components/InfoPage/InfoPage';
import { LAZY_LEAGUE_SECTIONS } from './lazyLeagueContent';
import { DISCORD_URL } from '../../config';

export default function LazyLeagueRulesPage() {
  return (
    <InfoPage
      eyebrow="Lazy League · Full rulebook"
      title="The full rules"
      lede={<>Every detail, for when you want it. New here? <Link to="/dota/lazy-league">Read the quick version</Link>.</>}
      sections={LAZY_LEAGUE_SECTIONS}
      toc
    >
      <p style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginTop: 36 }}>
        <Button href={DISCORD_URL}>Join the Discord</Button>
        <Link to="/dota/lazy-league">Back to the quick version</Link>
      </p>
    </InfoPage>
  );
}
