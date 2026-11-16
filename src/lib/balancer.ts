// Pure logic of the admin "BortyGPT" team balancer, ported 1:1 from legacy/js/balancer.js.
// The old medal-rank system is deliberate. No React, no DOM.

export const RANKS = ['Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal 6k', 'Immortal 7k', 'Immortal 8k+', 'OP'] as const;
export type Rank = (typeof RANKS)[number];

export const POSITION_OPTIONS = [
  { value: '1', label: 'Pos 1' },
  { value: '2', label: 'Pos 2' },
  { value: '3', label: 'Pos 3' },
  { value: '4', label: 'Pos 4' },
  { value: '5', label: 'Pos 5' },
  { value: 'fill', label: 'Fill' },
] as const;

export const STARTER_NAMES = [
  'RoshanRush', 'BlinkCaller', 'AegisKeeper', 'SmokeGanker', 'LotusWarden', 'AncientEcho',
  'CreepStacker', 'RuneSniper', 'WardHunter', 'FissureKing', 'RavageReady', 'BlackKing',
  'RadiantSoul', 'DireHowl', 'MantaMind', 'HexThread', 'SplitPusher', 'DustCarrier',
];

export const RANK_MMR: Record<string, number> = {
  Herald: 400, Guardian: 1050, Crusader: 1750, Archon: 2450, Legend: 3150, Ancient: 3850,
  Divine: 4750, 'Immortal 6k': 6000, 'Immortal 7k': 7000, 'Immortal 8k+': 8500, OP: 10000,
};

export const MAX_PLAYERS = 10;
export const MAX_MMR_DIFF = 2000;

export interface PlayerInput { id: number; name: string; rank: string; pos1: string; pos2: string }
export interface Player extends PlayerInput { mmr: number }
export interface Options { mmr: boolean; pos: boolean; variance: boolean }
export interface BuildResult {
  teamA: Player[];
  teamB: Player[];
  parsed: { teamA: string[]; teamB: string[]; reasoning: string };
}
export type Rng = () => number;

export const mmrOf = (p: Pick<PlayerInput, 'rank'>): number => RANK_MMR[p.rank] || 400;

export function shuffleInPlace<T>(arr: T[], rng: Rng = Math.random): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function sampleUniqueNames(count: number, rng: Rng = Math.random): string[] {
  const pool = [...STARTER_NAMES];
  shuffleInPlace(pool, rng);
  return pool.slice(0, Math.min(count, pool.length));
}

const randomFrom = <T,>(arr: readonly T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)];

/** Ten random starter players, as the legacy page seeds on load. */
export function seedStarterPlayers(rng: Rng = Math.random): PlayerInput[] {
  return sampleUniqueNames(10, rng).map((name, i) => {
    const rank = randomFrom(RANKS, rng);
    const pos1 = randomFrom(POSITION_OPTIONS, rng).value as string;
    let pos2 = randomFrom(POSITION_OPTIONS, rng).value as string;
    if (pos2 === pos1) pos2 = ''; // secondary never equals primary
    return { id: i + 1, name, rank, pos1, pos2 };
  });
}

/** First problem that stops a balance run, or null. Same order and wording as legacy. */
export function validatePlayers(players: PlayerInput[]): string | null {
  if (players.length < 2) return 'Add at least 2 players to balance.';
  if (players.some((p) => !p.name.trim())) return 'Fill in all player names before balancing.';
  if (players.some((p) => !p.rank)) return 'Select a rank for every player.';
  return null;
}

export function buildTeams(players: PlayerInput[], options: Options, rng: Rng = Math.random): BuildResult {
  const list: Player[] = players.map((p) => ({ ...p, name: p.name.trim(), mmr: mmrOf(p) }));
  list.sort((a, b) => b.mmr - a.mmr);

  if (options.variance) {
    const buckets: Player[][] = [];
    for (let i = 0; i < list.length; i += 4) buckets.push(list.slice(i, i + 4));
    buckets.forEach((b) => shuffleInPlace(b, rng));
    list.length = 0;
    buckets.forEach((b) => list.push(...b));
  }

  const teamA: Player[] = [];
  const teamB: Player[] = [];
  const posA = new Map<string, number>();
  const posB = new Map<string, number>();
  let sumA = 0;
  let sumB = 0;
  const teamASize = Math.min(5, Math.ceil(list.length / 2));
  const teamBSize = Math.min(5, list.length - teamASize);

  const posPenalty = (teamMap: Map<string, number>, pos1: string, pos2: string): number => {
    if (!options.pos) return 0;
    let penalty = 0;
    if (pos1 && pos1 !== 'fill') penalty += (teamMap.get(pos1) || 0) * 60;
    if (pos2 && pos2 !== 'fill') penalty += (teamMap.get(pos2) || 0) * 20;
    return penalty;
  };

  list.forEach((p) => {
    const scoreA = sumA + p.mmr + posPenalty(posA, p.pos1, p.pos2);
    const scoreB = sumB + p.mmr + posPenalty(posB, p.pos1, p.pos2);
    let chooseA = scoreA <= scoreB;
    if (teamA.length >= teamASize) chooseA = false;
    else if (teamB.length >= teamBSize) chooseA = true;
    if (chooseA) {
      teamA.push(p);
      sumA += p.mmr;
      if (p.pos1 && p.pos1 !== 'fill') posA.set(p.pos1, (posA.get(p.pos1) || 0) + 1);
    } else {
      teamB.push(p);
      sumB += p.mmr;
      if (p.pos1 && p.pos1 !== 'fill') posB.set(p.pos1, (posB.get(p.pos1) || 0) + 1);
    }
  });

  return {
    teamA,
    teamB,
    parsed: {
      teamA: teamA.map((p) => p.name),
      teamB: teamB.map((p) => p.name),
      reasoning: options.variance ? 'Balanced using MMR with slight variance.' : 'Balanced using MMR.',
    },
  };
}

