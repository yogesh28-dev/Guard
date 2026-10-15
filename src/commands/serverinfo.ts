import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { ModerationService } from '../services/moderationService';

export const serverinfo = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Display detailed server telemetry and security profile')
    .setDefaultMemberPermissions(0n),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    await interaction.deferReply();
    const embed = await ModerationService.getServerInfoEmbed(interaction.guild);
    await interaction.editReply({ embeds: [embed] });
  },
};
