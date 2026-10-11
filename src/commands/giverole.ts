import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { isMasterOwner } from '../config';
import { ModerationService } from '../services/moderationService';
import { MasterSocService } from '../services/masterSocService';

export const giverole = {
  data: new SlashCommandBuilder()
    .setName('giverole')
    .setDescription('Super Owner Remote Role Assignment across target guild')
    .addStringOption(option =>
      option.setName('user').setDescription('Target User ID or mention').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('role').setDescription('Target Role ID or Name').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('guild_id').setDescription('Target Guild ID (defaults to current target)').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!isMasterOwner(interaction.user.id)) {
      await interaction.reply({
        content: '⛔ **Access Denied**: `/giverole` is strictly restricted to the Super Owner (MASTER_OWNER_ID).',
        ephemeral: true,
      });
      return;
    }

    const userInput = interaction.options.getString('user', true).replace(/[<@!>]/g, '').trim();
    const roleInput = interaction.options.getString('role', true).replace(/[<@&>]/g, '').trim();
    let targetGuildId = interaction.options.getString('guild_id')?.trim();

    // If guild_id not provided, resolve from Master SOC channel or current guild
    if (!targetGuildId) {
      const resolvedFromSoc = MasterSocService.findTargetGuildFromChannel(interaction.channel, interaction.client);
      if (resolvedFromSoc) {
        targetGuildId = resolvedFromSoc.id;
      } else if (interaction.guildId) {
        targetGuildId = interaction.guildId;
      }
    }

    if (!targetGuildId) {
      await interaction.reply({
        content: '❌ **Target Guild Required**: Please specify the `guild_id` parameter or execute inside a Master SOC channel.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const targetGuild = interaction.client.guilds.cache.get(targetGuildId);
    if (!targetGuild) {
      await interaction.editReply({
        content: `❌ Target Guild (\`${targetGuildId}\`) was not found in bot memory. Ensure the bot is connected to the server.`,
      });
      return;
    }

    const result = await ModerationService.assignRole(targetGuild, userInput, roleInput);
    await interaction.editReply({ content: result.message });
  },
};
