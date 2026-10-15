import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/db';
import { GlobalThreatService } from '../src/services/globalThreatService';
import { StrikeService } from '../src/services/strikeService';
import { onGuildMemberAdd } from '../src/events/guildMemberAdd';
import { MasterCommandExecutor } from '../src/services/masterCommandExecutor';
import { CONFIG } from '../src/config';
import { ChannelType } from 'discord.js';

describe('Global Threat Intelligence Network & Pre-Emptive Auto-Ban', () => {
  const testThreatId = '888777111222333444';
  const testNormalUserId = '111222333444555666';
  const testGuildA = '999111000111000111';
  const testGuildB = '999222000222000222';

  let mockBanA: any;
  let mockBanB: any;
  let mockUnbanA: any;
  let mockUnbanB: any;
  let mockAuditSend: any;
  let mockBotStatusSend: any;
  let mockClient: any;

  beforeEach(async () => {
    // Clear test blacklist entries and moderation cases
    await prisma.globalBlacklist.deleteMany({
      where: { userId: { in: [testThreatId, testNormalUserId, CONFIG.MASTER_OWNER_ID] } },
    }).catch(() => null);

    await prisma.moderationCase.deleteMany({
      where: { targetId: { in: [testThreatId, testNormalUserId, CONFIG.MASTER_OWNER_ID] } },
    }).catch(() => null);

    mockBanA = vi.fn().mockResolvedValue({});
    mockBanB = vi.fn().mockResolvedValue({});
    mockUnbanA = vi.fn().mockResolvedValue({});
    mockUnbanB = vi.fn().mockResolvedValue({});
    mockAuditSend = vi.fn().mockResolvedValue({});
    mockBotStatusSend = vi.fn().mockResolvedValue({});

    const guildA = {
      id: testGuildA,
      name: 'Cyber Sentinel Guild A',
      bans: {
        create: mockBanA,
        remove: mockUnbanA,
      },
    };

    const guildB = {
      id: testGuildB,
      name: 'Cyber Sentinel Guild B',
      bans: {
        create: mockBanB,
        remove: mockUnbanB,
      },
    };

    const auditChannel = {
      type: ChannelType.GuildText,
      name: 'audit-logs',
      topic: `TARGET_GUILD_ID:${testGuildA}:AUDIT`,
      send: mockAuditSend,
    };

    const botStatusChannel = {
      type: ChannelType.GuildText,
      name: 'bot-status',
      send: mockBotStatusSend,
    };

    const masterGuild = {
      id: CONFIG.MASTER_GUILD_ID,
      name: 'Master SOC Node',
      channels: {
        cache: new Map([
          ['chan_audit', auditChannel],
          ['chan_status', botStatusChannel],
        ]),
      },
    };

    mockClient = {
      user: { id: 'bot_guard_enterprise', tag: 'GUARD#0001' },
      guilds: {
        cache: new Map([
          [CONFIG.MASTER_GUILD_ID, masterGuild],
          [testGuildA, guildA],
          [testGuildB, guildB],
        ]),
      },
      users: {
        fetch: vi.fn().mockImplementation(async (id: string) => ({
          id,
          tag: `ThreatActor_${id}#6666`,
        })),
      },
    } as any;
  });

  afterAll(async () => {
    await prisma.globalBlacklist.deleteMany({
      where: { userId: { in: [testThreatId, testNormalUserId, CONFIG.MASTER_OWNER_ID] } },
    }).catch(() => null);

    await prisma.moderationCase.deleteMany({
      where: { targetId: { in: [testThreatId, testNormalUserId, CONFIG.MASTER_OWNER_ID] } },
    }).catch(() => null);

    await prisma.$disconnect();
  });

  it('should flag actor, record GlobalBlacklist, cross-ban across guilds, and create forensic case', async () => {
    const result = await GlobalThreatService.flagAndGlobalBan(
      mockClient,
      testThreatId,
      'BlackHatInfiltrator#1337',
      'Coordinated token raid attempt',
      testGuildA,
      'CRITICAL'
    );

    expect(result.blacklisted).toBe(true);
    expect(result.bannedGuildsCount).toBe(2);
    expect(result.caseId).toBeDefined();

    // Verify ban calls on both target guilds
    expect(mockBanA).toHaveBeenCalledWith(testThreatId, expect.objectContaining({
      reason: expect.stringContaining('GUARD GLOBAL THREAT NETWORK'),
    }));
    expect(mockBanB).toHaveBeenCalledWith(testThreatId, expect.objectContaining({
      reason: expect.stringContaining('GUARD GLOBAL THREAT NETWORK'),
    }));

    // Verify isBlacklisted lookup
    const blacklistRecord = await GlobalThreatService.isBlacklisted(testThreatId);
    expect(blacklistRecord).not.toBeNull();
    expect(blacklistRecord?.userId).toBe(testThreatId);
    expect(blacklistRecord?.severity).toBe('CRITICAL');
    expect(blacklistRecord?.reason).toContain('Coordinated token raid');

    // Verify Forensic Case was logged
    const forensicCase = await StrikeService.getCase(result.caseId!);
    expect(forensicCase?.action).toBe('GLOBAL_BAN');
    expect(forensicCase?.targetId).toBe(testThreatId);
  });

  it('should guarantee Master Owner and Bot immunity from global bans', async () => {
    const ownerResult = await GlobalThreatService.flagAndGlobalBan(
      mockClient,
      CONFIG.MASTER_OWNER_ID,
      'SuperOwner#0001',
      'Malicious attempt to ban the Super Owner',
      testGuildA
    );

    expect(ownerResult.blacklisted).toBe(false);
    expect(ownerResult.bannedGuildsCount).toBe(0);
    expect(ownerResult.reason).toBe('TARGET_IMMUNE');

    const botResult = await GlobalThreatService.flagAndGlobalBan(
      mockClient,
      mockClient.user.id,
      'GUARD#0001',
      'Attempt to ban the bot itself',
      testGuildA
    );

    expect(botResult.blacklisted).toBe(false);
    expect(botResult.bannedGuildsCount).toBe(0);
    expect(botResult.reason).toBe('TARGET_IMMUNE');

    // Verify neither were saved to GlobalBlacklist
    const ownerCheck = await GlobalThreatService.isBlacklisted(CONFIG.MASTER_OWNER_ID);
    expect(ownerCheck).toBeNull();

    expect(mockBanA).not.toHaveBeenCalled();
    expect(mockBanB).not.toHaveBeenCalled();
  });

  it('should pardon globally and unban across all guilds', async () => {
    // Setup blacklist record first
    await GlobalThreatService.flagAndGlobalBan(
      mockClient,
      testThreatId,
      'ReformedUser#0001',
      'Initial infraction',
      testGuildA
    );

    const unbanResult = await GlobalThreatService.globalUnban(
      mockClient,
      testThreatId,
      'Successful appeal verification'
    );

    expect(unbanResult.unbannedGuildsCount).toBe(2);
    expect(mockUnbanA).toHaveBeenCalledWith(testThreatId, expect.stringContaining('GUARD GLOBAL THREAT UNBAN'));
    expect(mockUnbanB).toHaveBeenCalledWith(testThreatId, expect.stringContaining('GUARD GLOBAL THREAT UNBAN'));

    // Check blacklist is cleared
    const checkAfter = await GlobalThreatService.isBlacklisted(testThreatId);
    expect(checkAfter).toBeNull();
  });

  it('should intercept blacklisted threat actor on guild join (guildMemberAdd) and pre-emptively ban without welcome dispatch', async () => {
    // Flag threat actor first
    await GlobalThreatService.flagAndGlobalBan(
      mockClient,
      testThreatId,
      'HostileRaider#0000',
      'Persistent spam raider',
      testGuildA
    );

    const mockMemberBan = vi.fn().mockResolvedValue({});
    const mockChannelSend = vi.fn().mockResolvedValue({});

    const mockJoiningMember = {
      id: testThreatId,
      guild: {
        id: testGuildA,
        name: 'Target Cyber Grid',
        channels: {
          cache: new Map([
            ['welcome_chan', { id: 'welcome_chan', send: mockChannelSend }],
          ]),
        },
        client: mockClient,
      },
      user: {
        id: testThreatId,
        bot: false,
        tag: 'HostileRaider#0000',
        displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png',
        createdTimestamp: Date.now() - 3600000,
      },
      ban: mockMemberBan,
    } as any;

    await onGuildMemberAdd(mockJoiningMember);

    // Verify member was banned pre-emptively
    expect(mockMemberBan).toHaveBeenCalledWith(expect.objectContaining({
      reason: expect.stringContaining('GUARD GLOBAL THREAT NETWORK'),
    }));

    // Verify welcome card dispatch was NEVER invoked
    expect(mockChannelSend).not.toHaveBeenCalled();
  });

  it('should execute CLI terminal commands: globalban, globalunban, and blacklist', async () => {
    const mockReply = vi.fn();
    const createMsg = (content: string) => ({
      author: { id: CONFIG.MASTER_OWNER_ID, bot: false, tag: 'Owner#0001' },
      guildId: CONFIG.MASTER_GUILD_ID,
      channel: {
        name: 'command',
        topic: `TARGET_GUILD_ID:${testGuildA}:COMMAND`,
      },
      content,
      reply: mockReply,
    } as any);

    // 1. Terminal: globalban
    await MasterCommandExecutor.execute(createMsg(`globalban ${testThreatId} Infiltration attack`), mockClient);
    expect(mockReply).toHaveBeenCalled();
    let replyEmbed = mockReply.mock.calls[0][0].embeds[0].data.description;
    expect(replyEmbed).toContain('GLOBAL THREAT NEUTRALIZATION COMPLETE');
    expect(replyEmbed).toContain('Fleet Banned');

    mockReply.mockClear();

    // 2. Terminal: blacklist
    await MasterCommandExecutor.execute(createMsg('blacklist'), mockClient);
    expect(mockReply).toHaveBeenCalled();
    replyEmbed = mockReply.mock.calls[0][0].embeds[0].data.description;
    expect(replyEmbed).toContain('GLOBAL THREAT INTELLIGENCE BLACKLIST');
    expect(replyEmbed).toContain(testThreatId);

    mockReply.mockClear();

    // 3. Terminal: globalunban
    await MasterCommandExecutor.execute(createMsg(`globalunban ${testThreatId}`), mockClient);
    expect(mockReply).toHaveBeenCalled();
    replyEmbed = mockReply.mock.calls[0][0].embeds[0].data.description;
    expect(replyEmbed).toContain('GLOBAL PARDON EXECUTED');
    expect(replyEmbed).toContain('REMOVED');
  });
});
