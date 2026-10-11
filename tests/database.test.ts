import { describe, it, expect, afterAll } from 'vitest';
import { prisma, getOrCreateGuildConfig, updateGuildConfig } from '../src/db';

describe('Database & GuildConfig Model', () => {
  const testGuildId = '999888777666555444';

  afterAll(async () => {
    await prisma.guildConfig.deleteMany({ where: { guildId: testGuildId } }).catch(() => null);
    await prisma.$disconnect();
  });

  it('should initialize and retrieve default GuildConfig', async () => {
    const config = await getOrCreateGuildConfig(testGuildId);
    expect(config.guildId).toBe(testGuildId);
    expect(config.antiNukeEnabled).toBe(true);
    expect(config.antiRaidEnabled).toBe(true);
    expect(config.isLockedDown).toBe(false);
  });

  it('should update GuildConfig fields', async () => {
    const updated = await updateGuildConfig(testGuildId, {
      welcomeChannelId: '111111111111111111',
      byeChannelId: '222222222222222222',
      logChannelId: '333333333333333333',
      isLockedDown: true,
    });

    expect(updated.welcomeChannelId).toBe('111111111111111111');
    expect(updated.byeChannelId).toBe('222222222222222222');
    expect(updated.logChannelId).toBe('333333333333333333');
    expect(updated.isLockedDown).toBe(true);
  });
});
