import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { updateGuildConfig } from '../db';

export const auditlogactivate = {
  data: new SlashCommandBuilder()
    .setName('auditlogactivate')
    .setDescription('Configure or activate the Audit Log dispatch channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Target channel to dispatch audit security logs (defaults to current channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;

    const channel = interaction.options.getChannel('channel') || interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: '❌ Invalid channel selected. Please choose a valid text channel.',
        ephemeral: true,
      });
      return;
    }

    await updateGuildConfig(interaction.guildId, {
      logChannelId: channel.id,
    });

    await interaction.reply({
      content: `🛡️ **GUARD PROTOCOL ACTIVATED**: Target Audit Logs will now be recorded to <#${channel.id}>.`,
    });
  },
};
