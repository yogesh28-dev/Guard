import {
  Client,
  EmbedBuilder,
  TextChannel,
  ChannelType,
} from 'discord.js';
import { prisma } from '../db';
import { GlobalBlacklist } from '@prisma/client';
import { CONFIG, isMasterOwner } from '../config';
import { StrikeService } from './strikeService';
import { MasterSocService } from './masterSocService';

export interface GlobalBanResult {
  blacklisted: boolean;
  bannedGuildsCount: number;
  caseId?: number;
  reason?: string;
}

export interface GlobalUnbanResult {
  unbannedGuildsCount: number;
}

export class GlobalThreatService {
  /**
   * Fast lookup returning the GlobalBlacklist record if present, or null.
   */
  public static async isBlacklisted(userId: string): Promise<GlobalBlacklist | null> {
    return await prisma.globalBlacklist.findUnique({
      where: { userId },
    });
  }

  /**
   * Flag an actor as a global threat, record to GlobalBlacklist in SQLite,
   * ban across all protected target guilds in client cache, create a forensic case,
   * and broadcast high-priority threat telemetry to Master SOC.
   */
  public static async flagAndGlobalBan(
    client: Client,
    userId: string,
    userTag: string | null | undefined,
    reason: string,
    originGuildId: string,
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | string = 'CRITICAL'
  ): Promise<GlobalBanResult> {
    // Immunity: Never blacklist the Master Owner or the bot itself
    if (userId === CONFIG.MASTER_OWNER_ID || isMasterOwner(userId) || userId === client.user?.id) {
      console.warn(`[THREAT NETWORK IMMUNITY] Blocked attempt to blacklist Super Owner or Bot: ${userId}`);
      return { blacklisted: false, bannedGuildsCount: 0, reason: 'TARGET_IMMUNE' };
    }

    const resolvedTag = userTag || userId;

    // 1. Upsert into GlobalBlacklist in SQLite
    await prisma.globalBlacklist.upsert({
      where: { userId },
      create: {
        userId,
        userTag: resolvedTag,
        reason,
        flaggedGuildId: originGuildId,
        severity,
      },
      update: {
        userTag: resolvedTag,
        reason,
        flaggedGuildId: originGuildId,
        severity,
        createdAt: new Date(),
      },
    });

    // 2. Iterate through all guilds in client cache and ban safely
    let bannedGuildsCount = 0;
    for (const [, guild] of client.guilds.cache) {
      try {
        if (typeof guild.bans?.create === 'function') {
          await guild.bans.create(userId, {
            reason: `[GUARD GLOBAL THREAT NETWORK] ${reason}`,
          });
          bannedGuildsCount++;
        } else if (typeof (guild.members as any)?.ban === 'function') {
          await (guild.members as any).ban(userId, {
            reason: `[GUARD GLOBAL THREAT NETWORK] ${reason}`,
          });
          bannedGuildsCount++;
        }
      } catch {
        // Silently catch permission or hierarchy exceptions
      }
    }

    // 3. Create Forensic ModerationCase
    const forensicCase = await StrikeService.createForensicCase({
      guildId: originGuildId,
      targetId: userId,
      targetTag: resolvedTag,
      moderatorId: client.user?.id || 'GLOBAL_THREAT_NETWORK',
      action: 'GLOBAL_BAN',
      reason: `[Severity: ${severity}] ${reason} (Banned across ${bannedGuildsCount} servers)`,
      evidenceJson: JSON.stringify({
        originGuildId,
        severity,
        bannedGuildsCount,
        totalFleetGuilds: client.guilds.cache.size,
      }),
      client,
    });

    // 4. Dispatch high-priority threat broadcast embed to Master SOC
    try {
      const broadcastEmbed = new EmbedBuilder()
        .setTitle(`🌐 GLOBAL THREAT BROADCAST // #CASE-${forensicCase.caseId}`)
        .setColor(CONFIG.DANGER_COLOR)
        .setDescription(
          `**THREAT NEUTRALIZATION REPORT:** A hostile entity has been globally blacklisted and banned across the GUARD Enterprise Grid.\n\n` +
          `• **Threat Actor:** <@${userId}> (\`${resolvedTag}\` | \`${userId}\`)\n` +
          `• **Severity:** \`${severity}\`\n` +
          `• **Origin Server:** \`${originGuildId}\`\n` +
          `• **Fleet Coverage:** Enforced across **${bannedGuildsCount}** server(s)\n` +
          `• **Reason:** ${reason}`
        )
        .addFields(
          { name: '📋 Forensic Case', value: `\`#CASE-${forensicCase.caseId}\``, inline: true },
          { name: '⚡ Threat Level', value: `\`${severity}\``, inline: true },
          { name: '🛡️ Grid Fleet Ban', value: `\`${bannedGuildsCount} Connected Guilds\``, inline: true }
        )
        .setFooter({ text: 'GUARD Enterprise Threat Intelligence Network' })
        .setTimestamp();

      // Route to Master Guild #bot-status
      const masterGuild = client.guilds.cache.get(CONFIG.MASTER_GUILD_ID);
      if (masterGuild && masterGuild.channels?.cache) {
        let botStatusChannel: TextChannel | undefined;
        const cache = masterGuild.channels.cache as any;
        if (typeof cache.find === 'function') {
          botStatusChannel = cache.find(
            (c: any) => c.type === ChannelType.GuildText && (c.name === 'bot-status' || c.name === '📊・bot-status')
          );
        } else if (typeof cache.values === 'function') {
          for (const c of cache.values()) {
            if (c.type === ChannelType.GuildText && (c.name === 'bot-status' || c.name === '📊・bot-status')) {
              botStatusChannel = c;
              break;
            }
          }
        }

        if (botStatusChannel) {
          await botStatusChannel.send({ embeds: [broadcastEmbed] }).catch(() => null);
        }
      }

      // Also log to origin guild's Master SOC #audit-logs
      await MasterSocService.logAuditTelemetry(client, originGuildId, 'MEMBER_LOGS', broadcastEmbed);
    } catch (err) {
      console.error('[THREAT BROADCAST ERROR]:', err);
    }

    return {
      blacklisted: true,
      bannedGuildsCount,
      caseId: forensicCase.caseId,
    };
  }

  /**
   * Remove a user from the Global Blacklist and revoke bans across all protected guilds
   */
  public static async globalUnban(
    client: Client,
    userId: string,
    reason: string = 'Global pardon granted by Super Owner'
  ): Promise<GlobalUnbanResult> {
    await prisma.globalBlacklist.deleteMany({
      where: { userId },
    });

    let unbannedGuildsCount = 0;
    for (const [, guild] of client.guilds.cache) {
      try {
        if (typeof guild.bans?.remove === 'function') {
          await guild.bans.remove(userId, `[GUARD GLOBAL THREAT UNBAN] ${reason}`);
          unbannedGuildsCount++;
        }
      } catch {
        // Silently catch if not banned in this specific guild
      }
    }

    return { unbannedGuildsCount };
  }

  /**
   * List all currently active globally blacklisted threat actors
   */
  public static async listBlacklist(): Promise<GlobalBlacklist[]> {
    return await prisma.globalBlacklist.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
