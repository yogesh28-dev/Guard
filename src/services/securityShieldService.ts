import {
  Guild,
  GuildMember,
  Message,
  AuditLogEvent,
  EmbedBuilder,
  TextChannel,
} from 'discord.js';
import { CONFIG, isMasterOwner } from '../config';
import { recordSecurityIncident } from '../db';
import { MasterSocService } from './masterSocService';
import { AntiNukeService } from './antiNukeService';

export class SecurityShieldService {
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

        // Fetch webhooks in channel and delete newly created ones
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

        // Quarantine creator
        await AntiNukeService.quarantineActor(
          guild,
          actor.id,
          `Unauthorized Webhook Shield: Created unauthorized webhook in <#${channel.id}>.`
        );

        // Record incident
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
   * Threat & Phishing Filter: scans message text and attachments for malicious patterns
   */
  public static async inspectMessage(message: Message): Promise<boolean> {
    if (message.author.bot || !message.guild) return false;

    const content = message.content || '';
    const attachments = message.attachments;

    let violationType: string | null = null;
    let violationDetail: string = '';

    // 1. Check for dangerous executable file uploads
    for (const [, attachment] of attachments) {
      const name = attachment.name.toLowerCase();
      const isDangerous = this.DANGEROUS_EXTENSIONS.some(ext => name.endsWith(ext));
      if (isDangerous) {
        violationType = 'DANGEROUS_EXECUTABLE';
        violationDetail = `Blocked malicious file payload: \`${attachment.name}\``;
        break;
      }
    }

    // 2. Check for Token Grabbers
    if (!violationType && this.TOKEN_GRABBER_PATTERN.test(content)) {
      violationType = 'TOKEN_GRABBER_SIGNATURE';
      violationDetail = 'Detected active Discord token pattern signature.';
    }

    // 3. Check for Phishing / Typosquatting / Nitro scam domains
    if (!violationType) {
      for (const pattern of this.PHISHING_PATTERNS) {
        if (pattern.test(content)) {
          violationType = 'PHISHING_NITRO_SCAM';
          violationDetail = `Detected deceptive domain matching pattern: \`${pattern.source}\``;
          break;
        }
      }
    }

    // 4. Check for URL shorteners masking destinations
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

        // Timeout sender for 1 hour to neutralize automated attacks
        if (message.member?.moderatable) {
          await message.member.timeout(60 * 60 * 1000, `[THREAT SHIELD] ${violationDetail}`).catch(() => null);
        }

        // Send alert in channel
        const alertEmbed = new EmbedBuilder()
          .setTitle('🛡️ GUARD THREAT SHIELD // PAYLOAD INTERCEPTED')
          .setColor(CONFIG.DANGER_COLOR)
          .setDescription(
            `⚠️ Security risk detected from <@${message.author.id}>.\n` +
            `**Classification:** \`${violationType}\`\n` +
            `**Action:** Message deleted & sender muted for 1 hour.`
          )
          .setFooter({ text: 'GUARD Enterprise Defensive Engine' })
          .setTimestamp();

        if ('send' in message.channel) {
          await (message.channel as TextChannel).send({ embeds: [alertEmbed] }).then((msg: any) => {
            setTimeout(() => msg.delete().catch(() => null), 8000);
          }).catch(() => null);
        }

        // Record incident
        await recordSecurityIncident(
          message.guild.id,
          violationType,
          message.author.id,
          violationDetail,
          'Message Deleted & 1h Timeout Applied'
        );

        // Dispatch audit log
        await MasterSocService.logAudit(message.client, message.guild.id, alertEmbed);
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
