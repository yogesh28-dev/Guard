import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
} from 'discord.js';
import { updateGuildConfig } from '../db';

export const auditlogs = {
  data: new SlashCommandBuilder()
    .setName('auditlogs')
    .setDescription('Set this channel to receive server logs')
    .setDefaultMemberPermissions(0n)
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('The type of logs to send to this channel')
        .setRequired(true)
        .addChoices(
          { name: 'Voice logs (joins, leaves, channel switches, mutes)', value: 'audit logs' },
          { name: 'Server logs (role changes, kicks, bans, timeouts)', value: 'server logs' },
          { name: 'Message logs (message edits, diffs, and deletes)', value: 'message logs' }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId || !interaction.channel) return;

    if (interaction.channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: '❌ Invalid channel. This command must be executed inside a standard text channel.',
        ephemeral: true,
      });
      return;
    }

    const type = interaction.options.getString('type', true);
    const channelId = interaction.channel.id;

    if (type === 'audit logs') {
      await updateGuildConfig(interaction.guildId, { auditVcLogChannelId: channelId });
      await interaction.reply({
        content: `🎙️ Voice activity logs will now be sent to <#${channelId}>.`,
      });
    } else if (type === 'server logs') {
      await updateGuildConfig(interaction.guildId, { auditServerLogChannelId: channelId, logChannelId: channelId });
      await interaction.reply({
        content: `🛡️ Server mutation and moderation logs will now be sent to <#${channelId}>.`,
      });
    } else if (type === 'message logs') {
      await updateGuildConfig(interaction.guildId, { auditMessageLogChannelId: channelId });
      await interaction.reply({
        content: `📝 Message edit and deletion logs will now be sent to <#${channelId}>.`,
      });
    }
  },
};
