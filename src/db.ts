import { PrismaClient, GuildConfig } from '@prisma/client';

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
