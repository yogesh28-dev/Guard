import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import { ModerationService } from '../services/moderationService';

export const warn = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a formal security warning to a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName('user').setDescription('The member to warn').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for the security warning').setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    await interaction.deferReply();
    const result = await ModerationService.warnUser(
      interaction.guild,
      user.id,
      `${reason} (Issued by ${interaction.user.tag})`
    );

    await interaction.editReply({ content: result.message });
  },
};
