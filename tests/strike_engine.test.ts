import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/db';
import { StrikeService } from '../src/services/strikeService';
import { ModerationService } from '../src/services/moderationService';
import { MasterCommandExecutor } from '../src/services/masterCommandExecutor';
import { CONFIG } from '../src/config';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

describe('Forensic Case ID Locker & 5-Strike Auto-Escalation Engine', () => {
  const testGuildId = '999111222333444555';
  const testUserId = '888222333444555666';
  const testModeratorId = '777333444555666777';

  let mockAuditChannelSend: any;
  let mockTimeout: any;
  let mockBan: any;
  let mockRoleRemove: any;
  let mockSend: any;
  let mockTargetGuild: any;
  let mockMember: any;

  beforeEach(async () => {
    // Clear test data
    await prisma.moderationCase.deleteMany({ where: { guildId: testGuildId } }).catch(() => null);
    await prisma.userStrike.deleteMany({ where: { guildId: testGuildId } }).catch(() => null);

    mockAuditChannelSend = vi.fn().mockResolvedValue({});
    mockTimeout = vi.fn().mockResolvedValue({});
    mockBan = vi.fn().mockResolvedValue({});
    mockRoleRemove = vi.fn().mockResolvedValue({});
    mockSend = vi.fn().mockResolvedValue({});

    const mockRolePrivileged = {
      id: 'role_admin_123',
      name: 'Sentinel Admin',
      permissions: {
        has: (perm: bigint) => perm === PermissionFlagsBits.Administrator || perm === PermissionFlagsBits.ManageGuild,
      },
    };

    const mockRoleNormal = {
      id: 'role_member_456',
      name: 'Regular Resident',
      permissions: {
        has: () => false,
      },
    };

    const rolesMap = new Map<string, any>([
      ['role_admin_123', mockRolePrivileged],
      ['role_member_456', mockRoleNormal],
    ]);

    mockMember = {
      id: testUserId,
      user: {
        id: testUserId,
        tag: 'CyberOffender#9999',
        username: 'cyberoffender',
      },
      roles: {
        cache: rolesMap,
        remove: mockRoleRemove,
      },
      timeout: mockTimeout,
      ban: mockBan,
      send: mockSend,
      kickable: true,
      moderatable: true,
      kick: vi.fn().mockResolvedValue({}),
    } as any;

    const mockAuditChannel = {
      type: ChannelType.GuildText,
      name: 'audit-logs',
      topic: `TARGET_GUILD_ID:${testGuildId}:AUDIT`,
      send: mockAuditChannelSend,
    };

    const mockMasterGuild = {
      id: CONFIG.MASTER_GUILD_ID,
      channels: {
        cache: new Map([['chan_audit', mockAuditChannel]]),
      },
    };

    mockTargetGuild = {
      id: testGuildId,
      name: 'Aegis Defense Alpha',
      roles: {
        everyone: { id: testGuildId },
      },
      bans: {
        create: vi.fn().mockResolvedValue({}),
        remove: vi.fn().mockResolvedValue({}),
      },
      members: {
        fetch: vi.fn().mockResolvedValue(mockMember),
      },
    } as any;

    const mockClient = {
      user: { id: 'bot_guard_123', tag: 'GUARD#0001' },
      guilds: {
        cache: new Map([
          [CONFIG.MASTER_GUILD_ID, mockMasterGuild],
          [testGuildId, mockTargetGuild],
        ]),
      },
      users: {
        fetch: vi.fn().mockResolvedValue({ id: testUserId, tag: 'CyberOffender#9999' }),
      },
    } as any;

    mockTargetGuild.client = mockClient;
  });

  afterAll(async () => {
    await prisma.moderationCase.deleteMany({ where: { guildId: testGuildId } }).catch(() => null);
    await prisma.userStrike.deleteMany({ where: { guildId: testGuildId } }).catch(() => null);
    await prisma.$disconnect();
  });

  it('should create a forensic case, assign autoincrement caseId, and stream telemetry to Master SOC #audit-logs', async () => {
    const createdCase = await StrikeService.createForensicCase({
      guildId: testGuildId,
      targetId: testUserId,
      targetTag: 'CyberOffender#9999',
      moderatorId: testModeratorId,
      action: 'WARN',
      reason: 'Unauthorized access to restricted frequency',
      evidenceJson: JSON.stringify({ ip: '192.168.1.1', attempts: 3 }),
      client: mockTargetGuild.client,
    });

    expect(createdCase.caseId).toBeGreaterThan(0);
    expect(createdCase.guildId).toBe(testGuildId);
    expect(createdCase.targetId).toBe(testUserId);
    expect(createdCase.action).toBe('WARN');
    expect(createdCase.evidenceJson).toContain('192.168.1.1');

    // Retrieve via getCase helper
    const fetchedCase = await StrikeService.getCase(createdCase.caseId);
    expect(fetchedCase).not.toBeNull();
    expect(fetchedCase?.caseId).toBe(createdCase.caseId);

    // Verify audit telemetry was dispatched with #CASE-[caseId] badge
    expect(mockAuditChannelSend).toHaveBeenCalled();
    const sentEmbed = mockAuditChannelSend.mock.calls[0][0].embeds[0];
    expect(sentEmbed.data.title).toContain(`#CASE-${createdCase.caseId}`);
  });

  it('should escalate through all 5 strikes progressively with corresponding penalties', async () => {
    // STRIKE 1: Warning + DM alert
    const strike1 = await StrikeService.issueStrike(
      mockTargetGuild,
      mockMember,
      testModeratorId,
      'First security violation: spamming pings'
    );
    expect(strike1.strikeCount).toBe(1);
    expect(strike1.penaltyApplied).toContain('Warning issued');
    expect(mockSend).toHaveBeenCalled();
    expect(mockTimeout).not.toHaveBeenCalled();
    expect(mockBan).not.toHaveBeenCalled();

    // STRIKE 2: 15-minute timeout (15 * 60 * 1000 ms)
    const strike2 = await StrikeService.issueStrike(
      mockTargetGuild,
      mockMember,
      testModeratorId,
      'Second violation: repeated spamming'
    );
    expect(strike2.strikeCount).toBe(2);
    expect(strike2.penaltyApplied).toContain('15-minute');
    expect(mockTimeout).toHaveBeenCalledWith(15 * 60 * 1000, expect.stringContaining('2/5'));

    // STRIKE 3: 6-hour timeout (6 * 60 * 60 * 1000 ms)
    const strike3 = await StrikeService.issueStrike(
      mockTargetGuild,
      mockMember,
      testModeratorId,
      'Third violation: evasion attempt'
    );
    expect(strike3.strikeCount).toBe(3);
    expect(strike3.penaltyApplied).toContain('6-hour');
    expect(mockTimeout).toHaveBeenCalledWith(6 * 60 * 60 * 1000, expect.stringContaining('3/5'));

    // STRIKE 4: 24-hour timeout (24 * 60 * 60 * 1000 ms) + strip roles with administrative/moderation permissions
    const strike4 = await StrikeService.issueStrike(
      mockTargetGuild,
      mockMember,
      testModeratorId,
      'Fourth violation: privilege abuse'
    );
    expect(strike4.strikeCount).toBe(4);
    expect(strike4.penaltyApplied).toContain('24-hour');
    expect(strike4.penaltyApplied).toContain('roles revoked');
    expect(mockTimeout).toHaveBeenCalledWith(24 * 60 * 60 * 1000, expect.stringContaining('4/5'));
    expect(mockRoleRemove).toHaveBeenCalledWith('role_admin_123', expect.any(String));

    // STRIKE 5+: Permanent Guild Ban
    const strike5 = await StrikeService.issueStrike(
      mockTargetGuild,
      mockMember,
      testModeratorId,
      'Fifth violation: ultimate breach threshold'
    );
    expect(strike5.strikeCount).toBe(5);
    expect(strike5.penaltyApplied).toContain('Permanent Guild Ban');
    expect(mockBan).toHaveBeenCalledWith({ reason: expect.stringContaining('5/5') });

    // Verify getUserStrikes helper
    const activeStrikes = await StrikeService.getUserStrikes(testGuildId, testUserId);
    expect(activeStrikes).toBe(5);

    // Verify clearUserStrikes helper
    await StrikeService.clearUserStrikes(testGuildId, testUserId);
    const clearedStrikes = await StrikeService.getUserStrikes(testGuildId, testUserId);
    expect(clearedStrikes).toBe(0);
  });

  it('should automatically register Forensic Case in ModerationService ban, kick, and timeout', async () => {
    // 1. Ban User
    const banRes = await ModerationService.banUser(
      mockTargetGuild,
      testUserId,
      'Hostile raid attempt',
      1,
      testModeratorId
    );
    expect(banRes.success).toBe(true);
    expect(banRes.caseId).toBeDefined();
    expect(banRes.message).toContain(`#CASE-${banRes.caseId}`);

    const banCase = await StrikeService.getCase(banRes.caseId!);
    expect(banCase?.action).toBe('BAN');

    // 2. Kick Member
    const kickRes = await ModerationService.kickUser(
      mockTargetGuild,
      testUserId,
      'Inactivity and non-compliance',
      testModeratorId
    );
    expect(kickRes.success).toBe(true);
    expect(kickRes.caseId).toBeDefined();
    expect(kickRes.message).toContain(`#CASE-${kickRes.caseId}`);

    const kickCase = await StrikeService.getCase(kickRes.caseId!);
    expect(kickCase?.action).toBe('KICK');

    // 3. Timeout Member
    const timeoutRes = await ModerationService.timeoutUser(
      mockTargetGuild,
      testUserId,
      30,
      'Disruptive audio spam',
      testModeratorId
    );
    expect(timeoutRes.success).toBe(true);
    expect(timeoutRes.caseId).toBeDefined();
    expect(timeoutRes.message).toContain(`#CASE-${timeoutRes.caseId}`);

    const timeoutCase = await StrikeService.getCase(timeoutRes.caseId!);
    expect(timeoutCase?.action).toBe('TIMEOUT');
  });

  it('should support CLI terminal commands: case <caseId>, strikes <userId>, and clearstrikes <userId>', async () => {
    // Create a known case and a known strike
    const testCase = await StrikeService.createForensicCase({
      guildId: testGuildId,
      targetId: testUserId,
      targetTag: 'CyberOffender#9999',
      moderatorId: testModeratorId,
      action: 'QUARANTINE',
      reason: 'Malware distribution payload caught',
    });

    await StrikeService.issueStrike(mockTargetGuild, mockMember, testModeratorId, 'Initial Warning');

    const mockReply = vi.fn();
    const createMsg = (content: string) => ({
      author: { id: CONFIG.MASTER_OWNER_ID, bot: false, tag: 'Owner#0001' },
      guildId: CONFIG.MASTER_GUILD_ID,
      channel: {
        name: 'command',
        topic: `TARGET_GUILD_ID:${testGuildId}:COMMAND`,
      },
      content,
      reply: mockReply,
    } as any);

    // 1. Test case <caseId>
    await MasterCommandExecutor.execute(createMsg(`case ${testCase.caseId}`), mockTargetGuild.client);
    expect(mockReply).toHaveBeenCalled();
    const reply1 = mockReply.mock.calls[0][0].embeds[0].data.description;
    expect(reply1).toContain(`#CASE-${testCase.caseId}`);
    expect(reply1).toContain('QUARANTINE');
    expect(reply1).toContain('Malware distribution payload');

    mockReply.mockClear();

    // 2. Test strikes <userId>
    await MasterCommandExecutor.execute(createMsg(`strikes ${testUserId}`), mockTargetGuild.client);
    expect(mockReply).toHaveBeenCalled();
    const reply2 = mockReply.mock.calls[0][0].embeds[0].data.description;
    expect(reply2).toContain('1/5');
    expect(reply2).toContain('ACTIVE AUTO-ESCALATION');

    mockReply.mockClear();

    // 3. Test clearstrikes <userId>
    await MasterCommandExecutor.execute(createMsg(`clearstrikes ${testUserId}`), mockTargetGuild.client);
    expect(mockReply).toHaveBeenCalled();
    const reply3 = mockReply.mock.calls[0][0].embeds[0].data.description;
    expect(reply3).toContain('reset to 0/5');

    const updatedStrikes = await StrikeService.getUserStrikes(testGuildId, testUserId);
    expect(updatedStrikes).toBe(0);
  });
});
