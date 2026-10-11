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
    .setDescription('Super Owner force re-fetch and reconciliation across all guilds and SOC channels'),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!isMasterOwner(interaction.user.id)) {
      await interaction.reply({
        content: '⛔ **Access Denied**: `/syncall` is strictly restricted to the Super Owner (MASTER_OWNER_ID).',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    const progressEmbed = new EmbedBuilder()
      .setTitle('🔄 MULTI-GUILD RECONCILIATION INITIATED')
      .setColor(CONFIG.CYBERPUNK_CYAN)
      .setDescription(
        'Fetching all connected guilds, establishing 24/7 Voice Locks, snapshotting database states, ' +
        'and synchronizing Master SOC channels with 1000ms rate-limit throttling...'
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [progressEmbed] });

    const startTime = Date.now();
    const result = await MasterSocService.reconcileAllGuilds(interaction.client);

    // Also dispatch fresh status report to #bot-status
    await BotStatusMonitorService.dispatchHourlyReport(interaction.client).catch(() => null);

    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

    const completedEmbed = new EmbedBuilder()
      .setTitle('✅ MULTI-GUILD RECONCILIATION COMPLETED')
      .setColor(CONFIG.SUCCESS_COLOR)
      .setDescription(
        `All connected guilds have been synchronized across the Master SOC and Target Voice infrastructure.\n` +
        `⏱️ **Execution Time:** \`${elapsedSeconds}s\``
      )
      .addFields(
        { name: '🌐 Total Guilds Discovered', value: `\`${result.totalGuilds}\``, inline: true },
        { name: '🛡️ Successfully Provisioned', value: `\`${result.syncedGuilds}\``, inline: true },
        { name: '⚠️ Failed / Inaccessible', value: `\`${result.failedGuilds}\``, inline: true },
        { name: '📊 Dedicated Telemetry', value: 'Dispatched to `<#bot-status>`', inline: false }
      )
      .setFooter({ text: 'GUARD Enterprise SOC // Multi-Guild Sync Engine' })
      .setTimestamp();

    await interaction.editReply({ embeds: [completedEmbed] });
  },
};
