import { GuildMember, TextChannel, AttachmentBuilder, EmbedBuilder, PartialGuildMember } from 'discord.js';
import { getOrCreateGuildConfig } from '../db';
import { CanvasCardService } from '../services/canvasCardService';
import { MasterSocService } from '../services/masterSocService';
import { AntiNukeService } from '../services/antiNukeService';
import { CONFIG } from '../config';

export async function onGuildMemberRemove(member: GuildMember | PartialGuildMember): Promise<void> {
  const guild = member.guild;

  try {
    // 1. Anti-Nuke check for mass kicks / evictions
    await AntiNukeService.handleMemberRemoveOrBan(guild, 'KICK');

    const config = await getOrCreateGuildConfig(guild.id);

    // 2. Dispatch Goodbye Card if byeChannelId is configured
    if (config.byeChannelId) {
      const byeChannel = guild.channels.cache.get(config.byeChannelId) as TextChannel | undefined;
      if (byeChannel) {
        const avatarUrl = member.user?.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }) || null;
        const cardBuffer = await CanvasCardService.generateGoodbyeCard({
          username: member.user?.username || 'Unknown',
          discriminator: member.user?.discriminator,
          avatarUrl,
          guildName: guild.name,
          memberCount: guild.memberCount,
          templateUrl: config.byeTemplateUrl,
          customTheme: config.byeTheme,
        });

        const attachment = new AttachmentBuilder(cardBuffer, { name: 'goodbye-card.png' });
        await byeChannel.send({
          content: `**${member.user?.username || 'A member'}** has left the server. 🌌`,
          files: [attachment],
        }).catch(err => console.error(`[BYE DISPATCH ERROR] Channel ${byeChannel.id}:`, err));
      }
    }

    // 3. Dispatch to Master SOC Audit Telemetry
    const auditEmbed = new EmbedBuilder()
      .setTitle('🚪 MEMBER DEPARTED')
      .setColor(CONFIG.DANGER_COLOR)
      .setDescription(
        `User <@${member.id}> (${member.user?.tag || 'Unknown'}) left **${guild.name}**.\n` +
        `• Remaining Population: \`${guild.memberCount}\``
      )
      .setThumbnail(member.user?.displayAvatarURL({ size: 128 }) || null)
      .setTimestamp();

    await MasterSocService.logAuditTelemetry(guild.client, guild.id, 'MEMBER_LOGS', auditEmbed);
  } catch (error) {
    console.error(`[MEMBER REMOVE ERROR] Guild ${guild.id}:`, error);
  }
}
