import { ukNow, ukZone } from '../time';
import { fmtDate, stateAt } from './time';
import type { Division, MatchResult, MatchRow, MatchState, Side, Slot, UkClock } from './types';

// Sheet spellings that don't normalise onto the registered team name. Every other
// difference (case, spacing) is handled by normName.
export const TEAM_ALIASES: Record<string, string> = {
  'midland massive': 'Midlands Massive',
  'herald royale': 'Herald Royale with Cheese',
  'n-sitution': 'N-stitution',
  'tailung accountants': 'TaiLungs Accountants',
  '5 stuns no brain': '5 Stuns No Brains',
};

export function normName(s: string | null | undefined): string {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

export type Schedule = ReturnType<typeof createSchedule>;

function cloneRow(r: MatchRow): MatchRow {
  return { ...r, a: r.a && { ...r.a }, b: r.b && { ...r.b }, score: r.score && [...r.score] as [number, number] };
}

/**
 * A schedule: the sheet rows (cloned, with bracket links recovered) plus lookups.
 * `knownNames` are registered team names used to resolve shortened sheet spellings.
 * Pure: no DOM, no module state.
 */
export function createSchedule(input: MatchRow[], knownNames: string[] = []) {
  const rows = input.map(cloneRow);
  const known = new Map(knownNames.map((n) => [normName(n), n]));

  function resolveTeamName(raw: string | null | undefined): string {
    const name = (raw || '').trim();
    if (!name) return name;
    const alias = TEAM_ALIASES[name.toLowerCase()];
    if (alias) return alias;
    const key = normName(name);
    const hit = known.get(key);
    if (hit) return hit;
    // "Herald Royale" for "Herald Royale with Cheese": accept an unambiguous prefix.
    const prefixed = [...known.keys()].filter((k) => k.startsWith(key) && key.length >= 5);
    if (prefixed.length === 1) return known.get(prefixed[0]) as string;
    return name;
  }

  function sameTeam(x: string | null | undefined, y: string | null | undefined): boolean {
    return Boolean(x && y) && normName(resolveTeamName(x)) === normName(resolveTeamName(y));
  }

  function findMatch(div: Division, n: number): MatchRow | null {
    return rows.find((m) => m.div === div && m.n === n && m.a && m.b) || null;
  }

  /** The team in a slot, or the team a "Winner/Loser of match N" pointer resolves to. */
  function slotTeam(slot: Slot | null, div: Division, depth = 0): string | null {
    if (!slot || depth > 20) return null;
    if (slot.team) return resolveTeamName(slot.team);
    const ref = slot.winnerOf ?? slot.loserOf;
    const m = ref != null ? findMatch(div, ref) : null;
    if (!m) return null;
    const won = matchWinner(m, depth + 1);
    if (!won) return null;
    const side: Side = slot.winnerOf != null ? won : won === 'a' ? 'b' : 'a';
    return slotTeam(m[side], div, depth + 1);
  }

  /** 'a' or 'b' for a decided match: the Winner column first, else the score. */
  function matchWinner(m: MatchRow, depth = 0): Side | null {
    if (m.winner) {
      for (const side of ['a', 'b'] as const) {
        if (sameTeam(m.winner, slotTeam(m[side], m.div, depth + 1))) return side;
      }
    }
    if (m.score && m.score[0] !== m.score[1]) return m.score[0] > m.score[1] ? 'a' : 'b';
    return null;
  }

  /**
   * Put back the links the sheet loses when "Winner of Match #N" is overwritten with
   * a team name: a named team is linked to its own most recent earlier match in the
   * division (winnerOf if it won, loserOf if it dropped). Derived links sit alongside
   * `team`, so the name still displays.
   */
  function linkResults(): void {
    const matches = rows.filter((m) => m.n != null && m.a && m.b).sort((x, y) => (x.n as number) - (y.n as number));
    const slots = (m: MatchRow) => [m.a, m.b] as Slot[];
    for (const m of matches) {
      for (const slot of slots(m)) {
        if (slot.derived) { delete slot.winnerOf; delete slot.loserOf; delete slot.derived; }
      }
    }
    // A match still named by a pointer somewhere is already linked; don't claim it twice.
    const pointed = new Set<string>();
    for (const m of matches) {
      for (const slot of slots(m)) {
        if (!slot.team) pointed.add(`${m.div}|${slot.winnerOf ?? ''}|${slot.loserOf ?? ''}`);
      }
    }
    for (const m of matches) {
      for (const slot of slots(m)) {
        if (!slot.team) continue;
        const prev = matches
          .filter((p) => p.div === m.div && (p.n as number) < (m.n as number)
            && slots(p).some((s) => sameTeam(slotTeam(s, p.div), slot.team)))
          .pop();
        if (!prev) continue;
        const won = matchWinner(prev);
        if (!won) continue;
        const wonIt = sameTeam(slotTeam(prev[won], prev.div), slot.team);
        const key = wonIt ? `${m.div}|${prev.n}|` : `${m.div}||${prev.n}`;
        if (pointed.has(key)) continue;
        if (wonIt) slot.winnerOf = prev.n as number; else slot.loserOf = prev.n as number;
        slot.derived = true;
      }
    }
  }

  function matchResult(m: MatchRow): MatchResult | null {
    const won = matchWinner(m);
    if (!won) return null;
    let score = m.score ? (won === 'a' ? [...m.score] : [m.score[1], m.score[0]]) as [number, number] : null;
    // Winner column and score can disagree on the sheet; keep the scoreline pointing
    // the same way as the winner rather than printing "Imprint 0-2".
    if (score && score[0] < score[1]) score = [score[1], score[0]];
    const loserSide: Side = won === 'a' ? 'b' : 'a';
    return { winner: slotTeam(m[won], m.div), loser: slotTeam(m[loserSide], m.div), winnerSide: won, loserSide, score };
  }

  function matchState(m: MatchRow, now: UkClock = ukNow()): MatchState {
    return stateAt(m, Boolean(matchWinner(m)), now);
  }

  function slotText(slot: Slot | null, div: Division): string {
    if (!slot) return 'TBD';
    const team = slotTeam(slot, div);
    if (team) return team;
    if (slot.winnerOf != null) return `Winner of #${slot.winnerOf}`;
    if (slot.loserOf != null) return `Loser of #${slot.loserOf}`;
    return 'TBD';
  }

  /** Rows that are real matches (match number + both team cells). */
  function matches(div?: Division): MatchRow[] {
    return rows.filter((m) => m.n != null && m.a && m.b && (!div || m.div === div));
  }

  /** The last round on the sheet for a division: its grand final. */
  function finalRow(div: Division): MatchRow | null {
    const inDiv = rows.filter((m) => m.div === div && m.week != null && m.n != null && m.a && m.b);
    if (!inDiv.length) return null;
    const maxWeek = Math.max(...inDiv.map((m) => m.week as number));
    const last = inDiv.filter((m) => m.week === maxWeek);
    return last[last.length - 1];
  }

  function isGrandFinal(m: MatchRow): boolean {
    return finalRow(m.div) === m;
  }

  /** Champion of a division once its grand final is decided. */
  function champion(div: Division): string | null {
    const f = finalRow(div);
    return f ? matchResult(f)?.winner ?? null : null;
  }

  linkResults();

  return {
    rows, resolveTeamName, sameTeam, slotTeam, matchWinner, matchResult, matchState,
    slotText, matches, finalRow, isGrandFinal, champion, linkResults, findMatch,
  };
}

/** Only http(s) links get through; sheet strings are hostile. */
export function streamLinks(raw: string): string[] {
  return raw.split(/\s+/).filter((u) => /^https?:\/\/\S+$/i.test(u));
}

export function streamLabel(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if (h.includes('twitch')) return 'Twitch';
    if (h.includes('youtu')) return 'YouTube';
    return h;
  } catch {
    return 'Stream';
  }
}

export function whenText(m: Pick<MatchRow, 'date' | 'time'>): string {
  return `${fmtDate(m.date)}${m.time ? `, ${m.time} ${ukZone(m.date)}` : ''}`;
}

export function crewText(m: MatchRow): string {
  return [
    m.caster ? `Cast: ${m.caster}` : '',
    m.analyst ? `Analyst: ${m.analyst}` : '',
    m.observer ? `Observer: ${m.observer}` : '',
  ].filter(Boolean).join(' · ');
}
