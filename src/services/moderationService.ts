import {
  Guild,
  User,
  GuildMember,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
  Role,
  EmbedBuilder,
} from 'discord.js';
import { updateGuildConfig, getOrCreateGuildConfig } from '../db';
import { CONFIG } from '../config';
import { StrikeService } from './strikeService';

export interface ModerationResult {
  success: boolean;
  message: string;
  data?: any;
  caseId?: number;
}

export class ModerationService {
  /**
   * Ban a user from the target guild and register a forensic ModerationCase
   */
  public static async banUser(
    guild: Guild,
    userId: string,
    reason: string = 'No reason provided',
    deleteMessageDays: number = 0,
    moderatorId?: string
  ): Promise<ModerationResult> {
    try {
      await guild.bans.create(userId, {
        reason: `[GUARD SOC] ${reason}`,
        deleteMessageSeconds: deleteMessageDays * 24 * 60 * 60,
      });

      const user = await guild.client.users.fetch(userId).catch(() => null);
      const targetTag = user ? user.tag : userId;

      const forensicCase = await StrikeService.createForensicCase({
        guildId: guild.id,
        targetId: userId,
        targetTag,
        moderatorId: moderatorId || guild.client.user?.id || 'SYSTEM',
        action: 'BAN',
        reason,
        client: guild.client,
      });

      return {
        success: true,
        message: `Successfully banned user <@${userId}> (ID: ${userId}) for: ${reason} [#CASE-${forensicCase.caseId}]`,
        caseId: forensicCase.caseId,
        data: { case: forensicCase },
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to ban user: ${error?.message || error}`,
      };
    }
  }

  /**
   * Unban a user from the target guild
   */
  public static async unbanUser(
    guild: Guild,
    userId: string,
    reason: string = 'No reason provided'
  ): Promise<ModerationResult> {
    try {
      await guild.bans.remove(userId, `[GUARD SOC] ${reason}`);
      return {
        success: true,
        message: `Successfully unbanned user ID: ${userId}`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to unban user: ${error?.message || error}`,
      };
    }
  }

  /**
   * Kick a member from the target guild and register a forensic ModerationCase
   */
  public static async kickUser(
    guild: Guild,
    userId: string,
    reason: string = 'No reason provided',
    moderatorId?: string
  ): Promise<ModerationResult> {
    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        return {
          success: false,
          message: `User <@${userId}> is not a member of this guild.`,
        };
      }
      if (!member.kickable) {
        return {
          success: false,
          message: `Cannot kick user <@${userId}>: insufficient bot permissions or role hierarchy.`,
        };
      }

      await member.kick(`[GUARD SOC] ${reason}`);

      const forensicCase = await StrikeService.createForensicCase({
        guildId: guild.id,
        targetId: userId,
        targetTag: member.user?.tag || member.user?.username || userId,
        moderatorId: moderatorId || guild.client.user?.id || 'SYSTEM',
        action: 'KICK',
        reason,
        client: guild.client,
      });

