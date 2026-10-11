import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { updateGuildConfig } from '../db';

export const byebyeactivate = {
  data: new SlashCommandBuilder()
    .setName('byebyeactivate')
    .setDescription('Configure or activate the Twilight Goodbye Card channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Target channel to dispatch goodbye cards (defaults to current channel)')
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
      byeChannelId: channel.id,
    });

    await interaction.reply({
      content: `🌌 **GUARD PROTOCOL ACTIVATED**: Twilight Departure Cards will now be dispatched to <#${channel.id}>.`,
    });
  },
};
