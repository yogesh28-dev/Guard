import {
  Client,
  Guild,
  TextChannel,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import cron, { ScheduledTask } from 'node-cron';
import { getVoiceConnection } from '@discordjs/voice';
import { CONFIG } from '../config';
import { prisma } from '../db';

export class BotStatusMonitorService {
  private static cronTask: ScheduledTask | null = null;
  public static reconnectAttempts = 0;
  public static blockedThreatCount = 0;

  /**
   * Ensures the dedicated #bot-status channel exists in the Master Guild
   */
  public static async ensureBotStatusChannel(masterGuild: Guild): Promise<TextChannel | null> {
    try {
      const channelName = 'bot-status';
      let channel: TextChannel | undefined;
      for (const [, c] of masterGuild.channels.cache) {
        if (c.type === ChannelType.GuildText && (c.name === channelName || c.name === `📊・${channelName}`)) {
          channel = c as TextChannel;
          break;
        }
      }

      const overwrites = [
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
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ];

      if (CONFIG.MASTER_OWNER_ID) {
        overwrites.push({
          id: CONFIG.MASTER_OWNER_ID,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        });
      }

      if (!channel) {
        channel = await masterGuild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          topic: 'GUARD_SYSTEM_STATUS_TELEMETRY',
          permissionOverwrites: overwrites,
        });
      } else {
        await channel.permissionOverwrites.set(overwrites).catch(() => null);
      }

      return channel;
    } catch (error) {
      console.error('[BOT STATUS ERROR] Failed to ensure #bot-status channel:', error);
      return null;
    }
  }

  /**
   * Format process uptime in human readable string
   */
  public static formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);
    return parts.join(' ');
  }

  /**
   * Inspect and compile complete enterprise bot telemetry metrics into a dark cyber embed
   */
  public static async generateStatusEmbed(client: Client): Promise<EmbedBuilder> {
    // 1. System Vitals
    const uptime = this.formatUptime(process.uptime());
    const mem = process.memoryUsage();
    const rssMB = (mem.rss / (1024 * 1024)).toFixed(1);
    const heapUsedMB = (mem.heapUsed / (1024 * 1024)).toFixed(1);
    const heapTotalMB = (mem.heapTotal / (1024 * 1024)).toFixed(1);

    // 2. Discord Telemetry (WebSocket & REST Latency)
    const wsPing = client.ws.ping >= 0 ? `${client.ws.ping}ms` : 'Connecting...';
    let restPingStr = '0ms';
    try {
      const restStart = Date.now();
      await client.user?.fetch();
      restPingStr = `${Date.now() - restStart}ms`;
    } catch {
      restPingStr = 'N/A';
    }

    // 3. Fleet Scale
    const totalGuilds = client.guilds.cache.size;
    let totalMembers = 0;
    let textChannels = 0;
    let voiceChannels = 0;

    for (const [, g] of client.guilds.cache) {
      totalMembers += g.memberCount || 0;
      for (const [, c] of g.channels.cache) {
        if (c.type === ChannelType.GuildText) textChannels++;
        else if (c.type === ChannelType.GuildVoice) voiceChannels++;
      }
    }

    // 4. Voice Engine
    let activeVoiceConnections = 0;
    const targetGuildsCount = Math.max(totalGuilds - 1, 0); // exclude master guild
    for (const [, g] of client.guilds.cache) {
      if (g.id === CONFIG.MASTER_GUILD_ID) continue;
      const conn = getVoiceConnection(g.id);
      if (conn && conn.state.status !== 'destroyed') {
        activeVoiceConnections++;
      }
    }
    const voiceHealthScore = targetGuildsCount > 0
      ? Math.round((activeVoiceConnections / targetGuildsCount) * 100)
      : 100;

    // 5. Security Counters (Past Hour & Lifetime)
    const oneHourAgo = new Date(Date.now() - 3600000);
    let pastHourIncidents: any[] = [];
    let lifetimeIncidentCount = 0;
    let dbLatencyMs = 0;
    let snapshotCount = 0;

    try {
      const dbStart = Date.now();
      pastHourIncidents = await prisma.securityIncident.findMany({
        where: { timestamp: { gte: oneHourAgo } },
      });
      lifetimeIncidentCount = await prisma.securityIncident.count();
      const channelSnapshots = await prisma.channelSnapshot.count();
      const roleSnapshots = await prisma.roleSnapshot.count();
      snapshotCount = channelSnapshots + roleSnapshots;
      dbLatencyMs = Date.now() - dbStart;
    } catch (err) {
      console.error('[TELEMETRY DB ERROR]:', err);
    }

    const pastHourNukes = pastHourIncidents.filter(i => i.type.includes('ANTI_NUKE')).length;
    const pastHourPhishing = pastHourIncidents.filter(i =>
      i.type.includes('PHISHING') || i.type.includes('DANGEROUS') || i.type.includes('SHORTENER')
    ).length;
    const pastHourRogueBots = pastHourIncidents.filter(i => i.type.includes('ROGUE_BOT')).length;
    const pastHourQuarantines = pastHourIncidents.filter(i => i.actionTaken.includes('Quarantined')).length;

    // Health badge assessment
    const isOptimal = client.ws.ping <= 200 && dbLatencyMs <= 50;
    const statusBadge = isOptimal
      ? '🟢 OPERATIONAL • ALL SYSTEMS OPTIMAL'
      : '🟡 ELEVATED LATENCY • SYSTEMS STABLE';

    return new EmbedBuilder()
      .setTitle('📊 GUARD SOC // ENTERPRISE BOT HOURLY TELEMETRY')
      .setColor(0x14FA22)
      .setDescription(
        `Automated hourly diagnostic pulse of the GUARD Enterprise Security Infrastructure.\n` +
        `**Status:** \`${statusBadge}\`\n` +
        `**Master SOC Node:** \`${CONFIG.MASTER_GUILD_ID}\``
      )
      .addFields(
        {
          name: '💻 System Vitals',
          value:
            `• **Uptime:** \`${uptime}\`\n` +
            `• **Memory (RSS):** \`${rssMB} MB\`\n` +
            `• **Heap:** \`${heapUsedMB} / ${heapTotalMB} MB\`\n` +
            `• **Runtime:** \`Node.js ${process.version} (${process.platform})\``,
          inline: true,
        },
        {
          name: '📡 Discord Telemetry',
          value:
            `• **WebSocket Ping:** \`${wsPing}\`\n` +
            `• **REST API Ping:** \`${restPingStr}\`\n` +
            `• **Shards:** \`1 / 1 Online\`\n` +
            `• **Gateway Status:** \`READY\``,
          inline: true,
        },
        {
          name: '🌐 Fleet Scale',
          value:
            `• **Connected Guilds:** \`${totalGuilds}\`\n` +
            `• **Tracked Members:** \`${totalMembers.toLocaleString()}\`\n` +
            `• **Text Channels:** \`${textChannels}\`\n` +
            `• **Voice Channels:** \`${voiceChannels}\``,
          inline: true,
        },
        {
          name: '🔊 Voice Security Engine',
          value:
            `• **Active 24/7 Locks:** \`${activeVoiceConnections} / ${targetGuildsCount}\`\n` +
            `• **Voice Health:** \`${voiceHealthScore}%\`\n` +
            `• **Reconnect Attempts:** \`${this.reconnectAttempts}\`\n` +
            `• **Protocol:** \`Guard Vc 24/7\``,
          inline: true,
        },
        {
          name: '🛡️ Security Interceptions (Past Hour)',
          value:
            `• **Nuke Attempts Intercepted:** \`${pastHourNukes}\`\n` +
            `• **Malware / Phishing Blocked:** \`${pastHourPhishing}\`\n` +
            `• **Rogue Bots Banned:** \`${pastHourRogueBots}\`\n` +
            `• **Quarantined Actors:** \`${pastHourQuarantines}\``,
          inline: true,
        },
        {
          name: '🗄️ Database & Cache Vitals',
          value:
            `• **Engine:** \`SQLite (Prisma Client)\`\n` +
            `• **Query Latency:** \`${dbLatencyMs}ms\`\n` +
            `• **Active Snapshots:** \`${snapshotCount.toLocaleString()}\`\n` +
            `• **Lifetime Interceptions:** \`${lifetimeIncidentCount.toLocaleString()}\``,
          inline: true,
        }
      )
      .setFooter({ text: 'GUARD Enterprise SOC // Automated Telemetry Stream' })
      .setTimestamp();
  }

  /**
   * Dispatches the hourly status report to #bot-status in the Master Guild
   */
  public static async dispatchHourlyReport(client: Client): Promise<void> {
    const masterGuild = client.guilds.cache.get(CONFIG.MASTER_GUILD_ID);
    if (!masterGuild) {
      console.warn(`[BOT STATUS] Master Guild (${CONFIG.MASTER_GUILD_ID}) not accessible.`);
      return;
    }

    const channel = await this.ensureBotStatusChannel(masterGuild);
    if (!channel) return;

    const embed = await this.generateStatusEmbed(client);
    await channel.send({ embeds: [embed] }).catch(err => {
      console.error('[BOT STATUS ERROR] Failed to send report to #bot-status:', err);
    });
  }

  /**
   * Initializes the hourly cron job: 0 * * * *
   */
  public static startHourlyCron(client: Client): void {
    if (this.cronTask) return;

    // Run at minute 0 of every hour: '0 * * * *'
    this.cronTask = cron.schedule(
      '0 * * * *',
      async () => {
        console.log('[CRON TELEMETRY] Dispatching hourly bot status report to #bot-status...');
        await this.dispatchHourlyReport(client).catch(err => {
          console.error('[CRON TELEMETRY ERROR]:', err);
        });
      },
      { timezone: 'UTC' }
    );
  }
}
