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
    .setDescription('Warn a member for breaking rules')
    .setDefaultMemberPermissions(0n)
    .addUserOption(option =>
      option.setName('user').setDescription('The member to warn').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for the warning').setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.editReply({ content: `❌ User <@${user.id}> is not in this server.` });
      return;
    }

    const strikeRes = await StrikeService.issueStrike(
      interaction.guild,
      member,
      interaction.user.id,
      `${reason} (Issued by ${interaction.user.tag})`
    );

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ Warning Issued — ${user.tag}`)
      .setColor(strikeRes.strikeCount >= 5 ? CONFIG.DANGER_COLOR : strikeRes.strikeCount >= 2 ? CONFIG.WARN_COLOR : 0x14FA22)
      .setDescription(`Warning recorded for <@${user.id}>.`)
      .addFields(
        { name: 'Target', value: `<@${user.id}> (\`${user.id}\`)`, inline: true },
        { name: 'Strikes', value: `\`${strikeRes.strikeCount}/5\``, inline: true },
        { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Action Taken', value: strikeRes.penaltyApplied, inline: false },
        { name: 'Reason', value: reason, inline: false }
      )
      .setFooter({ text: `Case #${strikeRes.caseId} • GUARD Security` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
