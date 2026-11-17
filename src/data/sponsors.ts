/** Sponsors and partners: the home "Supported by" banner + cards, and the header icons. */
export interface Sponsor {
  name: string;
  /** Website. null = no site yet (shown without a link). */
  href: string | null;
  /** Banner logo (light-on-dark art; it sits on a dark plate). */
  img: string;
  /** Small header icon (falls back to img). */
  icon?: string;
  /** Tall logos need a taller slot in the banner. */
  tall?: boolean;
  text: string;
  /** Extra link shown on the card, e.g. a Discord invite. */
  extra?: { label: string; href: string };
}

export const SPONSORS: Sponsor[] = [
  {
    name: 'Imprint Esports',
    href: 'https://imprint.gg/',
    img: '/assets/sponsoredimages/ImprintEsports/img1.png',
    icon: '/assets/sponsoredimages/ImprintEsports/img3.png',
    text: 'Match data, player and team ratings, and leaderboards for our website, Discord and streams.',
  },
  {
    name: 'Dota 2 Ireland',
    href: 'https://dota2ireland.com/',
    img: '/assets/sponsoredimages/IDL/idlbanner.png',
    icon: '/assets/sponsoredimages/IDL/logo.png',
    text: 'The home of Irish Dota. Runs the Irish Dota League, now in its 7th season.',
  },
  {
    name: 'Duck It Games',
    href: 'https://duckitgames.co.uk/',
    img: '/assets/sponsoredimages/DuckIt/logo.webp',
    icon: '/assets/sponsoredimages/DuckIt/icon.webp',
    tall: true,
    text: 'A micro indie studio in the UK, run by our Admin Lazy (Herald Royale with Cheese). Their goal is to empower everyone to make games while creating their own. They pride themselves on equality and building exciting new experiences.',
    extra: { label: 'Duck It Games Discord', href: 'https://discord.gg/PVj5Db6P2M' },
  },
  {
    name: 'FriGuys',
    // Their event site is not hosted yet: add the URL here once it is.
    href: null,
    img: '/assets/sponsoredimages/FriGuys/logo.webp',
    text: 'A community founded by three mediocre humans turned pretty awful streamers, one of them our caster Falcus. They play everything from friend slop and shooters to Dota 2, and even run a sim racing team.',
  },
];
