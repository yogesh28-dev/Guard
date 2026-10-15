import {
  Guild,
  GuildMember,
  Client,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { prisma } from '../db';
import { ModerationCase, UserStrike } from '@prisma/client';
import { CONFIG } from '../config';
import { MasterSocService } from './masterSocService';

export interface CreateCaseData {
  guildId: string;
  targetId: string;
  targetTag: string;
  moderatorId: string;
  action: 'WARN' | 'TIMEOUT' | 'KICK' | 'BAN' | 'QUARANTINE' | 'AUTO_STRIKE' | string;
  reason: string;
  evidenceJson?: string | null;
  client?: Client;
}

export interface StrikeResult {
  strikeCount: number;
  penaltyApplied: string;
  caseId: number;
  case: ModerationCase;
}

export class StrikeService {
  /**
   * Create a Forensic Case in SQLite, dispatch telemetry to Master SOC #audit-logs with #CASE-[caseId],
   * and return the created ModerationCase record.
   */
  public static async createForensicCase(data: CreateCaseData): Promise<ModerationCase> {
    const createdCase = await prisma.moderationCase.create({
      data: {
        guildId: data.guildId,
        targetId: data.targetId,
        targetTag: data.targetTag,
        moderatorId: data.moderatorId,
        action: data.action,
        reason: data.reason,
        evidenceJson: data.evidenceJson ?? null,
      },
    });

    // Stream to Master SOC #audit-logs with the formatted #CASE-[caseId] badge
    try {
      const client = data.client;
      if (client) {
        const embed = new EmbedBuilder()
          .setTitle(`🛡️ Moderation Case // #CASE-${createdCase.caseId}`)
          .setColor(
            createdCase.action === 'BAN'
              ? CONFIG.DANGER_COLOR
              : createdCase.action === 'TIMEOUT' || createdCase.action === 'WARN'
              ? CONFIG.WARN_COLOR
              : CONFIG.THEME_COLOR
          )
          .setDescription(`Moderation enforcement action recorded in audit log.`)
          .addFields(
            { name: '📋 Case ID', value: `\`#CASE-${createdCase.caseId}\``, inline: true },
            { name: '⚖️ Action', value: `\`${createdCase.action}\``, inline: true },
            { name: '🎯 Target', value: `<@${createdCase.targetId}> (${createdCase.targetTag} | \`${createdCase.targetId}\`)`, inline: false },
            { name: '👮 Moderator', value: `<@${createdCase.moderatorId}> (\`${createdCase.moderatorId}\`)`, inline: true },
            { name: '🌐 Server ID', value: `\`${createdCase.guildId}\``, inline: true },
            { name: '📝 Reason', value: createdCase.reason, inline: false }
          )
          .setFooter({ text: `Case #${createdCase.caseId} • GUARD Security` })
          .setTimestamp(createdCase.createdAt);

        if (createdCase.evidenceJson) {
          embed.addFields({
            name: '🔍 Forensic Evidence',
            value: `\`\`\`json\n${createdCase.evidenceJson.slice(0, 1000)}\n\`\`\``,
            inline: false,
          });
        }

        await MasterSocService.logAuditTelemetry(client, data.guildId, 'MEMBER_LOGS', embed);
      }
    } catch (err) {
      console.error(`[STRIKE SERVICE] Failed to dispatch audit log for #CASE-${createdCase.caseId}:`, err);
    }

    return createdCase;
  }

  /**
   * Issue a security strike against a member with 5-strike auto-escalation.
   * Increments strikeCount in UserStrike, determines and enforces penalty:
   *   - Strike 1: Warning + DM alert
   *   - Strike 2: 15-minute timeout (15 * 60 * 1000 ms)
   *   - Strike 3: 6-hour timeout (6 * 60 * 60 * 1000 ms)
   *   - Strike 4: 24-hour timeout (24 * 60 * 60 * 1000 ms) + strip roles with admin/moderation permissions
   *   - Strike 5+: Permanent Guild Ban (member.ban({ reason }))
   * Records a ModerationCase for the strike and returns { strikeCount, penaltyApplied, caseId, case }.
   */
  public static async issueStrike(
    guild: Guild,
    member: GuildMember,
    moderatorId: string,
    reason: string,
    evidence?: any
  ): Promise<StrikeResult> {
    // 1. Increment strike count for [guild.id, member.id]
    const userStrike = await prisma.userStrike.upsert({
      where: {
        guildId_userId: {
          guildId: guild.id,
          userId: member.id,
        },
      },
      create: {
        guildId: guild.id,
        userId: member.id,
        strikeCount: 1,
        lastStrikeAt: new Date(),
      },
      update: {
        strikeCount: { increment: 1 },
        lastStrikeAt: new Date(),
      },
    });

    const strikeCount = userStrike.strikeCount;
    let penaltyApplied = '';
    let actionType: string = 'WARN';

    // 2. Determine and apply automatic punishment
    if (strikeCount === 1) {
      actionType = 'WARN';
      penaltyApplied = 'Warning issued + DM security alert dispatched';

      const dmEmbed = new EmbedBuilder()
        .setTitle(`⚠️ Warning — ${guild.name}`)
        .setColor(CONFIG.WARN_COLOR)
        .setDescription(
          `You have received a warning in **${guild.name}** (**1/5 strikes**).\n\n` +
          `**Reason:** ${reason}\n\n` +
          `*Note: Repeated infractions will lead to timeouts and bans.*`
        )
        .setFooter({ text: 'GUARD Security' })
        .setTimestamp();

      await member.send({ embeds: [dmEmbed] }).catch(() => null);
    } else if (strikeCount === 2) {
      actionType = 'TIMEOUT';
      const durationMs = 15 * 60 * 1000;
      penaltyApplied = '15-minute communication timeout applied';

      const dmEmbed = new EmbedBuilder()
        .setTitle(`⏱️ Timed Out (15m) — ${guild.name}`)
        .setColor(CONFIG.WARN_COLOR)
        .setDescription(
          `You were timed out for 15 minutes in **${guild.name}** (**2/5 strikes**).\n\n` +
          `**Reason:** ${reason}`
        )
        .setFooter({ text: 'GUARD Security' })
        .setTimestamp();

      await member.send({ embeds: [dmEmbed] }).catch(() => null);
      if (typeof member.timeout === 'function') {
        await member.timeout(durationMs, `[GUARD AUTO-STRIKE 2/5] ${reason}`).catch(() => null);
      }
    } else if (strikeCount === 3) {
      actionType = 'TIMEOUT';
      const durationMs = 6 * 60 * 60 * 1000;
      penaltyApplied = '6-hour communication timeout applied';

      const dmEmbed = new EmbedBuilder()
        .setTitle(`⏱️ Timed Out (6h) — ${guild.name}`)
        .setColor(CONFIG.WARN_COLOR)
        .setDescription(
          `You were timed out for 6 hours in **${guild.name}** (**3/5 strikes**).\n\n` +
          `**Reason:** ${reason}`
        )
        .setFooter({ text: 'GUARD Security' })
        .setTimestamp();

      await member.send({ embeds: [dmEmbed] }).catch(() => null);
      if (typeof member.timeout === 'function') {
        await member.timeout(durationMs, `[GUARD AUTO-STRIKE 3/5] ${reason}`).catch(() => null);
      }
    } else if (strikeCount === 4) {
      actionType = 'TIMEOUT';
      const durationMs = 24 * 60 * 60 * 1000;
      penaltyApplied = '24-hour communication timeout applied & administrative/moderation roles revoked';

      // Strip administrative and moderation roles
      const strippedRoles: string[] = [];
      if (member.roles?.cache) {
        for (const [, role] of member.roles.cache) {
          if (role.id === guild.roles?.everyone?.id) continue;
          const perms = role.permissions;
          const isPrivileged =
            perms.has(PermissionFlagsBits.Administrator) ||
            perms.has(PermissionFlagsBits.ManageGuild) ||
            perms.has(PermissionFlagsBits.ManageRoles) ||
            perms.has(PermissionFlagsBits.ManageChannels) ||
            perms.has(PermissionFlagsBits.BanMembers) ||
            perms.has(PermissionFlagsBits.KickMembers) ||
            perms.has(PermissionFlagsBits.ModerateMembers) ||
            perms.has(PermissionFlagsBits.ManageMessages) ||
            perms.has(PermissionFlagsBits.ManageWebhooks);

          if (isPrivileged) {
            strippedRoles.push(role.name);
            if (typeof member.roles.remove === 'function') {
              await member.roles.remove(role.id, `[GUARD AUTO-STRIKE 4/5] Revoking privileges: ${reason}`).catch(() => null);
            }
          }
        }
      }

      const strippedNotice = strippedRoles.length > 0 ? `\n**Revoked Privileged Roles:** ${strippedRoles.join(', ')}` : '';

      const dmEmbed = new EmbedBuilder()
        .setTitle(`🚨 Final Warning (24h Timeout) — ${guild.name}`)
        .setColor(CONFIG.DANGER_COLOR)
        .setDescription(
          `You were timed out for 24 hours in **${guild.name}** (**4/5 strikes**).\n\n` +
          `**Reason:** ${reason}${strippedNotice}\n\n` +
          `*Any further infraction will result in a permanent ban.*`
        )
        .setFooter({ text: 'GUARD Security' })
        .setTimestamp();

      await member.send({ embeds: [dmEmbed] }).catch(() => null);
      if (typeof member.timeout === 'function') {
        await member.timeout(durationMs, `[GUARD AUTO-STRIKE 4/5] ${reason}`).catch(() => null);
      }
    } else {
      // Strike 5 or higher: Permanent Guild Ban
      actionType = 'BAN';
      penaltyApplied = 'Permanent Guild Ban applied';

      const dmEmbed = new EmbedBuilder()
        .setTitle(`🔨 Banned — ${guild.name}`)
        .setColor(CONFIG.DANGER_COLOR)
        .setDescription(
          `You have been permanently banned from **${guild.name}** (**5/5 strikes**).\n\n` +
          `**Reason:** ${reason}`
        )
        .setFooter({ text: 'GUARD Security' })
        .setTimestamp();

      await member.send({ embeds: [dmEmbed] }).catch(() => null);
      if (typeof member.ban === 'function') {
        await member.ban({ reason: `[GUARD AUTO-STRIKE ${strikeCount}/5] ${reason}` }).catch(() => null);
      } else if (guild.bans?.create) {
        await guild.bans.create(member.id, { reason: `[GUARD AUTO-STRIKE ${strikeCount}/5] ${reason}` }).catch(() => null);
      }
    }

    // 3. Record Forensic ModerationCase
    const evidenceStr = evidence
      ? typeof evidence === 'string'
        ? evidence
        : JSON.stringify(evidence)
      : null;

    const targetTag = member.user?.tag || member.user?.username || member.id;
    const forensicCase = await this.createForensicCase({
      guildId: guild.id,
      targetId: member.id,
      targetTag,
      moderatorId,
      action: actionType,
      reason: `[Auto-Strike ${strikeCount}/5] ${reason} (Penalty: ${penaltyApplied})`,
      evidenceJson: evidenceStr,
      client: guild.client,
    });

    return {
      strikeCount,
      penaltyApplied,
      caseId: forensicCase.caseId,
      case: forensicCase,
    };
  }

  /**
   * Retrieve a forensic case dossier by its auto-increment ID
   */
  public static async getCase(caseId: number): Promise<ModerationCase | null> {
    return await prisma.moderationCase.findUnique({
      where: { caseId },
    });
  }

  /**
   * Retrieve total strike count for a user in a target guild
   */
  public static async getUserStrikes(guildId: string, userId: string): Promise<number> {
    const record = await prisma.userStrike.findUnique({
      where: {
        guildId_userId: { guildId, userId },
      },
    });
    return record?.strikeCount ?? 0;
  }

  /**
   * Retrieve full UserStrike record for a user in a target guild
   */
  public static async getUserStrikeRecord(guildId: string, userId: string): Promise<UserStrike | null> {
    return await prisma.userStrike.findUnique({
      where: {
        guildId_userId: { guildId, userId },
      },
    });
  }

  /**
   * Reset/clear a user's strike record in a target guild
   */
  public static async clearUserStrikes(guildId: string, userId: string): Promise<boolean> {
    await prisma.userStrike.deleteMany({
      where: { guildId, userId },
    });
    return true;
  }
}
