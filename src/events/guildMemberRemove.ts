import { GuildMember, TextChannel, AttachmentBuilder, EmbedBuilder, PartialGuildMember } from 'discord.js';
import { getOrCreateGuildConfig } from '../db';
import { CanvasCardService } from '../services/canvasCardService';
import { MasterSocService } from '../services/masterSocService';
import { CONFIG } from '../config';

export async function onGuildMemberRemove(member: GuildMember | PartialGuildMember): Promise<void> {
  const guild = member.guild;

  try {
    const config = await getOrCreateGuildConfig(guild.id);

    // 1. Dispatch Goodbye Card if byeChannelId is configured
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
        });

        const attachment = new AttachmentBuilder(cardBuffer, { name: 'goodbye-card.png' });
        await byeChannel.send({
          content: `**${member.user?.username || 'A member'}** has left the server. 🌌`,
          files: [attachment],
        }).catch(err => console.error(`[BYE DISPATCH ERROR] Channel ${byeChannel.id}:`, err));
      }
    }

    // 2. Dispatch to Master SOC Audit Log
    const auditEmbed = new EmbedBuilder()
      .setTitle('🚪 MEMBER DEPARTED')
      .setColor(CONFIG.DANGER_COLOR)
      .setDescription(
        `User <@${member.id}> (${member.user?.tag || 'Unknown'}) left **${guild.name}**.\n` +
        `• Remaining Population: \`${guild.memberCount}\``
      )
      .setThumbnail(member.user?.displayAvatarURL({ size: 128 }) || null)
      .setTimestamp();

    await MasterSocService.logAudit(guild.client, guild.id, auditEmbed);
  } catch (error) {
    console.error(`[MEMBER REMOVE ERROR] Guild ${guild.id}:`, error);
  }
}
