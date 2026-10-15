import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { ModerationService } from '../services/moderationService';

export const unlockdown = {
  data: new SlashCommandBuilder()
    .setName('unlockdown')
    .setDescription('Unlock text channels back to normal')
    .setDefaultMemberPermissions(0n)
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for lifting the lockdown').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const reason = interaction.options.getString('reason') || 'Lockdown lifted';

    await interaction.deferReply();
    const result = await ModerationService.unlockdownGuild(
      interaction.guild,
      `${reason} (Unlocked by ${interaction.user.tag})`
    );

    await interaction.editReply({ content: result.message });
  },
};
