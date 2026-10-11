import {
  Guild,
  GuildMember,
  ChannelType,
  AuditLogEvent,
  PermissionsBitField,
  PermissionFlagsBits,
  EmbedBuilder,
  NonThreadGuildBasedChannel,
} from 'discord.js';
import {
  getOrCreateGuildConfig,
  recordSecurityIncident,
  getChannelSnapshot,
  getRoleSnapshot,
  saveChannelSnapshot,
  saveRoleSnapshot,
} from '../db';
import { CONFIG, isMasterOwner } from '../config';
import { MasterSocService } from './masterSocService';

interface ActionLog {
  timestamp: number;
}

export class AntiNukeService {
  // Sliding window storage: key = `${guildId}:${actorId}:${actionType}` -> array of timestamps
  private static slidingWindows = new Map<string, number[]>();
  private static restorationLock = new Set<string>();

  private static WINDOW_MS = 10_000; // 10 seconds

  // Thresholds within 10s:
  // > 2 channels deleted
  // > 3 roles modified/deleted
  // > 3 members banned/kicked
  public static THRESHOLDS = {
    CHANNEL_DELETE: 2,
    ROLE_MUTATION: 3,
    MEMBER_REMOVE: 3,
  };

  /**
   * Tracks an action in the 10-second sliding window and returns true if threshold is breached
   */
  public static trackAction(
    guildId: string,
    actorId: string,
    actionType: 'CHANNEL_DELETE' | 'ROLE_MUTATION' | 'MEMBER_REMOVE'
  ): boolean {
    const key = `${guildId}:${actorId}:${actionType}`;
    const now = Date.now();
    const timestamps = (this.slidingWindows.get(key) || []).filter(t => now - t <= this.WINDOW_MS);
    timestamps.push(now);
    this.slidingWindows.set(key, timestamps);

    const threshold = this.THRESHOLDS[actionType];
    return timestamps.length > threshold;
  }

  /**
   * Quarantine an actor: strip dangerous roles, apply timeout, or ban
   */
  public static async quarantineActor(
    guild: Guild,
    actorId: string,
    reason: string
  ): Promise<void> {
    if (actorId === guild.ownerId || isMasterOwner(actorId) || actorId === guild.client.user?.id) {
      return; // Never quarantine owner or bot
    }

    try {
      const member = await guild.members.fetch(actorId).catch(() => null);
      if (!member) return;

      // 1. Strip all roles with administrative/management permissions
      const dangerousRoles = member.roles.cache.filter(role => {
        if (role.id === guild.id) return false;
        return (
          role.permissions.has(PermissionFlagsBits.Administrator) ||
          role.permissions.has(PermissionFlagsBits.ManageGuild) ||
          role.permissions.has(PermissionFlagsBits.ManageChannels) ||
          role.permissions.has(PermissionFlagsBits.ManageRoles) ||
          role.permissions.has(PermissionFlagsBits.BanMembers) ||
          role.permissions.has(PermissionFlagsBits.KickMembers)
        );
      });

      if (dangerousRoles.size > 0) {
        await member.roles.remove(dangerousRoles, `[ANTI-NUKE QUARANTINE] ${reason}`).catch(() => null);
      }

      // 2. Apply max 28-day timeout
      if (member.moderatable) {
        const twentyEightDays = 28 * 24 * 60 * 60 * 1000;
        await member.timeout(twentyEightDays, `[ANTI-NUKE QUARANTINE] ${reason}`).catch(() => null);
      } else {
        // If cannot timeout due to hierarchy, attempt ban
        await guild.bans.create(actorId, { reason: `[ANTI-NUKE QUARANTINE] ${reason}` }).catch(() => null);
      }

      // 3. Record incident
      await recordSecurityIncident(guild.id, 'ANTI_NUKE_QUARANTINE', actorId, reason, 'Permissions Stripped & Quarantined');

      // 4. Log alert to Master SOC
      const alertEmbed = new EmbedBuilder()
        .setTitle('🚨 ANTI-NUKE QUARANTINE TRIGGERED')
        .setColor(CONFIG.DANGER_COLOR)
        .setDescription(
          `**Target Guild:** ${guild.name} (\`${guild.id}\`)\n` +
          `**Offending Actor:** <@${actorId}> (\`${actorId}\`)\n` +
          `**Violation:** ${reason}\n` +
          `**Countermeasure:** Dangerous permissions revoked & actor placed under strict quarantine.`
        )
        .setTimestamp();

      await MasterSocService.logAudit(guild.client, guild.id, alertEmbed);
    } catch (error) {
      console.error(`[QUARANTINE ERROR] Guild ${guild.id}, Actor ${actorId}:`, error);
    }
  }

  /**
   * Handle channel deletion event with Anti-Nuke sliding window & restoration queue
   */
  public static async handleChannelDelete(channel: any): Promise<void> {
    if (!channel.guild) return;
    const guild = channel.guild as Guild;

    const config = await getOrCreateGuildConfig(guild.id);
    if (!config.antiNukeEnabled) return;

    try {
      // Find audit log executor
      const auditLogs = await guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.ChannelDelete,
      }).catch(() => null);

      const entry = auditLogs?.entries.first();
      const actorId = entry?.executor?.id;

