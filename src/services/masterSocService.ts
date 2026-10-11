import {
  Client,
  Guild,
  ChannelType,
  PermissionFlagsBits,
  CategoryChannel,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from 'discord.js';
import cron, { ScheduledTask } from 'node-cron';
import { CONFIG } from '../config';
import { ModerationService } from './moderationService';
import { getOrCreateGuildConfig, get24hIncidents, get24hIncidentCount, prisma } from '../db';

export class MasterSocService {
  private static cronTask: ScheduledTask | null = null;
  private static lastPing = 0;

  /**
   * Reconcile all connected target guilds into the Master SOC
   */
  public static async reconcileAllGuilds(client: Client): Promise<void> {
    const masterGuild = client.guilds.cache.get(CONFIG.MASTER_GUILD_ID);
    if (!masterGuild) {
      console.warn(`[MASTER SOC] Master Guild (${CONFIG.MASTER_GUILD_ID}) not found in client cache.`);
      return;
    }

    console.log(`[MASTER SOC] Initiating reconciliation across ${client.guilds.cache.size} guilds...`);
    for (const [, targetGuild] of client.guilds.cache) {
      if (targetGuild.id === masterGuild.id) continue;
      await this.provisionGuildSoc(masterGuild, targetGuild).catch(err => {
        console.error(`[MASTER SOC] Failed to reconcile guild ${targetGuild.name} (${targetGuild.id}):`, err);
      });
    }

    // Schedule 04:00 AM IST daily analytical breakdown (22:30 UTC)
    this.startDailyCronJob(client);
    console.log(`[MASTER SOC] Reconciliation completed.`);
  }

  /**
   * Provision category and the 4 private channels per target guild in Master Guild:
   * #server-status, #audit-logs, #bot-log, #command
   */
  public static async provisionGuildSoc(masterGuild: Guild, targetGuild: Guild): Promise<{
    category: CategoryChannel;
    statusChannel: TextChannel;
    auditChannel: TextChannel;
    botLogChannel: TextChannel;
    commandChannel: TextChannel;
  } | null> {
    try {
      const categoryName = `🌐・${targetGuild.name.slice(0, 25)}`;
      const statusChannelName = 'server-status';
      const auditChannelName = 'audit-logs';
      const botLogChannelName = 'bot-log';
      const commandChannelName = 'command';

      // 1. Find or create Category
      let category = masterGuild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && (c.name === categoryName || c.name.startsWith(`🌐・${targetGuild.name.slice(0, 15)}`))
      ) as CategoryChannel | undefined;

      const privateOverwrites = [
        {
          id: masterGuild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: masterGuild.client.user!.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ];

      if (CONFIG.MASTER_OWNER_ID) {
        privateOverwrites.push({
          id: CONFIG.MASTER_OWNER_ID,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        });
      }

      if (!category) {
        category = await masterGuild.channels.create({
          name: categoryName,
          type: ChannelType.GuildCategory,
          permissionOverwrites: privateOverwrites,
        });
      }

      // Helper to ensure channel
      const ensureChannel = async (name: string, topic: string, legacyName?: string): Promise<TextChannel> => {
        let channel = masterGuild.channels.cache.find(
          c => c.type === ChannelType.GuildText && c.parentId === category!.id && (c.name === name || (legacyName && c.name.startsWith(legacyName)))
        ) as TextChannel | undefined;

        if (!channel) {
          channel = await masterGuild.channels.create({
            name,
            type: ChannelType.GuildText,
            parent: category!.id,
            topic,
            permissionOverwrites: privateOverwrites,
          });
        } else {
          if (channel.name !== name) {
            await channel.setName(name).catch(() => null);
          }
          if (channel.topic !== topic) {
            await channel.setTopic(topic).catch(() => null);
          }
        }
        return channel;
      };

      const statusChannel = await ensureChannel(statusChannelName, `TARGET_GUILD_ID:${targetGuild.id}:STATUS`, 'panel-');
      const auditChannel = await ensureChannel(auditChannelName, `TARGET_GUILD_ID:${targetGuild.id}:AUDIT`);
      const botLogChannel = await ensureChannel(botLogChannelName, `TARGET_GUILD_ID:${targetGuild.id}:BOT`);
      const commandChannel = await ensureChannel(commandChannelName, `TARGET_GUILD_ID:${targetGuild.id}:COMMAND`);

      // Post initial status panel if empty
      const messages = await statusChannel.messages.fetch({ limit: 5 }).catch(() => null);
      if (!messages || messages.size === 0) {
        const initialReport = await this.generateServerStatusEmbed(targetGuild);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`soc_lockdown_${targetGuild.id}`).setLabel('Lockdown').setEmoji('🚨').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`soc_unlock_${targetGuild.id}`).setLabel('Unlockdown').setEmoji('🔓').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`soc_status_${targetGuild.id}`).setLabel('Refresh Vitals').setEmoji('🔄').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`soc_serverinfo_${targetGuild.id}`).setLabel('Server Intel').setEmoji('📊').setStyle(ButtonStyle.Secondary)
        );
        await statusChannel.send({ embeds: [initialReport], components: [row] });
      }

      return { category, statusChannel, auditChannel, botLogChannel, commandChannel };
    } catch (error) {
      console.error(`[MASTER SOC] Error provisioning for ${targetGuild.name}:`, error);
      return null;
    }
  }

  /**
   * Generates a 24h analytical breakdown of server vitals, security violations intercepted, and health score
   */
  public static async generateServerStatusEmbed(targetGuild: Guild): Promise<EmbedBuilder> {
    const config = await getOrCreateGuildConfig(targetGuild.id);
    const owner = await targetGuild.fetchOwner().catch(() => null);
    const incidents = await get24hIncidents(targetGuild.id);
    const incidentCount = incidents.length;

    // Calculate Health Score (0 - 100%)
    let healthScore = 100;
    if (config.isLockedDown) healthScore -= 20;
    if (!config.antiNukeEnabled) healthScore -= 15;
    if (!config.antiRaidEnabled) healthScore -= 15;
    healthScore -= Math.min(incidentCount * 5, 40);
    healthScore = Math.max(healthScore, 0);

    const healthColor = healthScore >= 80 ? CONFIG.SUCCESS_COLOR : healthScore >= 50 ? CONFIG.WARN_COLOR : CONFIG.DANGER_COLOR;
    const healthBadge = healthScore >= 80 ? '🟢 OPTIMAL' : healthScore >= 50 ? '🟡 CAUTION' : '🔴 CRITICAL';

    const incidentSummary = incidents.slice(0, 5).map(inc => {
      return `• \`${inc.type}\` | <t:${Math.floor(inc.timestamp.getTime() / 1000)}:R> | ${inc.actionTaken}`;
    }).join('\n') || '✅ Zero security violations intercepted in past 24h.';

    const channels = targetGuild.channels.cache;
    let textChannels = 0;
    let voiceChannels = 0;
    for (const [, c] of channels) {
      if ((c as any).type === ChannelType.GuildText) textChannels++;
      else if ((c as any).type === ChannelType.GuildVoice) voiceChannels++;
    }

    return new EmbedBuilder()
      .setTitle(`📊 24H SOC ANALYTICAL BREAKDOWN // ${targetGuild.name.toUpperCase()}`)
      .setColor(healthColor)
      .setDescription(
        `Automated 24-hour health audit & telemetry telemetry report for **${targetGuild.name}**.\n` +
        `**Health Score:** \`${healthScore.toFixed(1)}%\` — **${healthBadge}**`
      )
      .addFields(
        {
          name: '👑 Server Leadership',
          value: owner ? `<@${owner.id}> (${owner.user.tag})` : 'Unknown',
          inline: true,
        },
        {
          name: '👥 Population Vitals',
          value: `Total Members: \`${targetGuild.memberCount}\`\nRoles: \`${targetGuild.roles.cache.size}\``,
          inline: true,
        },
        {
          name: '📁 Channel Infrastructure',
          value: `💬 Text: \`${textChannels}\` | 🔊 Voice: \`${voiceChannels}\` | 📂 Total: \`${channels.size}\``,
          inline: true,
        },
        {
          name: '🛡️ Defense Matrix',
          value:
            `• Anti-Nuke: ${config.antiNukeEnabled ? '🟢 ACTIVE' : '🔴 OFFLINE'}\n` +
            `• Anti-Raid: ${config.antiRaidEnabled ? '🟢 ACTIVE' : '🔴 OFFLINE'}\n` +
            `• Lockdown: ${config.isLockedDown ? '🚨 FROZEN' : '🟢 NORMAL'}`,
          inline: true,
        },
        {
          name: '🚀 Nitro Boost Tier',
          value: `Tier ${targetGuild.premiumTier} (\`${targetGuild.premiumSubscriptionCount || 0}\` boosts)`,
          inline: true,
        },
        {
          name: '⚔️ 24h Interceptions',
          value: `\`${incidentCount}\` Threats Defeated`,
          inline: true,
        },
        {
          name: '📜 Recent Security Events (Past 24h)',
          value: incidentSummary,
          inline: false,
        }
      )
      .setFooter({ text: `GUARD SOC Intelligence Engine | Server ID: ${targetGuild.id}` })
      .setTimestamp();
  }

  /**
   * Starts the daily cron job scheduled at 04:00 AM IST (22:30 UTC)
   */
  public static startDailyCronJob(client: Client): void {
    if (this.cronTask) return;

    // 04:00 AM IST is 22:30 UTC -> '30 22 * * *'
    this.cronTask = cron.schedule(
      '30 22 * * *',
      async () => {
        console.log('[CRON SOC] Triggering daily 04:00 AM IST server analytical breakdown...');
        const masterGuild = client.guilds.cache.get(CONFIG.MASTER_GUILD_ID);
        if (!masterGuild) return;

        for (const [, targetGuild] of client.guilds.cache) {
          if (targetGuild.id === masterGuild.id) continue;

          try {
            const statusChannel = masterGuild.channels.cache.find(
              c => c.type === ChannelType.GuildText && (c as TextChannel).topic?.includes(`TARGET_GUILD_ID:${targetGuild.id}:STATUS`)
            ) as TextChannel | undefined;

            if (statusChannel) {
              const embed = await this.generateServerStatusEmbed(targetGuild);
              await statusChannel.send({ embeds: [embed] });
            }
          } catch (err) {
            console.error(`[CRON ERROR] Guild ${targetGuild.name}:`, err);
          }
        }
      },
      { timezone: 'UTC' }
    );
  }

  /**
   * Resolves target Guild from a Master SOC channel
   */
  public static findTargetGuildFromChannel(channel: any, client: Client): Guild | null {
    if (!channel || !channel.topic) return null;
    const match = channel.topic.match(/TARGET_GUILD_ID:(\d+)/);
    if (match && match[1]) {
      return client.guilds.cache.get(match[1]) || null;
    }

    if (channel.parent && channel.parent.type === ChannelType.GuildCategory) {
      for (const [, sibling] of channel.parent.children.cache) {
        if (sibling.topic) {
          const siblingMatch = sibling.topic.match(/TARGET_GUILD_ID:(\d+)/);
          if (siblingMatch && siblingMatch[1]) {
            return client.guilds.cache.get(siblingMatch[1]) || null;
          }
        }
      }
    }

    return null;
  }

  /**
   * Full 11-category audit telemetry streaming to Master SOC #audit-logs & target configured channels
   */
  public static async logAuditTelemetry(
    client: Client,
    targetGuildId: string,
    category:
      | 'GUILD_UPDATE'
      | 'CHANNEL_MUTATION'
      | 'ROLE_HIERARCHY'
      | 'MEMBER_LOGS'
      | 'MESSAGE_DIFFS'
      | 'VOICE_ACTIONS'
      | 'THREADS'
      | 'WEBHOOKS'
      | 'AUTOMOD'
      | 'INVITES_EVENTS'
      | 'CUSTOM_ASSETS',
    embed: EmbedBuilder
  ): Promise<void> {
    try {
      const config = await getOrCreateGuildConfig(targetGuildId);
      const targetGuild = client.guilds.cache.get(targetGuildId);

      // 1. Route to target server's specific local channels if configured
      if (targetGuild) {
        let localChannelId: string | null = null;
        if (category === 'VOICE_ACTIONS') {
          localChannelId = config.auditVcLogChannelId;
        } else if (category === 'MESSAGE_DIFFS') {
          localChannelId = config.auditMessageLogChannelId;
        } else if (category === 'ROLE_HIERARCHY' || category === 'MEMBER_LOGS' || category === 'CHANNEL_MUTATION') {
          localChannelId = config.auditServerLogChannelId || config.logChannelId;
        } else {
          localChannelId = config.logChannelId;
        }

        if (localChannelId) {
          const targetLogChannel = targetGuild.channels.cache.get(localChannelId) as TextChannel | undefined;
          if (targetLogChannel) {
            await targetLogChannel.send({ embeds: [embed] }).catch(() => null);
          }
        }
      }

      // 2. Stream to Master Guild's #audit-logs for this target guild
      const masterGuild = client.guilds.cache.get(CONFIG.MASTER_GUILD_ID);
      if (masterGuild) {
        const auditChannel = masterGuild.channels.cache.find(
          c => c.type === ChannelType.GuildText && (c as TextChannel).topic?.includes(`TARGET_GUILD_ID:${targetGuildId}:AUDIT`)
        ) as TextChannel | undefined;

        if (auditChannel) {
          await auditChannel.send({ embeds: [embed] }).catch(() => null);
        }
      }
    } catch (error) {
      console.error(`[AUDIT TELEMETRY ERROR]:`, error);
    }
  }

  /**
   * Shorthand audit log method
   */
  public static async logAudit(client: Client, targetGuildId: string, embed: EmbedBuilder): Promise<void> {
    return this.logAuditTelemetry(client, targetGuildId, 'MEMBER_LOGS', embed);
  }

  /**
   * Dedicated stream for GUARD bot operational events in #bot-log
   */
  public static async logBot(client: Client, targetGuildId: string, embed: EmbedBuilder): Promise<void> {
    try {
      const masterGuild = client.guilds.cache.get(CONFIG.MASTER_GUILD_ID);
      if (!masterGuild) return;

      const botLogChannel = masterGuild.channels.cache.find(
        c => c.type === ChannelType.GuildText && (c as TextChannel).topic?.includes(`TARGET_GUILD_ID:${targetGuildId}:BOT`)
      ) as TextChannel | undefined;

      if (botLogChannel) {
        await botLogChannel.send({ embeds: [embed] }).catch(() => null);
      }
    } catch (error) {
      console.error(`[BOT LOG DISPATCH ERROR]:`, error);
    }
  }

  /**
   * Logs bot ping spike or heartbeat latency jump (> 250ms)
   */
  public static async checkHeartbeatLatency(client: Client): Promise<void> {
    const ping = client.ws.ping;
    if (ping > 250 && Math.abs(ping - this.lastPing) > 50) {
      this.lastPing = ping;
      const alertEmbed = new EmbedBuilder()
        .setTitle('⚠️ BOT LATENCY SPIKE DETECTED')
        .setColor(CONFIG.WARN_COLOR)
        .setDescription(`WebSocket gateway heartbeat spiked to **${ping}ms**.`)
        .setTimestamp();

      for (const [, guild] of client.guilds.cache) {
        if (guild.id !== CONFIG.MASTER_GUILD_ID) {
          await this.logBot(client, guild.id, alertEmbed);
        }
      }
    }
  }

  /**
   * Handles SOC Panel buttons in #server-status
   */
  public static async handleSocButton(interaction: ButtonInteraction, client: Client): Promise<void> {
    const id = interaction.customId;
    if (!id.startsWith('soc_')) return;

    const parts = id.split('_');
    const action = parts[1];
    const targetGuildId = parts[2];

    const targetGuild = client.guilds.cache.get(targetGuildId);
    if (!targetGuild) {
      await interaction.reply({ content: `❌ Target Guild (\`${targetGuildId}\`) not reachable.`, ephemeral: true });
      return;
    }

    if (action === 'lockdown') {
      const res = await ModerationService.lockdownGuild(targetGuild, 'Master SOC Console Action');
      await interaction.reply({ content: res.message, ephemeral: true });
    } else if (action === 'unlock') {
      const res = await ModerationService.unlockdownGuild(targetGuild, 'Master SOC Console Action');
      await interaction.reply({ content: res.message, ephemeral: true });
    } else if (action === 'status') {
      const embed = await this.generateServerStatusEmbed(targetGuild);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (action === 'serverinfo') {
      const embed = await ModerationService.getServerInfoEmbed(targetGuild);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
}
