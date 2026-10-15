import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { ModerationService } from '../services/moderationService';
import { CONFIG } from '../config';

export const timeout = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout/mute a member for a specified duration')
    .setDefaultMemberPermissions(0n)
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
      `${reason} (Issued by ${interaction.user.tag})`,
      interaction.user.id
    );

    if (!result.success) {
      await interaction.editReply({ content: `❌ ${result.message}` });
      return;
    }

    const caseBadge = result.caseId ? `#CASE-${result.caseId}` : 'RECORDED';
    const embed = new EmbedBuilder()
      .setTitle(`⏱️ TIMEOUT APPLIED // ${caseBadge}`)
      .setColor(CONFIG.WARN_COLOR)
      .setDescription(`Member **${user.tag}** has been timed out.`)
      .addFields(
        { name: '📋 Forensic Case', value: `\`${caseBadge}\``, inline: true },
        { name: '👤 Target', value: `<@${user.id}> (\`${user.id}\`)`, inline: true },
        { name: '⏳ Duration', value: `\`${duration} minutes\``, inline: true },
        { name: '👮 Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📝 Reason', value: reason, inline: false }
      )
      .setFooter({ text: 'GUARD Enterprise SOC // Enforcement Grid' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