      return {
        success: true,
        message: `Successfully kicked member <@${userId}> for: ${reason} [#CASE-${forensicCase.caseId}]`,
        caseId: forensicCase.caseId,
        data: { case: forensicCase },
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to kick member: ${error?.message || error}`,
      };
    }
  }

  /**
   * Timeout a member in minutes and register a forensic ModerationCase
   */
  public static async timeoutUser(
    guild: Guild,
    userId: string,
    durationMinutes: number,
    reason: string = 'No reason provided',
    moderatorId?: string
  ): Promise<ModerationResult> {
    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        return {
          success: false,
          message: `User <@${userId}> is not a member of this guild.`,
        };
      }
      if (!member.moderatable) {
        return {
          success: false,
          message: `Cannot timeout user <@${userId}>: bot lacks permissions or role hierarchy blocks action.`,
        };
      }

      const milliseconds = durationMinutes * 60 * 1000;
      await member.timeout(milliseconds, `[GUARD SOC] ${reason}`);

      const forensicCase = await StrikeService.createForensicCase({
        guildId: guild.id,
        targetId: userId,
        targetTag: member.user?.tag || member.user?.username || userId,
        moderatorId: moderatorId || guild.client.user?.id || 'SYSTEM',
        action: 'TIMEOUT',
        reason: `${reason} (${durationMinutes}m timeout)`,
        client: guild.client,
      });

      return {
        success: true,
        message: `Applied ${durationMinutes}m timeout to <@${userId}> for: ${reason} [#CASE-${forensicCase.caseId}]`,
        caseId: forensicCase.caseId,
        data: { case: forensicCase },
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to timeout member: ${error?.message || error}`,
      };
    }
  }

  /**
   * Issue a security warning or auto-strike escalation to a user
   */
  public static async warnUser(
    guild: Guild,
    userId: string,
    reason: string,
    moderatorId?: string
  ): Promise<ModerationResult> {
    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        const strikeResult = await StrikeService.issueStrike(
          guild,
          member,
          moderatorId || guild.client.user?.id || 'SYSTEM',
          reason
        );

        return {
          success: true,
          message: `⚠️ **STRIKE RECORDED** [#CASE-${strikeResult.caseId}]\n• Target: <@${userId}>\n• Strike Progression: **${strikeResult.strikeCount}/5**\n• Penalty Enforced: **${strikeResult.penaltyApplied}**\n• Reason: ${reason}`,
          caseId: strikeResult.caseId,
          data: strikeResult,
        };
      }

      const user = await guild.client.users.fetch(userId).catch(() => null);
      if (!user) {
        return { success: false, message: `Could not find user with ID ${userId}.` };
      }

      const forensicCase = await StrikeService.createForensicCase({
        guildId: guild.id,
        targetId: userId,
        targetTag: user.tag || userId,
        moderatorId: moderatorId || guild.client.user?.id || 'SYSTEM',
        action: 'WARN',
        reason,
        client: guild.client,
      });

      return {
        success: true,
        message: `Warning recorded for <@${userId}>: ${reason} [#CASE-${forensicCase.caseId}]`,
        caseId: forensicCase.caseId,
        data: { case: forensicCase },
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to warn user: ${error?.message || error}`,
      };
    }
  }

  /**
   * Lockdown all public text channels in a guild
   */
  public static async lockdownGuild(
    guild: Guild,
    reason: string = 'Emergency Protocol Activated'
  ): Promise<ModerationResult> {
    try {
      const everyoneRole = guild.roles.everyone;
      let lockedCount = 0;

      const channels = await guild.channels.fetch();
      for (const [, channel] of channels) {
        if (
          channel &&
          channel.type === ChannelType.GuildText &&
          channel.permissionsFor(guild.members.me || guild.client.user!.id)?.has(PermissionFlagsBits.ManageChannels)
        ) {
          await channel.permissionOverwrites.edit(everyoneRole, {
            SendMessages: false,
            AddReactions: false,
          }, { reason: `[GUARD LOCKDOWN] ${reason}` }).catch(() => null);
          lockedCount++;
        }
      }

      await updateGuildConfig(guild.id, { isLockedDown: true });

      return {
        success: true,
        message: `🚨 Emergency lockdown initiated. Restricted permissions across ${lockedCount} text channels.`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to execute lockdown: ${error?.message || error}`,
      };
    }
  }

  /**
   * Unlock all public text channels in a guild
   */
  public static async unlockdownGuild(
    guild: Guild,
    reason: string = 'Emergency Protocol Deactivated'
  ): Promise<ModerationResult> {
    try {
      const everyoneRole = guild.roles.everyone;
      let unlockedCount = 0;

      const channels = await guild.channels.fetch();
      for (const [, channel] of channels) {
        if (
          channel &&
          channel.type === ChannelType.GuildText &&
          channel.permissionsFor(guild.members.me || guild.client.user!.id)?.has(PermissionFlagsBits.ManageChannels)
        ) {
          await channel.permissionOverwrites.edit(everyoneRole, {
            SendMessages: null,
            AddReactions: null,
          }, { reason: `[GUARD UNLOCKDOWN] ${reason}` }).catch(() => null);
          unlockedCount++;
        }
      }

      await updateGuildConfig(guild.id, { isLockedDown: false });

      return {
        success: true,
        message: `✅ Lockdown lifted. Restored normal permissions across ${unlockedCount} text channels.`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to lift lockdown: ${error?.message || error}`,
      };
    }
  }

  /**
   * Purge messages from a text channel
   */
  public static async purgeMessages(
    channel: TextChannel,
    amount: number
  ): Promise<ModerationResult> {
    try {
      const count = Math.min(Math.max(amount, 1), 100);
      const deleted = await channel.bulkDelete(count, true);
      return {
        success: true,
        message: `Successfully purged ${deleted.size} messages in <#${channel.id}>.`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to purge messages: ${error?.message || error}`,
      };
    }
  }

  /**
   * Assign or remove a role remotely
   */
  public static async assignRole(
    guild: Guild,
    userId: string,
    roleIdOrName: string
  ): Promise<ModerationResult> {
    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        return { success: false, message: `Member with ID ${userId} not found in ${guild.name}.` };
      }

      const role = guild.roles.cache.get(roleIdOrName) ||
        guild.roles.cache.find(r => r.name.toLowerCase() === roleIdOrName.toLowerCase());

      if (!role) {
        return { success: false, message: `Role "${roleIdOrName}" not found in ${guild.name}.` };
      }

      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role, '[GUARD REMOTE ASSIGNMENT] Role Revoked');
        return {
          success: true,
          message: `Removed role **${role.name}** from <@${userId}> in **${guild.name}**.`,
        };
      } else {
        await member.roles.add(role, '[GUARD REMOTE ASSIGNMENT] Role Granted');
        return {
          success: true,
          message: `Granted role **${role.name}** to <@${userId}> in **${guild.name}**.`,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to modify role: ${error?.message || error}`,
      };
    }
  }

  /**
   * Clone server channels and roles to a backup snapshot structure
   */
  public static async cloneServer(guild: Guild): Promise<ModerationResult> {
    try {
      const channels = guild.channels.cache.map(c => ({
        name: c.name,
        type: c.type,
        parent: c.parent?.name || null,
        position: 'position' in c ? (c as any).position : 0,
      }));

      const roles = guild.roles.cache.map(r => ({
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        permissions: r.permissions.bitfield.toString(),
        position: r.position,
      }));

      return {
        success: true,
        message: `Cloned structure for **${guild.name}**: ${channels.length} channels and ${roles.length} roles snapshotted.`,
        data: { channels, roles },
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to clone server: ${error?.message || error}`,
      };
    }
  }

  /**
   * Get formatted Server Info embed
   */
  public static async getServerInfoEmbed(guild: Guild): Promise<EmbedBuilder> {
    const owner = await guild.fetchOwner().catch(() => null);
    const memberCount = guild.memberCount;
    const channels = guild.channels.cache;
    const textChannels = channels.filter(c => c.type === ChannelType.GuildText).size;
    const voiceChannels = channels.filter(c => c.type === ChannelType.GuildVoice).size;
    const categories = channels.filter(c => c.type === ChannelType.GuildCategory).size;
    const rolesCount = guild.roles.cache.size;
    const config = await getOrCreateGuildConfig(guild.id);

    return new EmbedBuilder()
      .setTitle(`🛡️ GUARD SOC // SERVER INTELLIGENCE: ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }) || null)
      .setColor(CONFIG.CYBERPUNK_CYAN)
      .addFields(
        { name: '🆔 Server ID', value: `\`${guild.id}\``, inline: true },
        { name: '👑 Server Owner', value: owner ? `<@${owner.id}> (${owner.user.tag})` : 'Unknown', inline: true },
        { name: '📅 Created At', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
        { name: '👥 Members', value: `\`${memberCount.toLocaleString()}\``, inline: true },
        { name: '📁 Channels', value: `Total: \`${channels.size}\` (💬 \`${textChannels}\` | 🔊 \`${voiceChannels}\` | 📂 \`${categories}\`)`, inline: true },
        { name: '🎭 Roles', value: `\`${rolesCount}\``, inline: true },
        { name: '🚀 Boost Level', value: `Tier ${guild.premiumTier} (\`${guild.premiumSubscriptionCount || 0}\` boosts)`, inline: true },
        { name: '🔐 Anti-Nuke', value: config.antiNukeEnabled ? '🟢 ACTIVE' : '🔴 DISABLED', inline: true },
        { name: '🛡️ Anti-Raid', value: config.antiRaidEnabled ? '🟢 ACTIVE' : '🔴 DISABLED', inline: true },
        { name: '🔒 Lockdown Status', value: config.isLockedDown ? '🚨 ACTIVE' : '🟢 NORMAL', inline: true }
      )
      .setFooter({ text: `GUARD Enterprise SOC | ID: ${guild.id}` })
      .setTimestamp();
  }

  /**
   * Get formatted User Info embed
   */
  public static async getUserInfoEmbed(guild: Guild, user: User, member?: GuildMember | null): Promise<EmbedBuilder> {
    const roles = member ? member.roles.cache.filter(r => r.id !== guild.id).map(r => r.name).join(', ') : 'None';
    const isOwner = guild.ownerId === user.id;

    const embed = new EmbedBuilder()
      .setTitle(`👤 IDENTITY DOSSIER: ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setColor(CONFIG.CYBERPUNK_PURPLE)
      .addFields(
        { name: '🆔 User ID', value: `\`${user.id}\``, inline: true },
        { name: '🤖 Bot Account', value: user.bot ? 'Yes' : 'No', inline: true },
        { name: '👑 Server Owner', value: isOwner ? '🌟 YES' : 'No', inline: true },
        { name: '📅 Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
      );

    if (member) {
      embed.addFields(
        { name: '📥 Joined Server', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
        { name: '🎭 Highest Role', value: member.roles.highest.name, inline: true },
        { name: '🏷️ Assigned Roles', value: roles.length > 500 ? roles.substring(0, 497) + '...' : (roles || 'None'), inline: false }
      );
    }

    embed.setFooter({ text: 'GUARD Intelligence Dossier' }).setTimestamp();
    return embed;
  }
}
