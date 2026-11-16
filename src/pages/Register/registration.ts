// Pure registration logic ported from legacy js/register.js: validation, draft shape,
// and the payloads sent to the Apps Script, Discord and Supabase. No React, no network.
import { mmrToRank } from '../../lib/rosters';

export const DRAFT_KEY = 'secretshop_draft_v2';
export const POSITIONS = ['1', '2', '3', '4', '5'] as const;
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const SLOTS = [
  { label: 'Morning', range: '9am–1pm' },
  { label: 'Afternoon', range: '1pm–6pm' },
  { label: 'Evening', range: '6pm–11pm' },
] as const;
export const MAX_MMR = 15000;

export interface PlayerForm { ign: string; steam: string; discord: string; mmr: string; pos: string }
export interface SoloForm { ign: string; steam: string; discord: string; mmr: string; positions: string[] }
export interface TeamForm { name: string; captain: number; players: PlayerForm[] }
export type Mode = 'team' | 'solo';
export type Errors = Record<string, string>;

export const emptyPlayer = (): PlayerForm => ({ ign: '', steam: '', discord: '', mmr: '', pos: '' });
export const emptySolo = (): SoloForm => ({ ign: '', steam: '', discord: '', mmr: '', positions: [] });
export const emptyTeam = (): TeamForm => ({ name: '', captain: 1, players: [1, 2, 3, 4, 5].map(emptyPlayer) });

/** Availability labels are "Mon: Morning", the same strings the legacy sheet/admin tools already read. */
export const availabilityLabel = (day: number, slot: number): string => `${DAYS[day]}: ${SLOTS[slot].label}`;

/** Selected labels in day-then-slot order. */
export function sortAvailability(selected: Iterable<string>): string[] {
  const set = new Set(selected);
  const out: string[] = [];
  DAYS.forEach((_, d) => SLOTS.forEach((__, s) => { const l = availabilityLabel(d, s); if (set.has(l)) out.push(l); }));
  return out;
}

export const sanitizeSteam = (v: string): string => v.replace(/\D/g, '').slice(0, 17);
export const isSteamId = (v: string): boolean => /^\d{17}$/.test(v);

/** Whole-number MMR in 1..15000, else null. */
export function parseMmr(v: string): number | null {
  const t = v.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n >= 1 && n <= MAX_MMR ? n : null;
}

export const rankLabel = (v: string): string => {
  const n = parseMmr(v);
  return n ? mmrToRank(n)?.label ?? '' : '';
};

export const dotabuffUrl = (steam: string): string => (steam ? `https://www.dotabuff.com/players/${steam}` : '');

// ---------- validation ----------
export function validateSolo(s: SoloForm, availability: string[]): Errors {
  const e: Errors = {};
  if (!s.ign.trim()) e.ign = 'Enter your Steam name';
  if (!isSteamId(s.steam)) e.steam = 'Steam ID must be exactly 17 digits';
  if (parseMmr(s.mmr) === null) e.mmr = `Enter your MMR (1 to ${MAX_MMR.toLocaleString('en-GB')})`;
  if (!s.positions.length) e.positions = 'Pick at least one position';
  if (!availability.length) e.availability = 'Pick at least one time slot';
  return e;
}

/** Errors for one team player, keyed `p<index+1>.<field>`. Only the captain's Discord is required. */
export function validatePlayer(p: PlayerForm, index: number, captain: number): Errors {
  const k = `p${index + 1}`;
  const e: Errors = {};
  if (!p.ign.trim()) e[`${k}.ign`] = 'Enter a Steam name';
  if (!isSteamId(p.steam)) e[`${k}.steam`] = 'Steam ID must be exactly 17 digits';
  if (index + 1 === captain && !p.discord.trim()) e[`${k}.discord`] = 'Captain needs a Discord name, it is how we contact the team';
  if (parseMmr(p.mmr) === null) e[`${k}.mmr`] = `Enter an MMR (1 to ${MAX_MMR.toLocaleString('en-GB')})`;
  if (!p.pos) e[`${k}.pos`] = 'Pick a position';
  return e;
}