      let isNukeBreach = false;
      if (actorId && actorId !== guild.ownerId && !isMasterOwner(actorId) && actorId !== guild.client.user?.id) {
        isNukeBreach = this.trackAction(guild.id, actorId, 'CHANNEL_DELETE');
        if (isNukeBreach) {
          await this.quarantineActor(
            guild,
            actorId,
            `Mass Channel Deletion: Exceeded threshold of >${this.THRESHOLDS.CHANNEL_DELETE} channels in 10s.`
          );
        }
      }

      // Restoration Queue: auto re-create deleted channel from snapshot
      const snapshot = await getChannelSnapshot(guild.id, channel.id);
      if (snapshot && !this.restorationLock.has(channel.id)) {
        this.restorationLock.add(channel.id);
        console.log(`[RESTORATION QUEUE] Re-creating deleted channel "${snapshot.name}" (${channel.id})...`);

        let overwrites: any[] = [];
        try {
          const parsed = JSON.parse(snapshot.permissionOverwrites);
          overwrites = parsed.map((o: any) => ({
            id: o.id,
            type: o.type,
            allow: BigInt(o.allow),
            deny: BigInt(o.deny),
          }));
        } catch {}

        await guild.channels.create({
          name: snapshot.name,
          type: snapshot.type,
          parent: snapshot.parentId || undefined,
          position: snapshot.position,
          topic: snapshot.topic || undefined,
          permissionOverwrites: overwrites,
        }).catch(err => console.error(`[RESTORATION QUEUE ERROR] Failed channel recreate:`, err));

        setTimeout(() => this.restorationLock.delete(channel.id), 5000);
      }
    } catch (err) {
      console.error(`[ANTI-NUKE CHANNEL DELETE ERROR]:`, err);
    }
  }

  /**
   * Handle role deletion event with Anti-Nuke sliding window & restoration queue
   */
  public static async handleRoleDelete(role: any): Promise<void> {
    if (!role.guild) return;
    const guild = role.guild as Guild;

    const config = await getOrCreateGuildConfig(guild.id);
    if (!config.antiNukeEnabled) return;

    try {
      const auditLogs = await guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.RoleDelete,
      }).catch(() => null);

      const entry = auditLogs?.entries.first();
      const actorId = entry?.executor?.id;

      let isNukeBreach = false;
      if (actorId && actorId !== guild.ownerId && !isMasterOwner(actorId) && actorId !== guild.client.user?.id) {
        isNukeBreach = this.trackAction(guild.id, actorId, 'ROLE_MUTATION');
        if (isNukeBreach) {
          await this.quarantineActor(
            guild,
            actorId,
            `Mass Role Deletion: Exceeded threshold of >${this.THRESHOLDS.ROLE_MUTATION} roles in 10s.`
          );
        }
      }

      // Restoration Queue: auto re-create deleted role from snapshot
      const snapshot = await getRoleSnapshot(guild.id, role.id);
      if (snapshot && !this.restorationLock.has(role.id)) {
        this.restorationLock.add(role.id);
        console.log(`[RESTORATION QUEUE] Re-creating deleted role "${snapshot.name}" (${role.id})...`);

        await guild.roles.create({
          name: snapshot.name,
          color: snapshot.color,
          hoist: snapshot.hoist,
          permissions: BigInt(snapshot.permissions),
          position: snapshot.position,
          mentionable: snapshot.mentionable,
        }).catch(err => console.error(`[RESTORATION QUEUE ERROR] Failed role recreate:`, err));

        setTimeout(() => this.restorationLock.delete(role.id), 5000);
      }
    } catch (err) {
      console.error(`[ANTI-NUKE ROLE DELETE ERROR]:`, err);
    }
  }

  /**
   * Handle member ban/kick with Anti-Nuke sliding window
   */
  public static async handleMemberRemoveOrBan(guild: Guild, type: 'BAN' | 'KICK'): Promise<void> {
    const config = await getOrCreateGuildConfig(guild.id);
    if (!config.antiNukeEnabled) return;

    try {
      const auditType = type === 'BAN' ? AuditLogEvent.MemberBanAdd : AuditLogEvent.MemberKick;
      const auditLogs = await guild.fetchAuditLogs({
        limit: 1,
        type: auditType,
      }).catch(() => null);

      const entry = auditLogs?.entries.first();
      const actorId = entry?.executor?.id;

      if (actorId && actorId !== guild.ownerId && !isMasterOwner(actorId) && actorId !== guild.client.user?.id) {
        const isNukeBreach = this.trackAction(guild.id, actorId, 'MEMBER_REMOVE');
        if (isNukeBreach) {
          await this.quarantineActor(
            guild,
            actorId,
            `Mass Member Eviction: Exceeded threshold of >${this.THRESHOLDS.MEMBER_REMOVE} bans/kicks in 10s.`
          );
        }
      }
    } catch (err) {
      console.error(`[ANTI-NUKE MEMBER EVICTION ERROR]:`, err);
    }
  }

  /**
   * Snapshot all channels and roles across a guild into DB
   */
  public static async snapshotGuild(guild: Guild): Promise<void> {
    try {
      for (const [, channel] of guild.channels.cache) {
        await saveChannelSnapshot(channel);
      }
      for (const [, role] of guild.roles.cache) {
        await saveRoleSnapshot(role);
      }
    } catch (error) {
      console.error(`[SNAPSHOT GUILD ERROR] ${guild.name}:`, error);
    }
  }
}
