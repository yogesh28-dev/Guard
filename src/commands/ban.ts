import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { ModerationService } from '../services/moderationService';
import { CONFIG } from '../config';

export const ban = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .setDefaultMemberPermissions(0n)
    .addUserOption(option =>
      option.setName('user').setDescription('The user to ban').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for the ban').setRequired(false)
    )
    .addIntegerOption(option =>
      option
        .setName('delete_days')
        .setDescription('Days of message history to purge (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') || 0;

    await interaction.deferReply();
    const result = await ModerationService.banUser(
      interaction.guild,
      user.id,
      `${reason} (Issued by ${interaction.user.tag})`,
      deleteDays,
      interaction.user.id
    );

    if (!result.success) {
      await interaction.editReply({ content: `❌ ${result.message}` });
      return;
    }

    const caseBadge = result.caseId ? `#CASE-${result.caseId}` : 'RECORDED';
    const embed = new EmbedBuilder()
      .setTitle(`🔨 GUILD BAN ENFORCED // ${caseBadge}`)
      .setColor(CONFIG.DANGER_COLOR)
      .setDescription(`User **${user.tag}** has been banned from the server.`)
      .addFields(
        { name: '📋 Forensic Case', value: `\`${caseBadge}\``, inline: true },
        { name: '👤 Target', value: `<@${user.id}> (\`${user.id}\`)`, inline: true },
        { name: '👮 Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📝 Reason', value: reason, inline: false }
      )
      .setFooter({ text: 'GUARD Enterprise SOC // Enforcement Grid' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
