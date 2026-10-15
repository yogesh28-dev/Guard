import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { isMasterOwner, CONFIG } from '../config';
import { MasterSocService } from '../services/masterSocService';
import { BotStatusMonitorService } from '../services/botStatusMonitorService';

export const syncall = {
  data: new SlashCommandBuilder()
    .setName('syncall')
    .setDescription('Sync bot settings and channels across all servers')
    .setDefaultMemberPermissions(0n),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!isMasterOwner(interaction.user.id)) {
      await interaction.reply({
        content: '⛔ **Access Denied**: `/syncall` is strictly restricted to the Super Owner (MASTER_OWNER_ID).',
        ephemeral: true,
      });
      return;
    }

    if (interaction.guildId !== CONFIG.MASTER_GUILD_ID) {
      await interaction.reply({
        content: `⛔ **Access Denied**: \`/syncall\` can only be executed inside the Master Guild (\`${CONFIG.MASTER_GUILD_ID}\`).`,
        ephemeral: true,
      });
      return;
    }

    const channelName = (interaction.channel as any)?.name?.toLowerCase();
    const channelTopic = (interaction.channel as any)?.topic;
    const isCommandChannel = channelName === 'command' || channelName?.includes('command') || channelTopic?.includes(':COMMAND');
    if (!isCommandChannel) {
      await interaction.reply({
        content: '⛔ **Access Denied**: `/syncall` can only be executed strictly inside a `#command` channel.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const progressEmbed = new EmbedBuilder()
      .setTitle('🔄 Synchronizing Servers')
      .setColor(0x14FA22)
      .setDescription(
        'Connecting to protected guilds and synchronizing voice & telemetry configurations...'
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [progressEmbed] });

    const startTime = Date.now();
    const result = await MasterSocService.reconcileAllGuilds(interaction.client);

    // Also dispatch fresh status report to #bot-status
    await BotStatusMonitorService.dispatchHourlyReport(interaction.client).catch(() => null);

    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

    const completedEmbed = new EmbedBuilder()
      .setTitle('✅ Synchronization Complete')
      .setColor(0x14FA22)
      .setDescription(
        `Synchronized connected servers in \`${elapsedSeconds}s\`.`
      )
      .addFields(
        { name: '🌐 Total Servers', value: `\`${result.totalGuilds}\``, inline: true },
        { name: '🛡️ Provisioned', value: `\`${result.syncedGuilds}\``, inline: true },
        { name: '⚠️ Inaccessible', value: `\`${result.failedGuilds}\``, inline: true },
        { name: '📊 Status Report', value: 'Dispatched to `<#bot-status>`', inline: false }
      )
      .setFooter({ text: 'GUARD Security' })
      .setTimestamp();

    await interaction.editReply({ embeds: [completedEmbed] });
  },
};
