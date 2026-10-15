import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { CONFIG } from '../config';

export const about = {
  data: new SlashCommandBuilder()
    .setName('about')
    .setDescription('Learn about GUARD and invite the bot to your server.')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2]),

  async execute(interaction: ChatInputCommandInteraction) {
    const clientUser = interaction.client.user;
    const clientId = clientUser?.id || '1548766359020896397';
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;

    const embed = new EmbedBuilder()
      .setTitle('🛡️ About GUARD')
      .setColor(CONFIG.THEME_COLOR)
      .setDescription(
        'GUARD is a security and moderation bot built to protect your Discord server with automated anti-nuke, anti-raid, and moderation tools.'
      )
      .addFields(
        {
          name: '🛡️ Core Features',
          value:
            '• **Anti-Nuke & Anti-Raid**: Automatically protects channels, roles, and stops mass joins.\n' +
            '• **5-Strike Auto-Mod**: Automatically warns, mutes, or bans repeat rule breakers.\n' +
            '• **Honeypot Trap**: Instantly bans spam bots and selfbots the second they type.\n' +
            '• **Detailed Logging**: Clean real-time logs for message edits, deletes, and member actions.\n' +
            '• **Protected Voice**: Dedicated voice space with an owner moderation panel.',
          inline: false,
        },
        {
          name: '🔗 Quick Links',
          value: `[Invite GUARD to Your Server](${inviteUrl}) • [Support Server](https://discord.gg/guard)`,
          inline: false,
        }
      )
      .setFooter({ text: 'GUARD Security • Type /help to view command manual' })
      .setTimestamp();

    if (clientUser) {
      embed.setThumbnail(clientUser.displayAvatarURL({ size: 256 }));
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Invite GUARD')
        .setStyle(ButtonStyle.Link)
        .setURL(inviteUrl)
        .setEmoji('🛡️')
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  },
};
