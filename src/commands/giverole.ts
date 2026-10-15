import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { isMasterOwner, CONFIG } from '../config';
import { ModerationService } from '../services/moderationService';
import { MasterSocService } from '../services/masterSocService';

export const giverole = {
  data: new SlashCommandBuilder()
    .setName('giverole')
    .setDescription('Give or remove a role from a member')
    .setDefaultMemberPermissions(0n)
    .addStringOption(option =>
      option.setName('user').setDescription('User ID or mention').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('role').setDescription('Role ID or name').setRequired(true)
    )
    .addStringOption(option =>
      option.setName('guild_id').setDescription('Server ID (optional)').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!isMasterOwner(interaction.user.id)) {
      await interaction.reply({
        content: '⛔ **Access Denied**: `/giverole` is strictly restricted to the Super Owner (MASTER_OWNER_ID).',
        ephemeral: true,
      });
      return;
    }

    if (interaction.guildId !== CONFIG.MASTER_GUILD_ID) {
      await interaction.reply({
        content: `⛔ **Access Denied**: \`/giverole\` can only be executed inside the Master Guild (\`${CONFIG.MASTER_GUILD_ID}\`).`,
        ephemeral: true,
      });
      return;
    }

    const channelName = (interaction.channel as any)?.name?.toLowerCase();
    const channelTopic = (interaction.channel as any)?.topic;
    const isCommandChannel = channelName === 'command' || channelName?.includes('command') || channelTopic?.includes(':COMMAND');
    if (!isCommandChannel) {
      await interaction.reply({
        content: '⛔ **Access Denied**: `/giverole` can only be executed strictly inside a `#command` channel.',
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
