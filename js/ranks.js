// Single source of truth for MMR → medal conversion, shared by register/profile pages.
export const RANKS = [
  { icon: 'assets/ranks/herald.png',   label: 'Herald',   min: 1,    max: 769 },
  { icon: 'assets/ranks/guardian.png', label: 'Guardian', min: 770,  max: 1539 },
  { icon: 'assets/ranks/crusader.png', label: 'Crusader', min: 1540, max: 2309 },
  { icon: 'assets/ranks/archon.png',   label: 'Archon',   min: 2310, max: 3079 },
  { icon: 'assets/ranks/legend.png',   label: 'Legend',   min: 3080, max: 3849 },
  { icon: 'assets/ranks/ancient.png',  label: 'Ancient',  min: 3850, max: 4619 },
  { icon: 'assets/ranks/divine.png',   label: 'Divine',   min: 4620, max: 5619 },
  { icon: 'assets/ranks/immortal.png', label: 'Immortal', min: 5620, max: Infinity }
];

export function mmrToRank(mmr) {
  const n = Number(mmr);
  if (!Number.isFinite(n) || n < 1) return null;
  return RANKS.find(r => n >= r.min && n <= r.max) || RANKS[RANKS.length - 1];
}

export function rankIconFor(label) {
  return RANKS.find(r => r.label === label)?.icon || '';
}
