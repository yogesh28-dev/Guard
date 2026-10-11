import { PrismaClient, GuildConfig, SecurityIncident, ChannelSnapshot, RoleSnapshot } from '@prisma/client';
import { GuildBasedChannel, Role, ChannelType } from 'discord.js';

export const prisma = new PrismaClient();

export async function getOrCreateGuildConfig(guildId: string): Promise<GuildConfig> {
  let config = await prisma.guildConfig.findUnique({
    where: { guildId },
  });

  if (!config) {
    config = await prisma.guildConfig.create({
      data: {
        guildId,
        antiNukeEnabled: true,
        antiRaidEnabled: true,
        isLockedDown: false,
      },
    });
  }

  return config;
}

export async function updateGuildConfig(
  guildId: string,
  data: Partial<Omit<GuildConfig, 'guildId' | 'createdAt' | 'updatedAt'>>
): Promise<GuildConfig> {
  return await prisma.guildConfig.upsert({
    where: { guildId },
    create: {
      guildId,
      ...data,
    },
    update: data,
  });
}

export async function recordSecurityIncident(
  guildId: string,
  type: string,
  actorId: string,
  details: string,
  actionTaken: string
): Promise<SecurityIncident> {
  return await prisma.securityIncident.create({
    data: {
      guildId,
      type,
      actorId,
      details,
      actionTaken,
    },
  });
}

export async function get24hIncidentCount(guildId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return await prisma.securityIncident.count({
    where: {
      guildId,
      timestamp: { gte: since },
    },
  });
}

export async function get24hIncidents(guildId: string): Promise<SecurityIncident[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return await prisma.securityIncident.findMany({
    where: {
      guildId,
      timestamp: { gte: since },
    },
    orderBy: { timestamp: 'desc' },
  });
}

export async function saveChannelSnapshot(channel: GuildBasedChannel): Promise<void> {
  try {
    const parentId = 'parentId' in channel ? (channel as any).parentId : null;
    const topic = 'topic' in channel ? (channel as any).topic : null;
    const position = 'position' in channel ? (channel as any).position : 0;
    let overwrites: any[] = [];
    if ('permissionOverwrites' in channel && (channel as any).permissionOverwrites?.cache) {
      const cache = (channel as any).permissionOverwrites.cache;
      if (typeof cache.map === 'function') {
        overwrites = cache.map((o: any) => ({
          id: o.id,
          type: o.type,
          allow: o.allow?.bitfield?.toString?.() || '0',
          deny: o.deny?.bitfield?.toString?.() || '0',
        }));
      } else if (cache instanceof Map) {
        for (const [, o] of cache as Map<string, any>) {
          overwrites.push({
            id: o.id,
            type: o.type,
            allow: o.allow?.bitfield?.toString?.() || '0',
            deny: o.deny?.bitfield?.toString?.() || '0',
          });
        }
      }
    }

    await prisma.channelSnapshot.upsert({
      where: {
        guildId_channelId: {
          guildId: channel.guild.id,
          channelId: channel.id,
        },
      },
      create: {
        guildId: channel.guild.id,
        channelId: channel.id,
        name: channel.name,
        type: channel.type,
        parentId,
        position,
        topic,
        permissionOverwrites: JSON.stringify(overwrites),
      },
      update: {
        name: channel.name,
        type: channel.type,
        parentId,
        position,
        topic,
        permissionOverwrites: JSON.stringify(overwrites),
      },
    });
  } catch (error) {
    console.error(`[SNAPSHOT ERROR] Failed to save channel ${channel.id}:`, error);
  }
}

export async function getChannelSnapshot(guildId: string, channelId: string): Promise<ChannelSnapshot | null> {
  return await prisma.channelSnapshot.findUnique({
    where: {
      guildId_channelId: { guildId, channelId },
    },
  });
}

export async function deleteChannelSnapshot(guildId: string, channelId: string): Promise<void> {
  await prisma.channelSnapshot.deleteMany({
    where: { guildId, channelId },
  }).catch(() => null);
}

export async function saveRoleSnapshot(role: Role): Promise<void> {
  try {
    if (role.id === role.guild.id) return; // skip @everyone

    await prisma.roleSnapshot.upsert({
      where: {
        guildId_roleId: {
          guildId: role.guild.id,
          roleId: role.id,
        },
      },
      create: {
        guildId: role.guild.id,
        roleId: role.id,
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        position: role.position,
        permissions: role.permissions.bitfield.toString(),
        mentionable: role.mentionable,
      },
      update: {
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        position: role.position,
        permissions: role.permissions.bitfield.toString(),
        mentionable: role.mentionable,
      },
    });
  } catch (error) {
    console.error(`[SNAPSHOT ERROR] Failed to save role ${role.id}:`, error);
  }
}

export async function getRoleSnapshot(guildId: string, roleId: string): Promise<RoleSnapshot | null> {
  return await prisma.roleSnapshot.findUnique({
    where: {
      guildId_roleId: { guildId, roleId },
    },
  });
}

export async function deleteRoleSnapshot(guildId: string, roleId: string): Promise<void> {
  await prisma.roleSnapshot.deleteMany({
    where: { guildId, roleId },
  }).catch(() => null);
}
