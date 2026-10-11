import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { isMasterOwner } from '../config';
import { ModerationService } from '../services/moderationService';

export const giverole = {
  data: new SlashCommandBuilder()
    .setName('giverole')
    .setDescription('Super Owner Remote Role Assignment across any target guild')
    .addStringOption(option =>
      option.setName('guild_id').setDescription('Target Guild ID').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('user_id').setDescription('Target User ID').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('role_id').setDescription('Target Role ID or Role Name').setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!isMasterOwner(interaction.user.id)) {
      await interaction.reply({
        content: '⛔ **Access Denied**: `/giverole` is strictly restricted to the Super Owner.',
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.options.getString('guild_id', true).trim();
    const userId = interaction.options.getString('user_id', true).trim();
    const roleId = interaction.options.getString('role_id', true).trim();

    await interaction.deferReply({ ephemeral: true });

    const targetGuild = interaction.client.guilds.cache.get(guildId);
    if (!targetGuild) {
      await interaction.editReply({
        content: `❌ Target Guild (\`${guildId}\`) was not found in bot memory. Ensure bot has joined the target server.`,
      });
      return;
    }

    const result = await ModerationService.assignRole(targetGuild, userId, roleId);
    await interaction.editReply({ content: result.message });
  },
};
