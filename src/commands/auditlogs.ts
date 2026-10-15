import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
} from 'discord.js';
import { updateGuildConfig } from '../db';

export const auditlogs = {
  data: new SlashCommandBuilder()
    .setName('auditlogs')
    .setDescription('Configure the current channel to route a specific category of security and audit telemetry')
    .setDefaultMemberPermissions(0n)
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('The log telemetry stream to route to this channel')
        .setRequired(true)
        .addChoices(
          { name: 'audit logs (VC Events: join, leave, switch, move)', value: 'audit logs' },
          { name: 'server logs (Mutations: roles, kicks, bans, timeouts, mutes)', value: 'server logs' },
          { name: 'message logs (Mutations: message edits with diffs, deletes)', value: 'message logs' }
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
        content: `🎙️ **TELEMETRY ROUTED**: Voice channel activity logs (joins, leaves, switches, moves) will now stream to <#${channelId}>.`,
      });
    } else if (type === 'server logs') {
      await updateGuildConfig(interaction.guildId, { auditServerLogChannelId: channelId, logChannelId: channelId });
      await interaction.reply({
        content: `🛡️ **TELEMETRY ROUTED**: Server mutation logs (role modifications, bans, kicks, timeouts) will now stream to <#${channelId}>.`,
      });
    } else if (type === 'message logs') {
      await updateGuildConfig(interaction.guildId, { auditMessageLogChannelId: channelId });
      await interaction.reply({
        content: `📝 **TELEMETRY ROUTED**: Message mutation logs (edits with diffs, deletions) will now stream to <#${channelId}>.`,
      });
    }
  },
};
