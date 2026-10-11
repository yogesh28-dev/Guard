import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { ModerationService } from '../services/moderationService';

export const userinfo = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Display security dossier and profile for a user')
    .addUserOption(option =>
      option.setName('user').setDescription('Target user to inspect (defaults to yourself)').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const user = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    await interaction.deferReply();
    const embed = await ModerationService.getUserInfoEmbed(interaction.guild, user, member);
    await interaction.editReply({ embeds: [embed] });
  },
};
