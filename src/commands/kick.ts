import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { ModerationService } from '../services/moderationService';
import { CONFIG } from '../config';

export const kick = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .setDefaultMemberPermissions(0n)
    .addUserOption(option =>
      option.setName('user').setDescription('The member to kick').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for the kick').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.deferReply();
    const result = await ModerationService.kickUser(
      interaction.guild,
      user.id,
      `${reason} (Issued by ${interaction.user.tag})`,
      interaction.user.id
    );

    if (!result.success) {
      await interaction.editReply({ content: `❌ ${result.message}` });
      return;
    }

    const caseBadge = result.caseId ? `#CASE-${result.caseId}` : 'RECORDED';
    const embed = new EmbedBuilder()
      .setTitle(`👢 Member Kicked — ${user.tag}`)
      .setColor(CONFIG.DANGER_COLOR)
      .setDescription(`**${user.tag}** has been kicked from the server.`)
      .addFields(
        { name: 'Target', value: `<@${user.id}> (\`${user.id}\`)`, inline: true },
        { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Case ID', value: `\`${caseBadge}\``, inline: true },
        { name: 'Reason', value: reason, inline: false }
      )
      .setFooter({ text: 'GUARD Security' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
