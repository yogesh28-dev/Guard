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
    .setDescription('Learn about GUARD and get the bot invite link.')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2]),

  async execute(interaction: ChatInputCommandInteraction) {
    const clientUser = interaction.client.user;
    const clientId = clientUser?.id || '1548766359020896397';
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;

    const embed = new EmbedBuilder()
      .setTitle('🛡️ ABOUT GUARD ENTERPRISE')
      .setColor(CONFIG.CYBERPUNK_CYAN)
      .setDescription(
        'GUARD . an autonomous enterprise security & SOC bot made to provide unbypassable threat intelligence to your server . securing your infrastructure at the root , GUARD creates the safest environment with absolute zero-trust architecture and 24/7 master telemetry management !!'
      )
      .addFields(
        {
          name: '⚡ Core Features',
          value:
            '• **Zero-Trust RBAC**: Absolute ownership hierarchy & hidden command security\n' +
            '• **Anti-Nuke Engine**: Real-time channel/role restoration & rogue actor quarantine\n' +
            '• **5-Strike Escalation**: Automated penalty ladder from warning to permanent ban\n' +
            '• **Global Threat Intelligence**: Fleet-wide threat blocking & pre-emptive bans\n' +
            '• **Honeypot Trap System**: Instant 24h message purge & hostile entity neutralization',
          inline: false,
        },
        {
          name: '🔗 Quick Links',
          value: `[Invite GUARD to Your Server](${inviteUrl})`,
          inline: false,
        }
      )
      .setFooter({ text: 'Use /help to view command manual • GUARD Enterprise' })
      .setTimestamp();

    if (clientUser) {
      embed.setThumbnail(clientUser.displayAvatarURL({ size: 256 }));
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Invite GUARD to Your Server')
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
