import {
  Guild,
  GuildMember,
  Message,
  AuditLogEvent,
  EmbedBuilder,
  TextChannel,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import { CONFIG, isMasterOwner } from '../config';
import { recordSecurityIncident, getOrCreateGuildConfig, updateGuildConfig } from '../db';
import { MasterSocService } from './masterSocService';
import { AntiNukeService } from './antiNukeService';
import { StrikeService } from './strikeService';
import { GlobalThreatService } from './globalThreatService';
import { BotStatusMonitorService } from './botStatusMonitorService';

export class SecurityShieldService {
  // Sliding window maps
  public static messageVelocityMap = new Map<string, number[]>();
  public static joinVelocityMap = new Map<string, number[]>();

  // Dangerous executable file extensions
  private static DANGEROUS_EXTENSIONS = [
    '.exe', '.bat', '.vbs', '.scr', '.jar', '.ps1',
    '.cmd', '.msi', '.pif', '.com', '.hta', '.cpl', '.wsf',
  ];

  // Regex patterns for phishing, typosquatting & nitro scam domains
  private static PHISHING_PATTERNS = [
    /discorcl\.[a-z]{2,}/i,
    /dlscord\.[a-z]{2,}/i,
    /discorqd\.[a-z]{2,}/i,
    /discocl\.[a-z]{2,}/i,
    /disscord\.[a-z]{2,}/i,
    /discord-nitro\.[a-z]{2,}/i,
    /free-nitro\.[a-z]{2,}/i,
    /nitro-gift\.[a-z]{2,}/i,
    /discordapp\.click/i,
    /steamcommunitv\.[a-z]{2,}/i,
    /discord-gift\.[a-z]{2,}/i,
    /gift-nitro\.[a-z]{2,}/i,
  ];

  // URL shorteners frequently used to mask payloads
  private static URL_SHORTENER_PATTERNS = [
    /bit\.ly\//i,
    /tinyurl\.com\//i,
    /is\.gd\//i,
    /cutt\.ly\//i,
    /t\.co\//i,
    /goo\.gl\//i,
    /ow\.ly\//i,
    /buff\.ly\//i,
    /adf\.ly\//i,
    /bl\.ink\//i,
  ];

  // Token grabber signature pattern
  private static TOKEN_GRABBER_PATTERN = /[\w-]{24}\.[\w-]{6}\.[\w-]{27}/;

  /**
   * Provision or ensure the automated honeypot trap channel (🔒・do-not-type-here)
   */
  public static async provisionHoneypotChannel(guild: Guild): Promise<TextChannel> {
    const channelName = '🔒・do-not-type-here';
    let channel: TextChannel | undefined;
    const cache = guild.channels?.cache as any;
    if (typeof cache?.find === 'function') {
      channel = cache.find(
        (c: any) => c.type === ChannelType.GuildText && (c.name === channelName || c.name?.includes('do-not-type-here'))
      );
    } else if (cache) {
      const iterable = typeof cache.values === 'function' ? cache.values() : Array.isArray(cache) ? cache : [];
      for (const c of iterable) {
        if (c.type === ChannelType.GuildText && (c.name === channelName || c.name?.includes('do-not-type-here'))) {
          channel = c;
          break;
        }
      }
    }

    const overwrites = [
      {
        id: guild.roles?.everyone?.id || guild.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ];

    if (guild.client?.user) {
      overwrites.push({
        id: guild.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
        ],
      });
    }

    if (!channel) {
      channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        position: 0,
        topic: 'AUTOMATED HONEYPOT TRAP — DO NOT SEND MESSAGES HERE',
        permissionOverwrites: overwrites,
      });
    } else {
      if (typeof channel.permissionOverwrites?.set === 'function') {
        await channel.permissionOverwrites.set(overwrites).catch(() => null);
      }
    }

    const trapEmbed = new EmbedBuilder()
      .setTitle('🔒 Automated Trap — Do Not Send Messages Here')
      .setColor(CONFIG.DANGER_COLOR)
      .setDescription(
        '⚠️ **DO NOT SEND MESSAGES IN THIS CHANNEL.**\n\n' +
        'This channel is an automated trap for spammers and raid bots. Sending any message here will result in an **instant permanent ban** from the server.'
      )
      .setFooter({ text: 'GUARD Security • Automated Trap' })
      .setTimestamp();

    if (typeof channel.send === 'function') {
      await channel.send({ embeds: [trapEmbed] }).catch(() => null);
    }

    await updateGuildConfig(guild.id, { honeypotChannelId: channel.id });
    return channel;
  }

  /**
   * Inspect if message was sent in a configured Honeypot Trap channel.
   * If triggered: delete message, ban member with 24h purge, create Forensic Case,
   * flag actor to Global Threat Intelligence Network, and return true.
   */
  public static async inspectHoneypotMessage(message: Message): Promise<boolean> {
    if (!message.guild || message.author.bot) return false;

    // Immunity check
    if (
      message.author.id === message.guild.ownerId ||
      isMasterOwner(message.author.id) ||
      message.author.id === message.client.user?.id
    ) {
      return false;
    }

    const config = await getOrCreateGuildConfig(message.guild.id);
    if (!config.honeypotChannelId || message.channel.id !== config.honeypotChannelId) {
      return false;
    }

    try {
      // 1. Immediately delete message
      await message.delete().catch(() => null);

      // 2. Ban member with 24h message history purge (86400 seconds)
      if (typeof message.member?.ban === 'function') {
        await message.member.ban({
          reason: '[GUARD HONEYPOT TRAP] Triggered honeypot trap channel',
          deleteMessageSeconds: 86400,
        }).catch(() => null);
      } else if (typeof message.guild.bans?.create === 'function') {
        await message.guild.bans.create(message.author.id, {
          reason: '[GUARD HONEYPOT TRAP] Triggered honeypot trap channel',
          deleteMessageSeconds: 86400,
        }).catch(() => null);
      }

      // 3. Record Forensic Case
      const forensicCase = await StrikeService.createForensicCase({
        guildId: message.guild.id,
        targetId: message.author.id,
        targetTag: message.author.tag,
        moderatorId: message.client.user?.id || 'HONEYPOT_SYSTEM',
        action: 'HONEYPOT_BAN',
        reason: 'Triggered Honeypot Trap Channel (Instant permanent ban & 24h purge)',
        evidenceJson: JSON.stringify({
          channelId: message.channel.id,
          content: message.content,
          timestamp: message.createdTimestamp,
        }),
        client: message.client,
      });

      // 4. Trigger Global Threat Network Cross-Server Auto-Ban
      await GlobalThreatService.flagAndGlobalBan(
        message.client,
        message.author.id,
        message.author.tag,
        'Triggered Honeypot Trap Channel',
        message.guild.id,
        'CRITICAL'
      );

      // 5. Record incident and increment counter
      await recordSecurityIncident(
        message.guild.id,
        'HONEYPOT_TRAP_TRIGGERED',
        message.author.id,
        `Posted in honeypot channel #${(message.channel as any).name || message.channel.id}`,
        `Banned & Globally Blacklisted [#CASE-${forensicCase.caseId}]`
      );

      BotStatusMonitorService.blockedThreatCount++;
      return true;
    } catch (err) {
      console.error(`[HONEYPOT ERROR] Guild ${message.guild.id}, Actor ${message.author.id}:`, err);
      return false;
    }
  }

  /**
   * Anti-Alt & Mass-Join Raid Gatekeeper
   */
  public static async inspectMemberJoin(member: GuildMember): Promise<boolean> {
    if (member.user.bot) return false;
    const guild = member.guild;
    const config = await getOrCreateGuildConfig(guild.id);

    // 1. Account Age Check (Anti-Alt)
    const minAgeDays = config.minAccountAgeDays ?? 1;
    const minAgeMs = minAgeDays * 24 * 60 * 60 * 1000;
    const accountAgeMs = Date.now() - member.user.createdTimestamp;

    if (accountAgeMs < minAgeMs) {
      console.warn(`[ANTI-ALT GATEKEEPER] Intercepted young account ${member.user.tag} (${member.id}) in ${guild.name}`);
      const timeoutMs = 24 * 60 * 60 * 1000;
      if (typeof member.timeout === 'function' && member.moderatable) {
        await member.timeout(timeoutMs, `[ANTI-ALT GATEKEEPER] Account age below ${minAgeDays} day(s)`).catch(() => null);
      } else if (typeof member.kick === 'function') {
        await member.kick(`[ANTI-ALT GATEKEEPER] Account age below ${minAgeDays} day(s)`).catch(() => null);
      }

      // Create Forensic Case
      const forensicCase = await StrikeService.createForensicCase({
        guildId: guild.id,
        targetId: member.id,
        targetTag: member.user.tag,
        moderatorId: member.client?.user?.id || 'GATEKEEPER_SYSTEM',
        action: 'ALT_ACCOUNT_QUARANTINE',
        reason: `Account age (${(accountAgeMs / (1000 * 3600)).toFixed(1)}h) is less than required minimum of ${minAgeDays} day(s)`,
        evidenceJson: JSON.stringify({
          createdTimestamp: member.user.createdTimestamp,
          accountAgeHours: (accountAgeMs / (1000 * 3600)).toFixed(2),
          minAccountAgeDays: minAgeDays,
        }),
        client: member.client,
      });

      // Log alert to Master SOC #audit-logs
      const auditEmbed = new EmbedBuilder()
        .setTitle(`🛡️ ANTI-ALT QUARANTINE // #CASE-${forensicCase.caseId}`)
        .setColor(CONFIG.WARN_COLOR)
        .setDescription(
          `New member account intercepted by **Anti-Alt Gatekeeper** in **${guild.name}**.\n\n` +
          `• **Target:** <@${member.id}> (\`${member.user.tag}\` | \`${member.id}\`)\n` +
          `• **Account Created:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>\n` +
          `• **Required Age:** \`${minAgeDays} Day(s)\`\n` +
          `• **Action Taken:** 24-hour quarantine timeout applied`
        )
        .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
        .setFooter({ text: 'GUARD Enterprise Join Gatekeeper' })
        .setTimestamp();

      await MasterSocService.logAuditTelemetry(member.client, guild.id, 'MEMBER_LOGS', auditEmbed);
      return true;
    }

    // 2. Join Velocity Raid Check
    const now = Date.now();
    const guildKey = guild.id;
    const timestamps = (this.joinVelocityMap.get(guildKey) || []).filter(t => now - t <= 10000);
    timestamps.push(now);
    this.joinVelocityMap.set(guildKey, timestamps);

    if (timestamps.length >= 6) {
      const raidEmbed = new EmbedBuilder()
        .setTitle('🚨 CRITICAL MASS JOIN RAID DETECTED')
        .setColor(CONFIG.DANGER_COLOR)
        .setDescription(
          `**EMERGENCY RAID ALERT FOR ${guild.name} (${guild.id})**\n\n` +
          `• **Join Velocity:** \`${timestamps.length} joins in 10s\` (Threshold: 6)\n` +
          `• **Latest Infiltrator:** <@${member.id}> (\`${member.user.tag}\`)\n` +
          `• **Status:** Active mass join surge intercepted.`
        )
        .setFooter({ text: 'GUARD Threat Intelligence Network' })
        .setTimestamp();

      // Log to #audit-logs
      await MasterSocService.logAuditTelemetry(member.client, guild.id, 'MEMBER_LOGS', raidEmbed);

      // Log to #server-status
      const masterGuild = member.client?.guilds?.cache?.get(CONFIG.MASTER_GUILD_ID);
      if (masterGuild && masterGuild.channels?.cache) {
        let statusChannel: TextChannel | undefined;
        const cache = masterGuild.channels.cache as any;
        if (typeof cache.find === 'function') {
          statusChannel = cache.find(
            (c: any) => c.type === ChannelType.GuildText && c.topic?.includes(`TARGET_GUILD_ID:${guild.id}:STATUS`)
          );
        } else if (typeof cache.values === 'function') {
          for (const c of cache.values()) {
            if (c.type === ChannelType.GuildText && c.topic?.includes(`TARGET_GUILD_ID:${guild.id}:STATUS`)) {
              statusChannel = c;
              break;
            }
          }
        }
        if (statusChannel) {
          await statusChannel.send({ embeds: [raidEmbed] }).catch(() => null);
        }
      }
    }

    return false;
  }

  /**
   * Unauthorized Bot Shield: checks if a newly added bot was authorized by the Guild Owner
   */
  public static async handleBotAdd(member: GuildMember): Promise<void> {
    if (!member.user.bot) return;
    const guild = member.guild;

    try {
      const auditLogs = await guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.BotAdd,
      }).catch(() => null);

      const entry = auditLogs?.entries.first();
      const actor = entry?.executor;

      if (!actor) return;

      const isAuthorized = actor.id === guild.ownerId || isMasterOwner(actor.id);
      if (!isAuthorized) {
        console.warn(`[ROGUE BOT DETECTED] Bot ${member.user.tag} added by unauthorized actor ${actor.tag} in ${guild.name}.`);

        // 1. Kick/Ban rogue bot instantly
        await member.kick('[ROGUE BOT SHIELD] Unauthorized bot addition detected.').catch(() => null);

        // 2. Quarantine actor who added the bot
        await AntiNukeService.quarantineActor(
          guild,
          actor.id,
          `Unauthorized Bot Shield: Added unverified bot <@${member.user.id}> without Owner consent.`
        );

        // 3. Record incident
        await recordSecurityIncident(
          guild.id,
          'ROGUE_BOT_BLOCKED',
          actor.id,
          `Rogue bot @${member.user.tag} (${member.user.id}) added by @${actor.tag}`,
          'Bot Kicked & Actor Quarantined'
        );
      }
    } catch (err) {
      console.error(`[ROGUE BOT SHIELD ERROR] Guild ${guild.id}:`, err);
    }
  }

  /**
   * Unauthorized Webhook Shield: checks if a webhook was created by non-owner
   */
  public static async handleWebhookCreate(channel: any): Promise<void> {
    if (!channel.guild) return;
    const guild = channel.guild as Guild;

    try {
      const auditLogs = await guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.WebhookCreate,
      }).catch(() => null);

      const entry = auditLogs?.entries.first();
      const actor = entry?.executor;

      if (!actor) return;

      const isAuthorized = actor.id === guild.ownerId || isMasterOwner(actor.id) || actor.id === guild.client.user?.id;
      if (!isAuthorized) {
        console.warn(`[UNAUTHORIZED WEBHOOK] Created by actor ${actor.tag} in ${guild.name}.`);

        if ('fetchWebhooks' in channel) {
          const webhooks = await channel.fetchWebhooks().catch(() => null);
          if (webhooks) {
            for (const [, wh] of webhooks) {
              if (wh.owner?.id === actor.id) {
                await wh.delete('[ROGUE WEBHOOK SHIELD] Unauthorized webhook deletion.').catch(() => null);
              }
            }
          }
        }

        await AntiNukeService.quarantineActor(
          guild,
          actor.id,
          `Unauthorized Webhook Shield: Created unauthorized webhook in <#${channel.id}>.`
        );

        await recordSecurityIncident(
          guild.id,
          'ROGUE_WEBHOOK_BLOCKED',
          actor.id,
          `Unauthorized webhook creation in #${channel.name || 'channel'}`,
          'Webhook Deleted & Actor Quarantined'
        );
      }
    } catch (err) {
      console.error(`[ROGUE WEBHOOK SHIELD ERROR]:`, err);
    }
  }

  /**
   * Threat & Phishing Filter with Anti-Flood & Mass-Mention Heater
   */
  public static async inspectMessage(message: Message): Promise<boolean> {
    if (message.author.bot || !message.guild) return false;

    // 0. Honeypot check
    const isHoneypot = await this.inspectHoneypotMessage(message);
    if (isHoneypot) return true;

    // 1. Anti-Flood & Mass-Mention Check
    const isOwner = message.author.id === message.guild.ownerId || isMasterOwner(message.author.id);
    if (!isOwner && message.member) {
      const now = Date.now();
      const velocityKey = `${message.guild.id}:${message.author.id}`;
      const timestamps = (this.messageVelocityMap.get(velocityKey) || []).filter(t => now - t <= 4000);
      timestamps.push(now);
      this.messageVelocityMap.set(velocityKey, timestamps);

      const isFlood = timestamps.length > 6;

      const userMentions = message.mentions?.users?.size || 0;
      const roleMentions = message.mentions?.roles?.size || 0;
      const totalMentions = userMentions + roleMentions;
      const hasEveryone = (message.content || '').includes('@everyone') || (message.content || '').includes('@here');
      const canMentionEveryone = message.member.permissions?.has(PermissionFlagsBits.MentionEveryone) ?? false;
      const isMassMention = totalMentions >= 5 || (hasEveryone && !canMentionEveryone);

      if (isFlood || isMassMention) {
        const reason = isFlood
          ? `Anti-Flood Triggered: Exceeded rate limit (>6 messages in 4s)`
          : `Mass Mention Raid: Contained ${totalMentions} mentions or unauthorized @everyone/@here`;

        await message.delete().catch(() => null);

        const strikeRes = await StrikeService.issueStrike(
          message.guild,
          message.member,
          message.client.user?.id || 'SECURITY_SYSTEM',
          reason,
          {
            content: message.content,
            messageCount4s: timestamps.length,
            mentions: totalMentions,
            channelId: message.channel.id,
          }
        );

        await recordSecurityIncident(
          message.guild.id,
          isFlood ? 'ANTI_FLOOD_SPAM' : 'MASS_MENTION_RAID',
          message.author.id,
          reason,
          `Message Deleted & Strike ${strikeRes.strikeCount}/5 Applied: ${strikeRes.penaltyApplied}`
        );

        BotStatusMonitorService.blockedThreatCount++;
        return true;
      }
    }

    const content = message.content || '';
    const attachments = message.attachments || new Map();

    let violationType: string | null = null;
    let violationDetail: string = '';

    // 2. Check for dangerous executable file uploads
    for (const [, attachment] of attachments) {
      const name = (attachment.name || '').toLowerCase();
      const isDangerous = this.DANGEROUS_EXTENSIONS.some(ext => name.endsWith(ext));
      if (isDangerous) {
        violationType = 'DANGEROUS_EXECUTABLE';
        violationDetail = `Blocked malicious file payload: \`${attachment.name}\``;
        break;
      }
    }

    // 3. Check for Token Grabbers
    if (!violationType && this.TOKEN_GRABBER_PATTERN.test(content)) {
      violationType = 'TOKEN_GRABBER_SIGNATURE';
      violationDetail = 'Detected active Discord token pattern signature.';
    }

    // 4. Check for Phishing / Typosquatting / Nitro scam domains
    if (!violationType) {
      for (const pattern of this.PHISHING_PATTERNS) {
        if (pattern.test(content)) {
          violationType = 'PHISHING_NITRO_SCAM';
          violationDetail = `Detected deceptive domain matching pattern: \`${pattern.source}\``;
          break;
        }
      }
    }

    // 5. Check for URL shorteners masking destinations
    if (!violationType) {
      for (const pattern of this.URL_SHORTENER_PATTERNS) {
        if (pattern.test(content)) {
          violationType = 'MASKED_URL_SHORTENER';
          violationDetail = `Detected URL shortener: \`${pattern.source}\``;
          break;
        }
      }
    }

    // If violation detected, execute immediate remediation
    if (violationType) {
      try {
        await message.delete().catch(() => null);

        if (message.member?.moderatable) {
          await message.member.timeout(60 * 60 * 1000, `[THREAT SHIELD] ${violationDetail}`).catch(() => null);
        }

        const alertEmbed = new EmbedBuilder()
          .setTitle('🛡️ Harmful Content Blocked')
          .setColor(CONFIG.DANGER_COLOR)
          .setDescription(
            `A dangerous link or attachment was detected from <@${message.author.id}>.\n` +
            `• **Violation:** \`${violationType}\`\n` +
            `• **Action Taken:** Message deleted and user muted for 1 hour.`
          )
          .setFooter({ text: 'GUARD Security' })
          .setTimestamp();

        if ('send' in message.channel) {
          await (message.channel as TextChannel).send({ embeds: [alertEmbed] }).then((msg: any) => {
            setTimeout(() => msg.delete().catch(() => null), 8000);
          }).catch(() => null);
        }

        await recordSecurityIncident(
          message.guild.id,
          violationType,
          message.author.id,
          violationDetail,
          'Message Deleted & 1h Timeout Applied'
        );

        await MasterSocService.logAudit(message.client, message.guild.id, alertEmbed);
        BotStatusMonitorService.blockedThreatCount++;
        return true;
      } catch (err) {
        console.error(`[THREAT SHIELD ERROR]:`, err);
      }
    }

    return false;
  }

  /**
   * Zero-Trust & Passcode Protection: confirms sensitive admin actions are strictly limited to the Guild Owner
   */
  public static isZeroTrustAuthorized(guild: Guild, actorId: string): boolean {
    return actorId === guild.ownerId || isMasterOwner(actorId);
  }
}
