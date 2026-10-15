import { Message, EmbedBuilder, TextChannel, Client } from 'discord.js';
import { CONFIG, isMasterOwner } from '../config';
import { MasterSocService } from './masterSocService';
import { ModerationService } from './moderationService';
import { StrikeService } from './strikeService';
import { GlobalThreatService } from './globalThreatService';
import { SecurityShieldService } from './securityShieldService';
import { updateGuildConfig, getOrCreateGuildConfig } from '../db';

export class MasterCommandExecutor {
  /**
   * Execute CLI terminal commands dispatched in Master SOC #command channels
   */
  public static async execute(message: Message, client: Client): Promise<void> {
    if (message.author.bot) return;

    // Check if channel is in Master Guild and named "command"
    if (message.guildId !== CONFIG.MASTER_GUILD_ID || (message.channel as TextChannel).name !== 'command') {
      return;
    }

    // Authorization: Master Owner or Admin
    if (!isMasterOwner(message.author.id) && !message.member?.permissions.has('Administrator')) {
      await message.reply('⛔ **Access Denied**: Master SOC Command Terminal requires Root Administrator authorization.');
      return;
    }

    const targetGuild = MasterSocService.findTargetGuildFromChannel(message.channel, client);
    if (!targetGuild) {
      await message.reply('❌ **Error**: Unable to bind terminal to target guild. Ensure channel topic contains `TARGET_GUILD_ID:<id>`.');
      return;
    }

    const content = message.content.trim();
    if (!content) return;

    const parts = content.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    const cleanId = (input: string | undefined): string => {
      if (!input) return '';
      return input.replace(/[<@!&#>]/g, '').trim();
    };

    let resultOutput = '';
    let isSuccess = true;

    try {
      switch (command) {
        case 'help': {
          resultOutput =
            `GUARD SOC CLI TERMINAL COMMANDS:\n` +
            `  • serverclone              - Snapshot target guild channels & roles\n` +
            `  • lockdown [reason]        - Emergency freeze on all target channels\n` +
            `  • unlockdown [reason]      - Restore normal channel perms\n` +
            `  • kick <user> [reason]     - Kick member from target guild\n` +
            `  • ban <user> [reason]      - Ban member from target guild\n` +
            `  • unban <userId> [reason]  - Remove ban on user ID\n` +
            `  • warn <user> <reason>     - Dispatch security warning & auto-strike to user\n` +
            `  • timeout <user> <m> [r]   - Timeout member for specified minutes\n` +
            `  • purge <count>            - Purge messages in target main channel\n` +
            `  • security [on|off]        - Toggle Anti-Nuke and Anti-Raid shields\n` +
            `  • honeypot                 - Provision automated honeypot trap channel\n` +
            `  • minage <days>            - Set minimum account age threshold for anti-alt gatekeeper\n` +
            `  • serverinfo               - Full intelligence report on target\n` +
            `  • userinfo <user>          - Dossier on user in target server\n` +
            `  • giverole <user> <role>   - Grant or revoke role in target server\n` +
            `  • case <caseId>            - Inspect full forensic dossier for case\n` +
            `  • strikes <userId>         - View user's 5-strike record in target guild\n` +
            `  • clearstrikes <userId>    - Reset user's strike count in target guild\n` +
            `  • globalban <user> [r]     - Fleet-wide cross-server ban and blacklist\n` +
            `  • globalunban <user> [r]   - Remove blacklist & revoke bans fleet-wide\n` +
            `  • blacklist                - List all active globally blacklisted actors\n` +
            `  • syncall                  - Force re-fetch and reconcile all guilds & telemetry`;
          break;
        }

        case 'syncall': {
          const res = await MasterSocService.reconcileAllGuilds(client);
          const { BotStatusMonitorService } = await import('./botStatusMonitorService');
          await BotStatusMonitorService.dispatchHourlyReport(client).catch(() => null);
          isSuccess = true;
          resultOutput = `Multi-Guild Sync Complete: ${res.syncedGuilds} guilds provisioned, ${res.failedGuilds} failed.\nTelemetry dispatched to #bot-status.`;
          break;
        }

        case 'serverclone': {
          const res = await ModerationService.cloneServer(targetGuild);
          isSuccess = res.success;
          resultOutput = `${res.message}\nSnapshot saved in SOC memory.`;
          break;
        }

        case 'lockdown': {
          const reason = args.join(' ') || 'Master SOC Emergency Command';
          const res = await ModerationService.lockdownGuild(targetGuild, reason);
          isSuccess = res.success;
          resultOutput = res.message;
          break;
        }

        case 'unlockdown': {
          const reason = args.join(' ') || 'Master SOC Normalization Command';
          const res = await ModerationService.unlockdownGuild(targetGuild, reason);
          isSuccess = res.success;
          resultOutput = res.message;
          break;
        }

        case 'kick': {
          const targetId = cleanId(args[0]);
          if (!targetId) {
            isSuccess = false;
            resultOutput = 'Usage: kick <userId|mention> [reason]';
            break;
          }
          const reason = args.slice(1).join(' ') || 'Executed via Master SOC CLI';
          const res = await ModerationService.kickUser(targetGuild, targetId, reason, message.author.id);
          isSuccess = res.success;
          resultOutput = res.message;
          break;
        }

        case 'ban': {
          const targetId = cleanId(args[0]);
          if (!targetId) {
            isSuccess = false;
            resultOutput = 'Usage: ban <userId|mention> [reason]';
            break;
          }
          const reason = args.slice(1).join(' ') || 'Executed via Master SOC CLI';
          const res = await ModerationService.banUser(targetGuild, targetId, reason, 0, message.author.id);
          isSuccess = res.success;
          resultOutput = res.message;
          break;
        }

        case 'unban': {
          const targetId = cleanId(args[0]);
          if (!targetId) {
            isSuccess = false;
            resultOutput = 'Usage: unban <userId> [reason]';
            break;
          }
          const reason = args.slice(1).join(' ') || 'Executed via Master SOC CLI';
          const res = await ModerationService.unbanUser(targetGuild, targetId, reason);
          isSuccess = res.success;
          resultOutput = res.message;
          break;
        }

        case 'warn': {
          const targetId = cleanId(args[0]);
          const reason = args.slice(1).join(' ');
          if (!targetId || !reason) {
            isSuccess = false;
            resultOutput = 'Usage: warn <userId|mention> <reason>';
            break;
          }
          const res = await ModerationService.warnUser(targetGuild, targetId, reason, message.author.id);
          isSuccess = res.success;
          resultOutput = res.message;
          break;
        }

        case 'timeout': {
          const targetId = cleanId(args[0]);
          const minutes = parseInt(args[1], 10);
          const reason = args.slice(2).join(' ') || 'Executed via Master SOC CLI';
          if (!targetId || isNaN(minutes) || minutes <= 0) {
            isSuccess = false;
            resultOutput = 'Usage: timeout <userId|mention> <minutes> [reason]';
            break;
          }
          const res = await ModerationService.timeoutUser(targetGuild, targetId, minutes, reason, message.author.id);
          isSuccess = res.success;
          resultOutput = res.message;
          break;
        }

        case 'purge': {
          const count = parseInt(args[0], 10);
          if (isNaN(count) || count <= 0) {
            isSuccess = false;
            resultOutput = 'Usage: purge <number 1-100>';
            break;
          }
          // Purge in target guild's system or first text channel
          const targetChannel = (targetGuild.systemChannel || targetGuild.channels.cache.find(c => c.isTextBased())) as TextChannel | undefined;
          if (!targetChannel) {
            isSuccess = false;
            resultOutput = 'No accessible text channel found on target server to purge.';
            break;
          }
          const res = await ModerationService.purgeMessages(targetChannel, count);
          isSuccess = res.success;
          resultOutput = res.message;
          break;
        }

        case 'security': {
          const state = args[0]?.toLowerCase();
          const config = await getOrCreateGuildConfig(targetGuild.id);
          if (state === 'on') {
            await updateGuildConfig(targetGuild.id, { antiNukeEnabled: true, antiRaidEnabled: true });
            resultOutput = `🛡️ Security shields for **${targetGuild.name}** switched to: ALL SYSTEMS ONLINE (Anti-Nuke & Anti-Raid Active).`;
          } else if (state === 'off') {
            await updateGuildConfig(targetGuild.id, { antiNukeEnabled: false, antiRaidEnabled: false });
            resultOutput = `⚠️ Security shields for **${targetGuild.name}** switched to: OFFLINE.`;
          } else {
            resultOutput =
              `CURRENT SHIELD STATUS [${targetGuild.name}]:\n` +
              `  • Anti-Nuke: ${config.antiNukeEnabled ? 'ENABLED [ON]' : 'DISABLED [OFF]'}\n` +
              `  • Anti-Raid: ${config.antiRaidEnabled ? 'ENABLED [ON]' : 'DISABLED [OFF]'}\n` +
              `  • Lockdown:  ${config.isLockedDown ? 'ACTIVE' : 'NORMAL'}\n` +
              `Usage to change: security on | security off`;
          }
          break;
        }

        case 'honeypot': {
          const trapChannel = await SecurityShieldService.provisionHoneypotChannel(targetGuild);
          isSuccess = true;
          resultOutput =
            `🍯 HONEYPOT TRAP DEPLOYED [${targetGuild.name}]:\n` +
            `  • Channel:  <#${trapChannel.id}> (${trapChannel.name})\n` +
            `  • Status:   ACTIVE & MONITORING\n` +
            `  • Policy:   Instant 24h Purge Ban + Fleet-wide Global Threat Neutralization`;
          break;
        }

        case 'minage': {
          const days = parseInt(args[0], 10);
          if (isNaN(days) || days < 0) {
            isSuccess = false;
            resultOutput = 'Usage: minage <days> (e.g. minage 1 or minage 7)';
            break;
          }

          await updateGuildConfig(targetGuild.id, { minAccountAgeDays: days });
          isSuccess = true;
          resultOutput = `🛡️ Anti-Alt Raid Gatekeeper threshold set to ${days} day(s) for **${targetGuild.name}**. Accounts younger than this will be quarantined upon join.`;
          break;
        }

        case 'serverinfo': {
          const infoEmbed = await ModerationService.getServerInfoEmbed(targetGuild);
          await message.reply({ embeds: [infoEmbed] });
          return;
        }

        case 'userinfo': {
          const targetId = cleanId(args[0]);
          if (!targetId) {
            isSuccess = false;
            resultOutput = 'Usage: userinfo <userId|mention>';
            break;
          }
          const user = await client.users.fetch(targetId).catch(() => null);
          if (!user) {
            isSuccess = false;
            resultOutput = `Could not resolve user ID: ${targetId}`;
            break;
          }
          const member = await targetGuild.members.fetch(targetId).catch(() => null);
          const userEmbed = await ModerationService.getUserInfoEmbed(targetGuild, user, member);
          await message.reply({ embeds: [userEmbed] });
          return;
        }

        case 'giverole': {
          let targetId = '';
          let roleArg = '';

          // Support syntax: giverole user:<userId> role:<roleId> OR giverole <userId> <roleId>
          const userNamed = args.find(a => a.toLowerCase().startsWith('user:'));
          const roleNamed = args.find(a => a.toLowerCase().startsWith('role:'));

          if (userNamed && roleNamed) {
            targetId = cleanId(userNamed.split(':')[1]);
            roleArg = cleanId(roleNamed.split(':')[1]);
          } else {
            targetId = cleanId(args[0]);
            roleArg = args.slice(1).join(' ');
          }

          if (!targetId || !roleArg) {
            isSuccess = false;
            resultOutput = 'Usage: giverole user:<userId> role:<roleId> OR giverole <userId> <roleId>';
            break;
          }
          const res = await ModerationService.assignRole(targetGuild, targetId, cleanId(roleArg) || roleArg);
          isSuccess = res.success;
          resultOutput = res.message;
          break;
        }

        case 'case': {
          const rawId = cleanId(args[0]).replace(/^case[-_]?/i, '');
          const caseId = parseInt(rawId, 10);
          if (isNaN(caseId)) {
            isSuccess = false;
            resultOutput = 'Usage: case <caseId> (e.g. case 1 or case #CASE-1)';
            break;
          }

          const forensicCase = await StrikeService.getCase(caseId);
          if (!forensicCase) {
            isSuccess = false;
            resultOutput = `Forensic Case #CASE-${caseId} not found in the security ledger.`;
            break;
          }

          isSuccess = true;
          resultOutput =
            `FORENSIC CASE DOSSIER [#CASE-${forensicCase.caseId}]:\n` +
            `  • Target:       ${forensicCase.targetTag} (${forensicCase.targetId})\n` +
            `  • Target Guild: ${forensicCase.guildId}\n` +
            `  • Action Taken: ${forensicCase.action}\n` +
            `  • Moderator ID: ${forensicCase.moderatorId}\n` +
            `  • Reason:       ${forensicCase.reason}\n` +
            `  • Created At:   ${forensicCase.createdAt.toISOString()}` +
            (forensicCase.evidenceJson ? `\n  • Evidence:     ${forensicCase.evidenceJson}` : '');
          break;
        }

        case 'strikes': {
          const targetId = cleanId(args[0]);
          if (!targetId) {
            isSuccess = false;
            resultOutput = 'Usage: strikes <userId|mention>';
            break;
          }

          const strikeCount = await StrikeService.getUserStrikes(targetGuild.id, targetId);
          const strikeRecord = await StrikeService.getUserStrikeRecord(targetGuild.id, targetId);
          isSuccess = true;
          resultOutput =
            `5-STRIKE DOSSIER [${targetGuild.name}]:\n` +
            `  • User ID:       ${targetId}\n` +
            `  • Active Strikes: ${strikeCount}/5\n` +
            `  • Last Infraction:${strikeRecord ? ` ${strikeRecord.lastStrikeAt.toISOString()}` : ' None'}\n` +
            `  • Status:        ${strikeCount >= 5 ? 'PERMANENTLY BANNED' : strikeCount > 0 ? 'ACTIVE AUTO-ESCALATION' : 'CLEAN RECORD'}`;
          break;
        }

        case 'clearstrikes': {
          const targetId = cleanId(args[0]);
          if (!targetId) {
            isSuccess = false;
            resultOutput = 'Usage: clearstrikes <userId|mention>';
            break;
          }

          await StrikeService.clearUserStrikes(targetGuild.id, targetId);
          isSuccess = true;
          resultOutput = `✅ Strike ledger reset to 0/5 for user <@${targetId}> (${targetId}) in ${targetGuild.name}.`;
          break;
        }

        case 'globalban': {
          const targetId = cleanId(args[0]);
          if (!targetId) {
            isSuccess = false;
            resultOutput = 'Usage: globalban <userId|mention> [reason]';
            break;
          }

          const reason = args.slice(1).join(' ') || 'Flagged as global hostile entity via Master SOC CLI';
          const targetUser = await client.users.fetch(targetId).catch(() => null);
          const userTag = targetUser?.tag || targetId;

          const res = await GlobalThreatService.flagAndGlobalBan(
            client,
            targetId,
            userTag,
            reason,
            targetGuild.id,
            'CRITICAL'
          );

          if (!res.blacklisted) {
            isSuccess = false;
            resultOutput = `Target <@${targetId}> is immune to global banishment (${res.reason}).`;
            break;
          }

          isSuccess = true;
          resultOutput =
            `🌐 GLOBAL THREAT NEUTRALIZATION COMPLETE [#CASE-${res.caseId}]:\n` +
            `  • Target:        ${userTag} (${targetId})\n` +
            `  • Blacklist:     ENABLED [CRITICAL]\n` +
            `  • Fleet Banned:  ${res.bannedGuildsCount} server(s)\n` +
            `  • Reason:        ${reason}\n` +
            `  • Origin Server: ${targetGuild.name} (${targetGuild.id})`;
          break;
        }

        case 'globalunban': {
          const targetId = cleanId(args[0]);
          if (!targetId) {
            isSuccess = false;
            resultOutput = 'Usage: globalunban <userId|mention> [reason]';
            break;
          }

          const reason = args.slice(1).join(' ') || 'Pardoned by Master SOC Administrator';
          const res = await GlobalThreatService.globalUnban(client, targetId, reason);

          isSuccess = true;
          resultOutput =
            `🌐 GLOBAL PARDON EXECUTED:\n` +
            `  • Target ID:       ${targetId}\n` +
            `  • Blacklist:       REMOVED\n` +
            `  • Fleet Unbanned:  ${res.unbannedGuildsCount} server(s)\n` +
            `  • Reason:          ${reason}`;
          break;
        }

        case 'blacklist': {
          const list = await GlobalThreatService.listBlacklist();
          isSuccess = true;
          if (list.length === 0) {
            resultOutput = 'GLOBAL BLACKLIST LEDGER:\n  • No active global threats registered in ledger.';
          } else {
            const lines = list.map((item, idx) =>
              `  ${idx + 1}. [${item.severity}] ${item.userTag || item.userId} (${item.userId})\n     Reason: ${item.reason} | Origin Guild: ${item.flaggedGuildId}`
            );
            resultOutput = `GLOBAL THREAT INTELLIGENCE BLACKLIST (${list.length} actors):\n${lines.join('\n')}`;
          }
          break;
        }

        default:
          isSuccess = false;
          resultOutput = `Unknown terminal command: "${command}". Type "help" to view available SOC commands.`;
          break;
      }
    } catch (err: any) {
      isSuccess = false;
      resultOutput = `FATAL ERROR: ${err?.message || err}`;
    }

    const terminalEmbed = new EmbedBuilder()
      .setTitle(`💻 SOC CLI EXECUTION // [${command.toUpperCase()}]`)
      .setColor(isSuccess ? CONFIG.SUCCESS_COLOR : CONFIG.DANGER_COLOR)
      .setDescription(`\`\`\`bash\n# Target: ${targetGuild.name} (${targetGuild.id})\n$ ${content}\n\n${resultOutput}\n\`\`\``)
      .setFooter({ text: `ROOT TERMINAL // ${message.author.tag} | Timestamp: ${new Date().toISOString()}` });

    await message.reply({ embeds: [terminalEmbed] });
  }
}
