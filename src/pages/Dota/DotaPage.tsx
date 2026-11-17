import { Link } from 'react-router-dom';
import InfoPage from '../../components/InfoPage/InfoPage';
import cards from '../../components/InfoPage/Cards.module.css';

const TOURNAMENTS = [
  {
    to: '/dota/secretleague',
    name: 'SecretLeague Dota',
    tag: 'Season I complete',
    muted: true,
    text: 'Our yearly Dota 2 tournament, open to every rank. Three divisions, group stage then double-elimination playoffs.',
  },
  {
    to: '/dota/lazy-league',
    name: 'Lazy League',
    tag: 'Coming soon',
    muted: false,
    text: 'Our next Dota 2 tournament. Date and format to be announced.',
  },
];

export default function DotaPage() {
  return (
    <InfoPage eyebrow="Dota 2" title="Tournaments" lede="Pick a tournament for its rules and info.">
      <ul className={cards.grid}>
        {TOURNAMENTS.map((t) => (
          <li key={t.to}>
            <Link to={t.to} className={cards.card}>
              <span className={t.muted ? cards.tagMuted : cards.tag}>{t.tag}</span>
              <h2 className={cards.name}>{t.name}</h2>
              <p className={cards.text}>{t.text}</p>
              <span className={cards.go}>Rules &amp; info →</span>
            </Link>
          </li>
        ))}
      </ul>
    </InfoPage>
  );
}
