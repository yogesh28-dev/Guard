import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { ModerationService } from '../services/moderationService';

export const unlockdown = {
  data: new SlashCommandBuilder()
    .setName('unlockdown')
    .setDescription('Lift emergency server lockdown and restore standard permissions')
    .setDefaultMemberPermissions(0n)
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for lifting lockdown').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const reason = interaction.options.getString('reason') || 'Emergency Protocol Deactivated';

    await interaction.deferReply();
    const result = await ModerationService.unlockdownGuild(
      interaction.guild,
      `${reason} (Lifted by ${interaction.user.tag})`
    );

    await interaction.editReply({ content: result.message });
  },
};
