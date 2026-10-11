import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import { ModerationService } from '../services/moderationService';

export const unban = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by their user ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption(option =>
      option.setName('user_id').setDescription('The ID of the user to unban').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for the unban').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const userId = interaction.options.getString('user_id', true).trim();
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.deferReply();
    const result = await ModerationService.unbanUser(
      interaction.guild,
      userId,
      `${reason} (Issued by ${interaction.user.tag})`
    );

    await interaction.editReply({ content: result.message });
  },
};