export function validateTeam(t: TeamForm, hasLogo: boolean, availability: string[]): Errors {
  const e: Errors = {};
  if (!t.name.trim()) e.name = 'Enter a team name';
  if (!hasLogo) e.logo = 'Choose a team logo';
  if (!availability.length) e.availability = 'Pick at least one time slot';
  t.players.forEach((p, i) => Object.assign(e, validatePlayer(p, i, t.captain)));
  return e;
}

/** First error key's player step (1..5) or 0 when the error is not on a player. */
export function stepOfError(key: string): number {
  const m = key.match(/^p(\d)\./);
  return m ? Number(m[1]) : 0;
}

// ---------- draft ----------
export interface Draft {
  mode: Mode;
  solo: SoloForm;
  team: TeamForm;
  logo: string | null;
  availability: string[];
}

const s = (v: unknown): string => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));

/** Tolerant parse of a stored draft (also the legacy shape). Returns null on junk. */
export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!d || typeof d !== 'object') return null;
    const solo = emptySolo();
    if (d.solo) {
      solo.ign = s(d.solo.ign); solo.steam = sanitizeSteam(s(d.solo.steamId ?? d.solo.steam));
      solo.discord = s(d.solo.discord); solo.mmr = s(d.solo.mmr);
      const pos = Array.isArray(d.solo.positions) ? d.solo.positions : d.solo.pos ? [d.solo.pos] : [];
      solo.positions = pos.map(s).filter((p: string) => (POSITIONS as readonly string[]).includes(p));
    }
    const team = emptyTeam();
    let logo: string | null = null;
    if (d.team) {
      team.name = s(d.team.teamName ?? d.team.name);
      const cap = Number(d.team.captain);
      team.captain = cap >= 1 && cap <= 5 ? cap : 1;
      if (typeof d.team.logo === 'string' && d.team.logo.startsWith('data:image/')) logo = d.team.logo;
      if (Array.isArray(d.team.players)) {
        team.players = [0, 1, 2, 3, 4].map((i) => {
          const p = d.team.players[i] ?? {};
          return { ign: s(p.ign), steam: sanitizeSteam(s(p.steamId ?? p.steam)), discord: s(p.discord), mmr: s(p.mmr), pos: s(p.pos) };
        });
      }
    }
    return {
      mode: d.mode === 'solo' ? 'solo' : 'team',
      solo, team, logo,
      availability: Array.isArray(d.availability) ? sortAvailability(d.availability.map(s)) : [],
    };
  } catch {
    return null;
  }
}

/** Serialised in the legacy field names so a draft survives either version of the site. */
export function serialiseDraft(d: Draft): string {
  return JSON.stringify({
    mode: d.mode,
    solo: { ign: d.solo.ign, steamId: d.solo.steam, discord: d.solo.discord, mmr: d.solo.mmr, positions: d.solo.positions },
    team: {
      teamName: d.team.name, captain: d.team.captain, logo: d.logo,
      players: d.team.players.map((p) => ({ ign: p.ign, steamId: p.steam, discord: p.discord, mmr: p.mmr, pos: p.pos })),
    },
    availability: d.availability,
  });
}

// ---------- payloads ----------
export function formatSoloRoles(positions: string[]): string {
  if (!positions.length) return 'N/A';
  let out = `Primary: Pos ${positions[0]}`;
  const secondary = positions.slice(1).map((v) => `Pos ${v}`);
  if (secondary.length) out += `\nSecondary: ${secondary.join(', ')}`;
  return out;
}

const availText = (a: string[]): string => (a.length ? a.join(' | ') : 'No availability selected');

/** Row for the Apps Script web app (field names fixed by google-apps-script.gs). */
export function soloSheetPayload(f: SoloForm, availability: string[], timestamp: string) {
  return {
    type: 'solo', timestamp,
    ign: f.ign.trim(), steam: f.steam, dotabuff: dotabuffUrl(f.steam), discord: f.discord.trim(),
    rank: rankLabel(f.mmr), mmr: parseMmr(f.mmr), position: f.positions.join(', '),
    availability: availText(availability),
  };
}

