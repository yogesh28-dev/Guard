import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import { ModerationService } from '../services/moderationService';

export const ban = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(option =>
      option.setName('user').setDescription('The user to ban').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for the ban').setRequired(false)
    )
    .addIntegerOption(option =>
      option
        .setName('delete_days')
        .setDescription('Days of message history to purge (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') || 0;

    await interaction.deferReply();
    const result = await ModerationService.banUser(
      interaction.guild,
      user.id,
      `${reason} (Issued by ${interaction.user.tag})`,
      deleteDays
    );

    await interaction.editReply({ content: result.message });
  },
};
