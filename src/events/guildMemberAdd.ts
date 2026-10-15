import { GuildMember, TextChannel, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { getOrCreateGuildConfig } from '../db';
import { CanvasCardService } from '../services/canvasCardService';
import { MasterSocService } from '../services/masterSocService';
import { SecurityShieldService } from '../services/securityShieldService';
import { GlobalThreatService } from '../services/globalThreatService';
import { CONFIG } from '../config';

export async function onGuildMemberAdd(member: GuildMember): Promise<void> {
  const guild = member.guild;

  try {
    // 0. Global Threat Intelligence Gatekeeper
    const threatRecord = await GlobalThreatService.isBlacklisted(member.id);
    if (threatRecord) {
      console.warn(`[THREAT NETWORK] Pre-emptive ban for blacklisted actor ${member.user.tag} (${member.id}) in ${guild.name}`);
      await member.ban({
        reason: `[GUARD GLOBAL THREAT NETWORK] ${threatRecord.reason} (Severity: ${threatRecord.severity})`,
      }).catch(err => console.error(`[GLOBAL BAN ERROR] Failed to ban ${member.id}:`, err));

      const auditEmbed = new EmbedBuilder()
        .setTitle('🚨 GLOBAL THREAT INTERCEPTED // PRE-EMPTIVE BAN')
        .setColor(CONFIG.DANGER_COLOR)
        .setDescription(
          `Globally blacklisted threat actor attempted to infiltrate **${guild.name}** and was neutralized immediately.\n\n` +
          `• **Target:** <@${member.id}> (\`${member.user.tag}\` | \`${member.id}\`)\n` +
          `• **Flagged In:** \`${threatRecord.flaggedGuildId}\`\n` +
          `• **Severity:** \`${threatRecord.severity}\`\n` +
          `• **Reason:** ${threatRecord.reason}\n` +
          `• **Countermeasure:** Immediate Pre-emptive Guild Ban (Welcome Dispatch Suppressed)`
        )
        .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
        .setFooter({ text: 'GUARD Global Threat Intelligence Network' })
        .setTimestamp();

      await MasterSocService.logAuditTelemetry(guild.client, guild.id, 'MEMBER_LOGS', auditEmbed);
      return;
    }

    // 1. Anti-Alt & Mass-Join Gatekeeper
    const altQuarantined = await SecurityShieldService.inspectMemberJoin(member);
    if (altQuarantined) return;

    // 2. Unauthorized Bot Shield
    if (member.user.bot) {
      await SecurityShieldService.handleBotAdd(member);
      return;
    }

    const config = await getOrCreateGuildConfig(guild.id);

    // 2. Dispatch Welcome Card if welcomeChannelId is configured
    if (config.welcomeChannelId) {
      const welcomeChannel = guild.channels.cache.get(config.welcomeChannelId) as TextChannel | undefined;
      if (welcomeChannel) {
        const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
        const cardBuffer = await CanvasCardService.generateWelcomeCard({
          username: member.user.username,
          discriminator: member.user.discriminator,
          avatarUrl,
          guildName: guild.name,
          memberCount: guild.memberCount,
          templateUrl: config.welcomeTemplateUrl,
          customTheme: config.welcomeTheme,
        });

        const attachment = new AttachmentBuilder(cardBuffer, { name: 'welcome-card.png' });
        const welcomeContent = `Hey ${member}, welcome to${member.guild.name}! 🎉\nGlad to have you here! \nEnjoy your stay! You're member #${member.guild.memberCount} ✨`;
        await welcomeChannel.send({
          content: welcomeContent,
          files: [attachment],
        }).catch(err => console.error(`[WELCOME DISPATCH ERROR] Channel ${welcomeChannel.id}:`, err));
      }
    }

    // 3. Dispatch to Master SOC Audit Telemetry
    const auditEmbed = new EmbedBuilder()
      .setTitle('👤 MEMBER JOINED')
      .setColor(CONFIG.SUCCESS_COLOR)
      .setDescription(
        `User <@${member.id}> (${member.user.tag}) joined **${guild.name}**.\n` +
        `• Account Created: <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>\n` +
        `• Total Server Population: \`${guild.memberCount}\``
      )
      .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
      .setTimestamp();

    await MasterSocService.logAuditTelemetry(guild.client, guild.id, 'MEMBER_LOGS', auditEmbed);
  } catch (error) {
    console.error(`[MEMBER ADD ERROR] Guild ${guild.id}:`, error);
  }
}