export function teamSheetPayload(t: TeamForm, availability: string[], logoUrl: string, timestamp: string) {
  const cap = t.players[t.captain - 1];
  return {
    type: 'team', timestamp,
    teamName: t.name.trim(), captain: t.captain, captainIgn: cap.ign.trim(), captainDiscord: cap.discord.trim(),
    logo: logoUrl,
    players: t.players.map((p) => ({
      ign: p.ign.trim(), steam: p.steam, discord: p.discord.trim(), dotabuff: dotabuffUrl(p.steam),
      rank: rankLabel(p.mmr), mmr: parseMmr(p.mmr), position: p.pos,
    })),
    availability: availText(availability),
  };
}

/** Discord embed for the admin channel. Mentions are disabled by the caller (allowed_mentions). */
export function soloEmbed(f: SoloForm, availability: string[]) {
  const mmr = parseMmr(f.mmr);
  return {
    title: '⚔️ New Solo Registration',
    color: 0xc89b3c,
    fields: [
      { name: 'IGN', value: f.ign.trim(), inline: true },
      { name: 'Discord', value: f.discord.trim() || 'N/A', inline: true },
      { name: 'Rank', value: `${rankLabel(f.mmr)} (${mmr} MMR)`, inline: true },
      { name: 'Roles', value: formatSoloRoles(f.positions), inline: true },
      { name: 'Steam ID', value: `[${f.steam}](https://steamcommunity.com/profiles/${f.steam})`, inline: true },
      { name: 'Dotabuff', value: `[${f.steam}](${dotabuffUrl(f.steam)})`, inline: true },
      { name: 'Availability', value: availText(availability) },
    ],
  };
}

export function teamEmbed(t: TeamForm, availability: string[]) {
  const cap = t.players[t.captain - 1];
  return {
    title: `🛡️ New Team Registration: ${t.name.trim()}`,
    color: 0x7b5ea7,
    fields: [
      ...t.players.map((p, i) => ({
        name: `Player ${i + 1}${i === t.captain - 1 ? ' (Captain)' : ''}`,
        value: `**IGN:** ${p.ign.trim()}\n**Rank:** ${rankLabel(p.mmr)} (${parseMmr(p.mmr)} MMR)\n**Pos:** ${p.pos}\n**Discord:** ${p.discord.trim() || 'N/A'}\n**ID:** ${p.steam}\n**Dotabuff:** [${p.steam}](${dotabuffUrl(p.steam)})`,
        inline: true,
      })),
      { name: 'Captain Contact', value: `${cap.ign.trim() || '?'} — Discord: ${cap.discord.trim() || 'N/A'}` },
      { name: 'Availability', value: availText(availability) },
    ],
  };
}

/** Row for `solo_registrations`. */
export function soloRow(f: SoloForm) {
  return {
    ign: f.ign.trim(), steam_id: f.steam, discord_username: f.discord.trim() || null,
    rank: rankLabel(f.mmr), mmr: parseMmr(f.mmr), primary_position: Number(f.positions[0]),
  };
}

/** Row for `team_registrations` (avg_mmr is a plain mean, as legacy). */
export function teamRow(t: TeamForm, captainUserId: string, logoUrl: string) {
  const mmrs = t.players.map((p) => parseMmr(p.mmr) ?? 0);
  const cap = t.players[t.captain - 1];
  return {
    team_name: t.name.trim(),
    captain_ign: cap.ign.trim(),
    captain_discord: cap.discord.trim() || null,
    captain_user_id: captainUserId,
    logo_url: logoUrl,
    players: t.players.map((p) => ({
      ign: p.ign.trim(), steam_id: p.steam, discord_username: p.discord.trim() || null,
      rank: rankLabel(p.mmr), mmr: parseMmr(p.mmr), primary_position: Number(p.pos),
    })),
    avg_mmr: Math.round(mmrs.reduce((a, b) => a + b, 0) / Math.max(mmrs.length, 1)),
  };
}