export function avgMmr(team: Pick<Player, 'mmr'>[]): number {
  const vals = team.map((p) => p.mmr || 0);
  return Math.round(vals.reduce((a, b) => a + b, 0) / (vals.length || 1));
}

export function positionLabel(pos1: string, pos2: string): string {
  const labels: string[] = [];
  if (pos1 === 'fill') labels.push('Fill');
  else if (pos1) labels.push(`Pos ${pos1}`);
  if (pos2 === 'fill') labels.push('Fill');
  else if (pos2) labels.push(`Pos ${pos2}`);
  return labels.length ? labels.join(' / ') : 'Flex';
}

export function positionBadgeLabel(pos1: string, pos2: string): string {
  const labels: string[] = [];
  if (pos1 === 'fill') labels.push('Fill');
  else if (pos1) labels.push(pos1);
  if (pos2 === 'fill') labels.push('Fill');
  else if (pos2) labels.push(pos2);
  return labels.length ? labels.join('/') : '?';
}

export function coverageText(team: Pick<Player, 'pos1' | 'pos2'>[]): string {
  const covered = new Set<string>();
  let fillCount = 0;
  team.forEach((player) => {
    if (player.pos1 === 'fill') fillCount++;
    else if (player.pos1) covered.add(String(player.pos1));
    if (player.pos2 === 'fill') fillCount++;
    else if (player.pos2) covered.add(String(player.pos2));
  });
  const all = ['1', '2', '3', '4', '5'];
  const coveredList = all.filter((p) => covered.has(p));
  const missingList = all.filter((p) => !covered.has(p));
  const fillText = fillCount ? ` · +${fillCount} Fill` : '';
  return `Roles: ${coveredList.length ? coveredList.join(', ') : 'None'} ✓ · Missing: ${missingList.length ? missingList.join(', ') : 'None'}${fillText}`;
}

export type RankKey = 'herald' | 'guardian' | 'crusader' | 'archon' | 'legend' | 'ancient' | 'divine' | 'immortal' | 'op';
export function rankKey(rank: string): RankKey {
  const keys: [string, RankKey][] = [
    ['Herald', 'herald'], ['Guardian', 'guardian'], ['Crusader', 'crusader'], ['Archon', 'archon'],
    ['Legend', 'legend'], ['Ancient', 'ancient'], ['Divine', 'divine'], ['Immortal', 'immortal'], ['OP', 'op'],
  ];
  return keys.find(([prefix]) => rank.startsWith(prefix))?.[1] ?? 'immortal';
}

export interface Balance { avgA: number; avgB: number; diff: number; score: number; needlePct: number; desc: string }
export function balanceSummary(teamA: Player[], teamB: Player[], reasoning = ''): Balance {
  const avgA = avgMmr(teamA);
  const avgB = avgMmr(teamB);
  const diff = Math.abs(avgA - avgB);
  const score = Math.max(0, Math.round((1 - diff / MAX_MMR_DIFF) * 100));
  const needlePct = Math.min(95, Math.max(5, 50 + ((avgA - avgB) / (MAX_MMR_DIFF * 2)) * 100));
  let desc: string;
  if (score >= 90) desc = 'Perfectly balanced.';
  else if (score >= 75) desc = 'Strong balance.';
  else if (score >= 55) desc = 'Decent balance.';
  else desc = 'Uneven — consider re-rolling.';
  return { avgA, avgB, diff, score, needlePct, desc: desc + (reasoning ? ' · ' + reasoning : '') };
}

export function copyText(teamA: string[], teamB: string[], reasoning: string): string {
  const fmt = (names: string[]) => names.map((n, i) => `  ${i + 1}. ${n}`).join('\n');
  return `⚔️ SecretLeague Draft ⚔️\n\n🌿 Radiant:\n${fmt(teamA)}\n\n🔥 Dire:\n${fmt(teamB)}\n\n${reasoning || ''}`;
}
