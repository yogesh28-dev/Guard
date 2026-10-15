import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { ModerationService } from '../services/moderationService';

export const lockdown = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Lock down text channels to prevent new messages')
    .setDefaultMemberPermissions(0n)
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for locking down the server').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const reason = interaction.options.getString('reason') || 'Server lockdown';

    await interaction.deferReply();
    const result = await ModerationService.lockdownGuild(
      interaction.guild,
      `${reason} (Locked by ${interaction.user.tag})`
    );

    await interaction.editReply({ content: result.message });
  },
};
