import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  prisma,
  getOrCreateGuildConfig,
  updateGuildConfig,
  recordSecurityIncident,
  get24hIncidentCount,
  get24hIncidents,
  saveChannelSnapshot,
  getChannelSnapshot,
  deleteChannelSnapshot,
  saveRoleSnapshot,
  getRoleSnapshot,
  deleteRoleSnapshot,
} from '../src/db';

describe('Database Models & Telemetry Snapshots', () => {
  const testGuildId = '999888777666555444';
  const testChannelId = '111222333444555666';
  const testRoleId = '777888999000111222';

  beforeAll(async () => {
    await prisma.guildConfig.deleteMany({ where: { guildId: testGuildId } }).catch(() => null);
    await prisma.securityIncident.deleteMany({ where: { guildId: testGuildId } }).catch(() => null);
    await prisma.channelSnapshot.deleteMany({ where: { guildId: testGuildId } }).catch(() => null);
    await prisma.roleSnapshot.deleteMany({ where: { guildId: testGuildId } }).catch(() => null);
  });

  afterAll(async () => {
    await prisma.guildConfig.deleteMany({ where: { guildId: testGuildId } }).catch(() => null);
    await prisma.securityIncident.deleteMany({ where: { guildId: testGuildId } }).catch(() => null);
    await prisma.channelSnapshot.deleteMany({ where: { guildId: testGuildId } }).catch(() => null);
    await prisma.roleSnapshot.deleteMany({ where: { guildId: testGuildId } }).catch(() => null);
    await prisma.$disconnect();
  });

  it('should initialize and retrieve default GuildConfig with new routing and template fields', async () => {
    const config = await getOrCreateGuildConfig(testGuildId);
    expect(config.guildId).toBe(testGuildId);
    expect(config.antiNukeEnabled).toBe(true);
    expect(config.antiRaidEnabled).toBe(true);
    expect(config.isLockedDown).toBe(false);
    expect(config.minAccountAgeDays).toBe(1);
    expect(config.autoEscalationEnabled).toBe(true);
  });

  it('should update GuildConfig log routing and custom template fields', async () => {
    const updated = await updateGuildConfig(testGuildId, {
      welcomeChannelId: '111111111111111111',
      welcomeTemplateUrl: 'https://cdn.discordapp.com/template-welcome.png',
      byeChannelId: '222222222222222222',
      byeTemplateUrl: 'https://cdn.discordapp.com/template-bye.png',
      auditVcLogChannelId: '333333333333333333',
      auditServerLogChannelId: '444444444444444444',
      auditMessageLogChannelId: '555555555555555555',
      honeypotChannelId: '666666666666666666',
      minAccountAgeDays: 7,
      autoEscalationEnabled: true,
    });

    expect(updated.welcomeTemplateUrl).toBe('https://cdn.discordapp.com/template-welcome.png');
    expect(updated.byeTemplateUrl).toBe('https://cdn.discordapp.com/template-bye.png');
    expect(updated.auditVcLogChannelId).toBe('333333333333333333');
    expect(updated.auditServerLogChannelId).toBe('444444444444444444');
    expect(updated.auditMessageLogChannelId).toBe('555555555555555555');
    expect(updated.honeypotChannelId).toBe('666666666666666666');
    expect(updated.minAccountAgeDays).toBe(7);
    expect(updated.autoEscalationEnabled).toBe(true);
  });

  it('should record security incidents and retrieve 24h stats', async () => {
    const inc = await recordSecurityIncident(
      testGuildId,
      'ANTI_NUKE_CHANNEL',
      'user_bad_actor',
      'Exceeded 2 channel deletes in 10s',
      'Quarantined'
    );

    expect(inc.guildId).toBe(testGuildId);
    expect(inc.type).toBe('ANTI_NUKE_CHANNEL');

    const count = await get24hIncidentCount(testGuildId);
    expect(count).toBeGreaterThanOrEqual(1);

    const incidents = await get24hIncidents(testGuildId);
    expect(incidents.length).toBeGreaterThanOrEqual(1);
    expect(incidents[0].type).toBe('ANTI_NUKE_CHANNEL');
  });

  it('should save, retrieve, and delete channel and role snapshots for restoration queue', async () => {
    const mockChannel = {
      id: testChannelId,
      name: 'secure-ops',
      type: 0,
      guild: { id: testGuildId },
      parentId: 'cat_123',
      position: 1,
      topic: 'Restricted Ops',
      permissionOverwrites: { cache: new Map() },
    } as any;

    await saveChannelSnapshot(mockChannel);
    const channelSnap = await getChannelSnapshot(testGuildId, testChannelId);
    expect(channelSnap).not.toBeNull();
    expect(channelSnap?.name).toBe('secure-ops');

    await deleteChannelSnapshot(testGuildId, testChannelId);
    const deletedChannelSnap = await getChannelSnapshot(testGuildId, testChannelId);
    expect(deletedChannelSnap).toBeNull();

    const mockRole = {
      id: testRoleId,
      name: 'Cyber Sentinel',
      color: 0x00f0ff,
      hoist: true,
      position: 5,
      permissions: { bitfield: BigInt(8) },
      mentionable: true,
      guild: { id: testGuildId },
    } as any;

    await saveRoleSnapshot(mockRole);
    const roleSnap = await getRoleSnapshot(testGuildId, testRoleId);
    expect(roleSnap).not.toBeNull();
    expect(roleSnap?.name).toBe('Cyber Sentinel');

    await deleteRoleSnapshot(testGuildId, testRoleId);
    const deletedRoleSnap = await getRoleSnapshot(testGuildId, testRoleId);
    expect(deletedRoleSnap).toBeNull();
  });
});
