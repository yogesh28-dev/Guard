import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { ModerationService } from '../services/moderationService';

export const lockdown = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Initiate emergency server lockdown, freezing text channels for @everyone')
    .setDefaultMemberPermissions(0n)
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for emergency lockdown').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const reason = interaction.options.getString('reason') || 'Emergency Protocol Activated';

    await interaction.deferReply();
    const result = await ModerationService.lockdownGuild(
      interaction.guild,
      `${reason} (Initiated by ${interaction.user.tag})`
    );

    await interaction.editReply({ content: result.message });
  },
};
