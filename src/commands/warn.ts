import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { StrikeService } from '../services/strikeService';
import { CONFIG } from '../config';

export const warn = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a formal security warning to a member')
    .setDefaultMemberPermissions(0n)
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
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.editReply({ content: `❌ User <@${user.id}> is not a member of this guild.` });
      return;
    }

    const strikeRes = await StrikeService.issueStrike(
      interaction.guild,
      member,
      interaction.user.id,
      `${reason} (Issued by ${interaction.user.tag})`
    );

    const embed = new EmbedBuilder()
      .setTitle(`⚡ SECURITY STRIKE APPLIED // #CASE-${strikeRes.caseId}`)
      .setColor(strikeRes.strikeCount >= 5 ? CONFIG.DANGER_COLOR : strikeRes.strikeCount >= 2 ? CONFIG.WARN_COLOR : CONFIG.CYBERPUNK_CYAN)
      .setDescription(`Automated 5-Strike Escalation Protocol triggered for <@${user.id}>.`)
      .addFields(
        { name: '📋 Forensic Case', value: `\`#CASE-${strikeRes.caseId}\``, inline: true },
        { name: '⚠️ Strike Progression', value: `\`${strikeRes.strikeCount}/5 Strikes\``, inline: true },
        { name: '⚖️ Penalty Enforced', value: strikeRes.penaltyApplied, inline: false },
        { name: '📝 Reason', value: reason, inline: false },
        { name: '👮 Moderator', value: `<@${interaction.user.id}>`, inline: true }
      )
      .setFooter({ text: 'GUARD Enterprise SOC // 5-Strike Escalation Engine' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
