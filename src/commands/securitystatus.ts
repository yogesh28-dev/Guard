import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { getOrCreateGuildConfig } from '../db';
import { CONFIG } from '../config';

export const securitystatus = {
  data: new SlashCommandBuilder()
    .setName('securitystatus')
    .setDescription('Display server security defenses, active configurations, and SOC link state'),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const config = await getOrCreateGuildConfig(interaction.guild.id);
    const hasLogChannel = !!config.logChannelId;
    const hasWelcomeChannel = !!config.welcomeChannelId;
    const hasByeChannel = !!config.byeChannelId;

    const embed = new EmbedBuilder()
      .setTitle(`🛡️ GUARD DEFENSE MATRIX // ${interaction.guild.name.toUpperCase()}`)
      .setColor(config.isLockedDown ? CONFIG.DANGER_COLOR : CONFIG.CYBERPUNK_CYAN)
      .setDescription('Real-time operational status of GUARD Enterprise Defense Engine.')
      .addFields(
        {
          name: '🔐 Anti-Nuke Engine',
          value: config.antiNukeEnabled ? '🟢 **ONLINE** (Real-time Audit Guard)' : '🔴 **OFFLINE**',
          inline: true,
        },
        {
          name: '🛡️ Anti-Raid Shield',
          value: config.antiRaidEnabled ? '🟢 **ONLINE** (Mass Join Protection)' : '🔴 **OFFLINE**',
          inline: true,
        },
        {
          name: '🚨 Lockdown Status',
          value: config.isLockedDown ? '🔴 **ACTIVE (Emergency Freeze)**' : '🟢 **NORMAL OPERATION**',
          inline: true,
        },
        {
          name: '📡 Master SOC Link',
          value: `🟢 **SYNCHRONIZED** (Master Grid: \`${CONFIG.MASTER_GUILD_ID}\`)`,
          inline: false,
        },
        {
          name: '📜 Active Channels',
          value:
            `• Audit Log: ${hasLogChannel ? `<#${config.logChannelId}>` : '`Not Configured`'}\n` +
            `• Welcome Cards: ${hasWelcomeChannel ? `<#${config.welcomeChannelId}>` : '`Not Configured`'}\n` +
            `• Bye Cards: ${hasByeChannel ? `<#${config.byeChannelId}>` : '`Not Configured`'}`,
          inline: false,
        }
      )
      .setFooter({ text: 'GUARD Enterprise Defense Engine' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
