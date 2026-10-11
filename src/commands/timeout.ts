import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import { ModerationService } from '../services/moderationService';

export const timeout = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout/mute a member for a specified duration')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName('user').setDescription('The member to timeout').setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('duration')
        .setDescription('Duration in minutes')
        .setMinValue(1)
        .setMaxValue(40320) // 28 days max
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for the timeout').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const user = interaction.options.getUser('user', true);
    const duration = interaction.options.getInteger('duration', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.deferReply();
    const result = await ModerationService.timeoutUser(
      interaction.guild,
      user.id,
      duration,
      `${reason} (Issued by ${interaction.user.tag})`
    );

    await interaction.editReply({ content: result.message });
  },
};
