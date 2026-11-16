import type { ComputedHeroes, ComputedHeroRec, HeroesPayload, HeroRow, ImprintHero } from './types';

/** Fuzzy hero-name key: letters and digits only, lowercased. */
export function hkey(s: string | null | undefined): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const iconOf = (h: ImprintHero) => h.icon_src || h.static_portrait_src || null;

/**
 * Whole-season hero list. With a complete computed_heroes it is that plus playoff games, with
 * Imprint /heroes supplying bans. Otherwise it is Imprint's /heroes numbers as-is.
 */
export function buildHeroList(
  heroesPayload: HeroesPayload | null | undefined,
  computedHeroes: ComputedHeroes | null | undefined,
  playoffHeroes: HeroRow[],
): HeroRow[] {
  const heroes = heroesPayload?.hero_statistics?.heroes || [];
  if (computedHeroes && computedHeroes.complete && computedHeroes.heroes) {
    return buildHeroListFromGames(heroes, computedHeroes.heroes, playoffHeroes || []);
  }
  return heroes.map((h) => ({
    name: h.name || 'Unknown hero',
    icon: iconOf(h),
    picks: Number(h.picks) || 0,
    bans: Number(h.bans) || 0,
    wins: Number(h.wins) || 0,
    losses: Number(h.losses) || 0,
    wr: parseFloat(h.win_rate || '') || 0,
    rating: Number(h.average_imprint_rating) || 0,
    k: Number(h.average_kills) || 0,
    d: Number(h.average_deaths) || 0,
    a: Number(h.average_assists) || 0,
  }));
}

interface Acc { name: string; icon: string | null; picks: number; wins: number; losses: number; k: number; d: number; a: number; ratingSum: number; ratingCount: number }

function buildHeroListFromGames(rawHeroes: ImprintHero[], groupHeroes: Record<string, ComputedHeroRec>, playoffHeroes: HeroRow[]): HeroRow[] {
  const rawByKey = new Map(rawHeroes.map((x) => [hkey(x.name), x]));
  const byKey = new Map<string, Acc>();
  const add = (name: string, ic: string | null, picks: number, wins: number, losses: number, k: number, d: number, a: number, ratingSum: number, ratingCount: number) => {
    const key = hkey(name);
    const h = byKey.get(key) || { name, icon: null, picks: 0, wins: 0, losses: 0, k: 0, d: 0, a: 0, ratingSum: 0, ratingCount: 0 };
    h.icon = h.icon || ic || null;
    h.picks += picks; h.wins += wins; h.losses += losses;
    h.k += k; h.d += d; h.a += a;
    h.ratingSum += ratingSum; h.ratingCount += ratingCount;
    byKey.set(key, h);
  };
  for (const r of Object.values(groupHeroes)) {
    add(r.name, r.icon, r.picks || 0, r.wins || 0, r.losses || 0, r.killSum || 0, r.deathSum || 0, r.assistSum || 0, r.ratingSum || 0, r.ratingCount || 0);
  }
  for (const r of playoffHeroes) {
    const s = r.sums || { k: 0, d: 0, a: 0, ratingSum: 0, ratingCount: 0 };
    add(r.name, r.icon, r.picks, r.wins, r.losses, s.k || 0, s.d || 0, s.a || 0, s.ratingSum || 0, s.ratingCount || 0);
  }

  const out: HeroRow[] = [...byKey.entries()].map(([key, h]) => {
    const raw = rawByKey.get(key);
    return {
      name: h.name,
      icon: h.icon || (raw && iconOf(raw)) || null,
      picks: h.picks,
      bans: Number(raw && raw.bans) || 0,
      wins: h.wins,
      losses: h.losses,
      wr: h.picks ? (h.wins / h.picks) * 100 : 0,
      rating: h.ratingCount ? h.ratingSum / h.ratingCount : 0,
      k: h.picks ? h.k / h.picks : 0,
      d: h.picks ? h.d / h.picks : 0,
      a: h.picks ? h.a / h.picks : 0,
    };
  });
  // Banned but never picked in a game we have.
  for (const [key, raw] of rawByKey) {
    if (byKey.has(key) || !(Number(raw.bans) > 0)) continue;
    out.push({ name: raw.name || 'Unknown hero', icon: iconOf(raw), picks: 0, bans: Number(raw.bans), wins: 0, losses: 0, wr: 0, rating: 0, k: 0, d: 0, a: 0 });
  }
  return out;
}

/** Trending (>=60%) and struggling (<=40%) heroes, 2+ games each. */
export function trendingHeroes(heroes: HeroRow[]): { trending: HeroRow[]; struggling: HeroRow[] } {
  const eligible = heroes.filter((h) => h.picks >= 2);
  return {
    trending: eligible.filter((h) => h.wr >= 60).sort((a, b) => b.wr - a.wr || b.picks - a.picks).slice(0, 8),
    struggling: eligible.filter((h) => h.wr <= 40).sort((a, b) => a.wr - b.wr || b.picks - a.picks).slice(0, 8),
  };
}

export type HeroSortKey = 'name' | 'picks' | 'bans' | 'wins' | 'losses' | 'wr' | 'rating' | 'kda';

export function sortHeroes(heroes: HeroRow[], key: HeroSortKey, asc: boolean): HeroRow[] {
  return heroes.slice().sort((a, b) => {
    if (key === 'name') return asc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    let av: number, bv: number;
    if (key === 'kda') { av = a.k + a.a - a.d; bv = b.k + b.a - b.d; } else { av = Number(a[key]) || 0; bv = Number(b[key]) || 0; }
    return (asc ? av - bv : bv - av) || a.name.localeCompare(b.name);
  });
}
