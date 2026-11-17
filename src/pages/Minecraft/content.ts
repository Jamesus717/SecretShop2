import type { RuleSection } from '../Rules/content';

// DRAFT copy: confirm the server address and rules with the SecretLeague admins before launch.
export const SERVER_ADDRESS: string | null = null;

export const MINECRAFT_INFO: RuleSection[] = [
  { id: 'about', title: 'About the server', paras: [
    ['The SecretLeague Minecraft server is a community survival world for members of our Discord.'],
  ] },
  { id: 'join', title: 'How to join', paras: [
    ['Server address: ', { b: SERVER_ADDRESS ?? 'ask in the Discord' }],
    ['Join the Discord and ask an Admin if you need to be added.'],
  ] },
];

export const MINECRAFT_RULES: RuleSection[] = [
  { id: 'respect', title: 'Be respectful', paras: [['Treat every player and Admin with respect. No harassment, toxicity or discrimination.']] },
  { id: 'griefing', title: 'No griefing or stealing', paras: [["Don't break, change or take from other people's builds and chests without their permission."]] },
  { id: 'cheats', title: 'No cheats', paras: [['No hacked clients, x-ray, duping or exploits.']] },
  { id: 'lag', title: 'Keep the server running smoothly', paras: [['No lag machines or huge entity farms. Ask an Admin before building anything big.']] },
  { id: 'staff', title: 'Admin decisions', paras: [['Admins can rule on anything not covered here. Their decisions are final.']] },
];
