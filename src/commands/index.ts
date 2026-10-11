import { Collection, ChatInputCommandInteraction } from 'discord.js';
import { welcomeactivate } from './welcomeactivate';
import { byebyeactivate } from './byebyeactivate';
import { auditlogactivate } from './auditlogactivate';
import { auditlogs } from './auditlogs';
import { securitystatus } from './securitystatus';
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

export interface Command {
  data: any;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands: Command[] = [
  welcomeactivate,
  byebyeactivate,
  auditlogactivate,
  auditlogs,
  securitystatus,
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
  giverole,
  syncall,
];

export const commandCollection = new Collection<string, Command>();
for (const cmd of commands) {
  commandCollection.set(cmd.data.name, cmd);
}
