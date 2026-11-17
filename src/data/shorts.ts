/**
 * Season 1 YouTube Shorts for the home "Clips from Season 1" section.
 * Thumbnails are self-hosted (public/assets/clips/<id>.webp) so nothing loads from YouTube until a visitor presses play.
 * To add one: put its id + title here and a 360x640 webp thumbnail in public/assets/clips/.
 */
export interface Short { id: string; title: string }

export const SHORTS: Short[] = [
  { id: 'j8jW_zzbGvA', title: 'Speak of the Devil!' },
  { id: 'YpPelYtluTo', title: 'Base relocate in the grand finals!' },
  { id: 'DC8OcacunTE', title: 'Upper division finals, live!' },
  { id: 'xTEx86wNlzM', title: 'Join our Dota 2 community' },
  { id: 'IZhkDV6Klfw', title: 'Grand Finals week!' },
  { id: 'EoWJeiGTw04', title: 'Taking Torm is always a risk!' },
  { id: 'bV_qnNvUJsQ', title: 'Chutney claim First Blood in game 2' },
  { id: 'L61AK_jTnfA', title: 'The BEAR arrives for Chutney!' },
  { id: '3d6eVOgqQ3g', title: 'Great early fighting from Golden Retrievers!' },
  { id: 'g4YGq_afBn4', title: 'A bloodbath after first blood in Game 3!' },
  { id: '26td6Rer59A', title: 'Truers vs Bortymites' },
  { id: 'rAMZ_BnuN60', title: 'Crazy first fight in Game 1' },
  { id: 'Y-2pjmenjTU', title: '5 stuns, great tower defence' },
  { id: '1Oek3RgkoyY', title: 'Disaster for the Heralds in Game 2 vs Catwice!' },
  { id: 'AaMIbZEEfw8', title: 'Techies vs Lifestealer 1v1' },
];

export const shortThumb = (id: string) => `/assets/clips/${id}.webp`;
export const shortUrl = (id: string) => `https://www.youtube.com/shorts/${encodeURIComponent(id)}`;
