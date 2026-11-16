// Rules / Info / FAQ copy, verbatim from legacy/rules.html. Do not reword.

export type Part = string | { b: string } | { a: string; t: string };
export type Para = Part[];
export interface RuleSection { id: string; title: string; paras: Para[] }
export type TabKey = 'rules' | 'info' | 'faq';

const TWITCH = 'https://www.twitch.tv/secretleaguedota';
const YOUTUBE = 'https://www.youtube.com/@SecretShopDOTA';
const p = (s: string): Para => [s];

export const TAB_LABELS: Record<TabKey, string> = { rules: 'Rules', info: 'Info', faq: 'FAQ' };
export const PAGE_TITLE = 'SecretLeague — Rules & Information';

export const RULES: RuleSection[] = [
  { id: 'team-eligibility', title: 'Team Eligibility', paras: [
    p('Each team must have at least one UK-based player on their roster. Teams are responsible for ensuring all roster information is accurate. If possible please ensure all teammates join the Discord so they are easy for staff to contact if needed.'),
  ] },
  { id: 'smurfing-policy', title: 'Smurfing Policy', paras: [
    p('Smurfing is not permitted. If you have previously used or currently own other accounts, please inform tournament staff before participating. Failure to disclose alternate accounts may result in penalties or disqualification. Please make sure all players dotabuffs for their main accounts and alts are public for players to scout.'),
  ] },
  { id: 'advertising-solicitation', title: 'Advertising & Solicitation', paras: [
    p('Requesting money, promoting services, events, or communities within the server or through direct messages to participants is strictly prohibited without prior approval from staff.'),
  ] },
  { id: 'conduct', title: 'Conduct', paras: [
    p('Treat all players, staff members, and community members with respect. Harassment, toxicity, discrimination, or unsportsmanlike behaviour will not be tolerated.'),
    p('Each team can have a maximum pause time of 10 minutes, across 5 pauses. This is not to be abused. If the other team allows it, you can have more.'),
  ] },
  { id: 'staff-decisions', title: 'Staff Decisions', paras: [
    p('Tournament staff reserve the right to make rulings on situations not explicitly covered in these rules. All staff decisions are final.'),
  ] },
  { id: 'match-attendance', title: 'Match Attendance & Late Arrivals', paras: [
    p('Teams are expected to be ready at the scheduled match time. Players or teams arriving late may receive penalties, including draft penalties or game forfeits, depending on the delay and circumstances.'),
    p('15 minutes late — 30 second draft penalty.'),
    p('25 minutes late — match forfeit.'),
    p('40 minutes late — series forfeit.'),
    p("If you anticipate being delayed, notify tournament staff and the opposing team's captain as soon as possible."),
  ] },
  { id: 'stand-ins', title: 'Stand-Ins', paras: [
    p("If you require a stand-in player, tournament staff must be notified at least two hours before the scheduled match start time. The stand-in player's role and Dotabuff profile must be provided to both tournament staff and the opposing team captain for approval. The player cannot be more than 500 MMR higher than the person they're replacing, unless agreed upon by the other team; they can be any rank below. Stand-ins may only participate once approval has been granted. A maximum of one stand-in is permitted per team."),
  ] },
  { id: 'roster-changes', title: 'Roster Changes', paras: [
    p("If you need to make a roster change after sign up, please notify a member of staff and send them the player's information — Dotabuff, position, who they're replacing, etc."),
    p("Roster changes can be made during Group Stages as long as the incoming player is a similar rank to the person they're replacing and a member of staff has approved it."),
    p("Replacement players should not be 500mmr+- than the person they're replacing, similar to stand-in rule."),
    p('Player changes cannot be made once Playoffs start.'),
  ] },
  { id: 'contacting-staff', title: 'Contacting Staff', paras: [
    p('If any issues arise before, during, or after a match, contact tournament staff immediately. Staff are there to help resolve disputes, technical issues, and scheduling concerns.'),
    p('Discord: @Helper'),
    p('Email: secretleaguedota@gmail.com'),
  ] },
];

export const INFO: RuleSection[] = [
  { id: 'about', title: 'About SecretLeague', paras: [
    ['SecretLeague is an amateur tournament that will be hosted yearly through our website and Discord server. We will live stream it on ', { a: TWITCH, t: 'Twitch' }, ' and ', { a: YOUTUBE, t: 'YouTube' }, '.'],
  ] },
  { id: 'dates', title: 'Dates', paras: [
    ['⚖️ ', { b: 'Staff balancing & Division placement' }, ' — Early August'],
    ['🏆 ', { b: 'Group Stages begin' }, ' — August'],
    ['🎯 ', { b: 'Playoffs' }, ' — start after group stages, depending on how many teams registered to play.'],
  ] },
  { id: 'format', title: 'Format', paras: [
    p('The SecretLeague staff will balance the teams as best we can with three divisions — one lower and one upper. Group stages will be played as a BO2 for seeding. Once complete, teams will be placed into the winners or losers side of playoffs depending on group stage performance. The main event will follow with BO3 matches. Once the last two teams remain in each division, the Grand Finals will be a BO3 to determine the SecretLeague Champion!'),
  ] },
  { id: 'prize-pool', title: 'Prize Pool', paras: [
    [{ b: 'Both divisions:' }],
    ['🥇 ', { b: '1st Place' }, ' — £250 total (£50 per player) + exclusive Discord role'],
    ['🥈 ', { b: '2nd Place' }, ' — Free team coaching session from BaLLooN Dota + exclusive Discord role'],
    ['🥉 ', { b: '3rd Place' }, ' — Special Discord role ⭐'],
  ] },
];

export const FAQ: RuleSection[] = [
  { id: 'when', title: 'When does SecretLeague begin?', paras: [
    p('SecretLeague is a yearly event with Group Stages starting from the 10th August.'),
  ] },
  { id: 'how-join', title: 'How do I join SecretLeague?', paras: [
    p('You can register on the website through "Registration" at the top of the page.'),
  ] },
  { id: 'rank', title: 'Can I join regardless of rank?', paras: [
    p('Anyone can join, but since this is an amateur tournament staff are allowed to turn away teams that may be difficult to balance, so that everyone has a fair shot at 1st place.'),
  ] },
  { id: 'solo', title: 'Can I register as a solo player?', paras: [
    p('If you register solo a message will be sent into our "Looking for team" chat in the Discord server to help you find teammates. Solo Entry does not mean you will play in the tournament, it just makes you visible as available to other teams looking for players!'),
  ] },
  { id: 'casting', title: 'How do I get involved with casting and observing?', paras: [
    p("We are always looking for new casters and observers. Join the Discord and message one of the Admins if you'd like to try it out."),
  ] },
  { id: 'stream', title: 'Where will SecretLeague be livestreamed?', paras: [
    ['Games will be streamed on our ', { a: TWITCH, t: 'Twitch' }, ' and ', { a: YOUTUBE, t: 'YouTube' }, ' channels.'],
  ] },
];
