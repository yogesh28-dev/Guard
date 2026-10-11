import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import { ModerationService } from '../services/moderationService';

export const kick = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(option =>
      option.setName('user').setDescription('The member to kick').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for the kick').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.deferReply();
    const result = await ModerationService.kickUser(
      interaction.guild,
      user.id,
      `${reason} (Issued by ${interaction.user.tag})`
    );

    await interaction.editReply({ content: result.message });
  },
};
