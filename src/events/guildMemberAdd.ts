import { GuildMember, TextChannel, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { getOrCreateGuildConfig } from '../db';
import { CanvasCardService } from '../services/canvasCardService';
import { MasterSocService } from '../services/masterSocService';
import { CONFIG } from '../config';

export async function onGuildMemberAdd(member: GuildMember): Promise<void> {
  const guild = member.guild;

  try {
    const config = await getOrCreateGuildConfig(guild.id);

    // 1. Dispatch Welcome Card if welcomeChannelId is configured
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
        });

        const attachment = new AttachmentBuilder(cardBuffer, { name: 'welcome-card.png' });
        await welcomeChannel.send({
          content: `Welcome to **${guild.name}**, <@${member.id}>! ⚡`,
          files: [attachment],
        }).catch(err => console.error(`[WELCOME DISPATCH ERROR] Channel ${welcomeChannel.id}:`, err));
      }
    }

    // 2. Dispatch to Master SOC Audit Log
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

    await MasterSocService.logAudit(guild.client, guild.id, auditEmbed);
  } catch (error) {
    console.error(`[MEMBER ADD ERROR] Guild ${guild.id}:`, error);
  }
}
