import { Collection, ChatInputCommandInteraction } from 'discord.js';
import { welcomeactivate } from './welcomeactivate';
import { byebyeactivate } from './byebyeactivate';
import { auditlogs } from './auditlogs';
import { ban } from './ban';
import { unban } from './unban';
import { kick } from './kick';
import { timeout } from './timeout';
import { warn } from './warn';
import { lockdown } from './lockdown';
import { unlockdown } from './unlockdown';
import { serverinfo } from './serverinfo';
import { userinfo } from './userinfo';
import { help } from './help';
import { giverole } from './giverole';
import { syncall } from './syncall';
import { about } from './about';

export interface Command {
  data: any;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const groupACommands: Command[] = [
  welcomeactivate,
  byebyeactivate,
  auditlogs,
  ban,
  unban,
  kick,
  timeout,
  warn,
  lockdown,
  unlockdown,
  serverinfo,
  userinfo,
  help,
  about,
];

export const giveRoleCommand = giverole;
export const syncAllCommand = syncall;

export const groupBCommands: Command[] = [
  giveRoleCommand,
  syncAllCommand,
];

export const commands: Command[] = [
  ...groupACommands,
  ...groupBCommands,
];

export const GROUP_A_COMMAND_NAMES = groupACommands.map(c => c.data.name as string);
export const GROUP_B_COMMAND_NAMES = groupBCommands.map(c => c.data.name as string);

export const commandCollection = new Collection<string, Command>();
for (const cmd of commands) {
  commandCollection.set(cmd.data.name, cmd);
}

export {
  welcomeactivate,
  byebyeactivate,
  auditlogs,
  ban,
  unban,
  kick,
  timeout,
  warn,
  lockdown,
  unlockdown,
  serverinfo,
  userinfo,
  help,
  about,
  giverole,
  syncall,
};
