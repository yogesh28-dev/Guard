import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { prisma, getOrCreateGuildConfig, updateGuildConfig } from '../src/db';
import { SecurityShieldService } from '../src/services/securityShieldService';
import { StrikeService } from '../src/services/strikeService';
import { GlobalThreatService } from '../src/services/globalThreatService';
import { BotStatusMonitorService } from '../src/services/botStatusMonitorService';
import { MasterCommandExecutor } from '../src/services/masterCommandExecutor';
import { onGuildMemberAdd } from '../src/events/guildMemberAdd';
import { onMessageCreate } from '../src/events/messageCreate';
import { CONFIG } from '../src/config';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

describe('Honeypot Trap System, Anti-Flood / Mass-Mention Heater & Anti-Alt Raid Gatekeeper', () => {
  const testGuildId = '999555444333222111';
  const testChannelId = '111222333444555001';
  const testHoneypotChannelId = '111222333444555999';
  const testAttackerId = '888000111222333444';
  const testLegitUserId = '777000111222333444';

  let mockClient: any;
  let mockAuditSend: any;
  let mockStatusSend: any;

  beforeEach(async () => {
    // Reset in-memory velocity maps
    SecurityShieldService.messageVelocityMap.clear();
    SecurityShieldService.joinVelocityMap.clear();
    BotStatusMonitorService.blockedThreatCount = 0;

    // Clean DB records
    await prisma.moderationCase.deleteMany({
      where: { guildId: testGuildId },
    }).catch(() => null);

    await prisma.userStrike.deleteMany({
      where: { guildId: testGuildId },
    }).catch(() => null);

    await prisma.globalBlacklist.deleteMany({
      where: { userId: { in: [testAttackerId, testLegitUserId] } },
    }).catch(() => null);

    // Initialize or reset guild config
    await updateGuildConfig(testGuildId, {
      honeypotChannelId: null,
      minAccountAgeDays: 1,
      antiNukeEnabled: true,
      antiRaidEnabled: true,
    });

    mockAuditSend = vi.fn().mockResolvedValue({});
    mockStatusSend = vi.fn().mockResolvedValue({});

    const auditChannel = {
      id: 'audit_chan_1',
      type: ChannelType.GuildText,
      name: 'audit-logs',
      topic: `TARGET_GUILD_ID:${testGuildId}:AUDIT`,
      send: mockAuditSend,
    };

    const statusChannel = {
      id: 'status_chan_1',
      type: ChannelType.GuildText,
      name: 'server-status',
      topic: `TARGET_GUILD_ID:${testGuildId}:STATUS`,
      send: mockStatusSend,
    };

    const channelsMap = new Map<string, any>([
      ['audit_chan_1', auditChannel],
      ['status_chan_1', statusChannel],
    ]);

    const mockTargetGuild = {
      id: testGuildId,
      name: 'Sentinel Test Fortress',
      ownerId: '999999999999999999',
      roles: {
        everyone: { id: testGuildId },
      },
      channels: {
        cache: channelsMap,
        create: vi.fn(),
      },
      members: {
        cache: new Map(),
        fetch: vi.fn(),
        ban: vi.fn().mockResolvedValue({}),
      },
      bans: {
        create: vi.fn().mockResolvedValue({}),
        remove: vi.fn().mockResolvedValue({}),
      },
    };

    const masterGuild = {
      id: CONFIG.MASTER_GUILD_ID,
      name: 'Master SOC Hub',
      channels: {
        cache: channelsMap,
      },
    };

    const guildsMap = new Map<string, any>([
      [testGuildId, mockTargetGuild],
      [CONFIG.MASTER_GUILD_ID, masterGuild],
    ]);

    mockClient = {
      user: {
        id: '123456789012345678',
        tag: 'GUARD#0001',
      },
      guilds: {
        cache: guildsMap,
      },
      users: {
        fetch: vi.fn().mockImplementation((id: string) =>
          Promise.resolve({ id, tag: `User_${id}#0001` })
        ),
      },
    };
  });

  afterAll(async () => {
    await prisma.guildConfig.deleteMany({
      where: { guildId: testGuildId },
    }).catch(() => null);
    await prisma.moderationCase.deleteMany({
      where: { guildId: testGuildId },
    }).catch(() => null);
    await prisma.userStrike.deleteMany({
      where: { guildId: testGuildId },
    }).catch(() => null);
    await prisma.globalBlacklist.deleteMany({
      where: { userId: { in: [testAttackerId, testLegitUserId] } },
    }).catch(() => null);
  });

  describe('1. Honeypot Trap System', () => {
    it('should provision honeypot trap channel and persist ID to database', async () => {
      const mockTrapChannel = {
        id: testHoneypotChannelId,
        name: '🔒・do-not-type-here',
        type: ChannelType.GuildText,
        send: vi.fn().mockResolvedValue({}),
        permissionOverwrites: {
          set: vi.fn().mockResolvedValue({}),
        },
      };

      const targetGuild = mockClient.guilds.cache.get(testGuildId);
      targetGuild.channels.create = vi.fn().mockResolvedValue(mockTrapChannel);

      const created = await SecurityShieldService.provisionHoneypotChannel(targetGuild);
      expect(created.id).toBe(testHoneypotChannelId);
      expect(targetGuild.channels.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '🔒・do-not-type-here',
          position: 0,
        })
      );
      expect(mockTrapChannel.send).toHaveBeenCalled();

      // Check DB persistence
      const config = await getOrCreateGuildConfig(testGuildId);
      expect(config.honeypotChannelId).toBe(testHoneypotChannelId);
    });

    it('should instantly ban with 24h purge, global blacklist, and record forensic case when attacker types in honeypot', async () => {
      await updateGuildConfig(testGuildId, { honeypotChannelId: testHoneypotChannelId });

      const mockDelete = vi.fn().mockResolvedValue({});
      const mockBan = vi.fn().mockResolvedValue({});

      const mockHoneypotMessage = {
        id: 'msg_trap_trigger',
        guild: mockClient.guilds.cache.get(testGuildId),
        channel: { id: testHoneypotChannelId, name: '🔒・do-not-type-here' },
        author: {
          id: testAttackerId,
          tag: 'HoneypotBot#1337',
          bot: false,
        },
        member: {
          id: testAttackerId,
          ban: mockBan,
        },
        content: 'CHECK OUT THIS SPAM LINK http://malicious.club',
        createdTimestamp: Date.now(),
        client: mockClient,
        delete: mockDelete,
      } as any;

      const intercepted = await SecurityShieldService.inspectHoneypotMessage(mockHoneypotMessage);
      expect(intercepted).toBe(true);

      // Verify message was deleted
      expect(mockDelete).toHaveBeenCalled();

      // Verify member was banned with 24h purge (86400 seconds)
      expect(mockBan).toHaveBeenCalledWith({
        reason: '[GUARD HONEYPOT TRAP] Triggered honeypot trap channel',
        deleteMessageSeconds: 86400,
      });

      // Verify Forensic Case was logged
      const cases = await prisma.moderationCase.findMany({
        where: { guildId: testGuildId, targetId: testAttackerId },
      });
      expect(cases.length).toBeGreaterThanOrEqual(1);
      expect(cases[0].action).toBe('HONEYPOT_BAN');
      expect(cases[0].reason).toContain('Triggered Honeypot Trap Channel');

      // Verify Global Blacklist addition
      const blacklisted = await GlobalThreatService.isBlacklisted(testAttackerId);
      expect(blacklisted).toBeTruthy();
      expect(blacklisted?.userId).toBe(testAttackerId);

      // Verify blocked threat count incremented
      expect(BotStatusMonitorService.blockedThreatCount).toBe(1);
    });

    it('should ignore Honeypot messages from Bots, Guild Owner, or Master Owner', async () => {
      await updateGuildConfig(testGuildId, { honeypotChannelId: testHoneypotChannelId });

      const targetGuild = mockClient.guilds.cache.get(testGuildId);

      // 1. Bot message
      const botMsg = {
        guild: targetGuild,
        channel: { id: testHoneypotChannelId },
        author: { id: 'bot_id', bot: true },
        delete: vi.fn(),
      } as any;
      expect(await SecurityShieldService.inspectHoneypotMessage(botMsg)).toBe(false);

      // 2. Guild Owner message
      const ownerMsg = {
        guild: targetGuild,
        channel: { id: testHoneypotChannelId },
        author: { id: targetGuild.ownerId, bot: false },
        delete: vi.fn(),
      } as any;
      expect(await SecurityShieldService.inspectHoneypotMessage(ownerMsg)).toBe(false);

      // 3. Master Owner message
      const masterOwnerMsg = {
        guild: targetGuild,
        channel: { id: testHoneypotChannelId },
        author: { id: CONFIG.MASTER_OWNER_ID, bot: false },
        delete: vi.fn(),
      } as any;
      expect(await SecurityShieldService.inspectHoneypotMessage(masterOwnerMsg)).toBe(false);
    });

    it('should intercept honeypot message at the entry point of messageCreate event', async () => {
      await updateGuildConfig(testGuildId, { honeypotChannelId: testHoneypotChannelId });
      const targetGuild = mockClient.guilds.cache.get(testGuildId);

      const mockDelete = vi.fn().mockResolvedValue({});
      const mockBan = vi.fn().mockResolvedValue({});

      const msg = {
        guild: targetGuild,
        channel: { id: testHoneypotChannelId, name: '🔒・do-not-type-here' },
        author: { id: testAttackerId, tag: 'RaidBot#0001', bot: false },
        member: { id: testAttackerId, ban: mockBan },
        content: 'Spam attack',
        createdTimestamp: Date.now(),
        client: mockClient,
        delete: mockDelete,
      } as any;

      await onMessageCreate(msg);
      expect(mockDelete).toHaveBeenCalled();
      expect(mockBan).toHaveBeenCalled();
    });
  });

  describe('2. Anti-Flood & Mass-Mention Heater', () => {
    it('should allow messages under rate limit (<=6 messages in 4s window)', async () => {
      const targetGuild = mockClient.guilds.cache.get(testGuildId);
      const mockDelete = vi.fn().mockResolvedValue({});

      for (let i = 0; i < 6; i++) {
        const msg = {
          guild: targetGuild,
          channel: { id: testChannelId },
          author: { id: testLegitUserId, bot: false },
          member: {
            id: testLegitUserId,
            user: { id: testLegitUserId, tag: 'LegitUser#0001' },
            permissions: { has: () => false },
          },
          content: `Normal chatter message #${i + 1}`,
          mentions: { users: new Map(), roles: new Map() },
          attachments: new Map(),
          client: mockClient,
          delete: mockDelete,
        } as any;

        const intercepted = await SecurityShieldService.inspectMessage(msg);
        expect(intercepted).toBe(false);
      }

      expect(mockDelete).not.toHaveBeenCalled();
      expect(BotStatusMonitorService.blockedThreatCount).toBe(0);
    });

    it('should trigger Anti-Flood on >6 messages within 4 seconds and issue strike escalation', async () => {
      const targetGuild = mockClient.guilds.cache.get(testGuildId);
      const mockDelete = vi.fn().mockResolvedValue({});
      const mockSend = vi.fn().mockResolvedValue({});

      const createFloodMsg = (idx: number) => ({
        guild: targetGuild,
        channel: { id: testChannelId },
        author: { id: testAttackerId, bot: false },
        member: {
          id: testAttackerId,
          user: { id: testAttackerId, tag: 'Flooder#0001' },
          permissions: { has: () => false },
          send: mockSend,
          roles: { cache: new Map(), remove: vi.fn() },
          timeout: vi.fn().mockResolvedValue({}),
        },
        content: `Flood spam line ${idx}`,
        mentions: { users: new Map(), roles: new Map() },
        attachments: new Map(),
        client: mockClient,
        delete: mockDelete,
      } as any);

      // Send first 6 messages
      for (let i = 1; i <= 6; i++) {
        const ok = await SecurityShieldService.inspectMessage(createFloodMsg(i));
        expect(ok).toBe(false);
      }

      // 7th message in 4 seconds should trigger anti-flood
      const seventhMsg = createFloodMsg(7);
      const intercepted = await SecurityShieldService.inspectMessage(seventhMsg);
      expect(intercepted).toBe(true);
      expect(mockDelete).toHaveBeenCalled();

      // Check strike escalation
      const strikes = await StrikeService.getUserStrikes(testGuildId, testAttackerId);
      expect(strikes).toBe(1);

      // Check threat counter
      expect(BotStatusMonitorService.blockedThreatCount).toBe(1);
    });

    it('should trigger on Mass-Mention Raid (>= 5 mentions)', async () => {
      const targetGuild = mockClient.guilds.cache.get(testGuildId);
      const mockDelete = vi.fn().mockResolvedValue({});
      const mockSend = vi.fn().mockResolvedValue({});

      const usersMentionMap = new Map([
        ['u1', {}], ['u2', {}], ['u3', {}],
      ]);
      const rolesMentionMap = new Map([
        ['r1', {}], ['r2', {}],
      ]); // 3 + 2 = 5 total mentions

      const massMentionMsg = {
        guild: targetGuild,
        channel: { id: testChannelId },
        author: { id: testAttackerId, bot: false },
        member: {
          id: testAttackerId,
          user: { id: testAttackerId, tag: 'MentionRaid#0001' },
          permissions: { has: () => false },
          send: mockSend,
          roles: { cache: new Map(), remove: vi.fn() },
          timeout: vi.fn().mockResolvedValue({}),
        },
        content: 'Hey <@u1> <@u2> <@u3> <@&r1> <@&r2> check this out!',
        mentions: { users: usersMentionMap, roles: rolesMentionMap },
        attachments: new Map(),
        client: mockClient,
        delete: mockDelete,
      } as any;

      const intercepted = await SecurityShieldService.inspectMessage(massMentionMsg);
      expect(intercepted).toBe(true);
      expect(mockDelete).toHaveBeenCalled();

      const strikes = await StrikeService.getUserStrikes(testGuildId, testAttackerId);
      expect(strikes).toBeGreaterThanOrEqual(1);
    });

    it('should trigger on unauthorized @everyone or @here mentions', async () => {
      const targetGuild = mockClient.guilds.cache.get(testGuildId);
      const mockDelete = vi.fn().mockResolvedValue({});

      const unauthorizedEveryoneMsg = {
        guild: targetGuild,
        channel: { id: testChannelId },
        author: { id: testAttackerId, bot: false },
        member: {
          id: testAttackerId,
          user: { id: testAttackerId, tag: 'PingRaid#0001' },
          permissions: {
            has: (perm: bigint) => perm !== PermissionFlagsBits.MentionEveryone,
          },
          send: vi.fn().mockResolvedValue({}),
          roles: { cache: new Map(), remove: vi.fn() },
          timeout: vi.fn().mockResolvedValue({}),
        },
        content: '@everyone FREE NITRO LINK HERE',
        mentions: { users: new Map(), roles: new Map() },
        attachments: new Map(),
        client: mockClient,
        delete: mockDelete,
      } as any;

      const intercepted = await SecurityShieldService.inspectMessage(unauthorizedEveryoneMsg);
      expect(intercepted).toBe(true);
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('3. Anti-Alt & Mass-Join Raid Gatekeeper', () => {
    it('should quarantine young account younger than minAccountAgeDays with 24h timeout and Forensic Case', async () => {
      // Default minAccountAgeDays is 1 day (86,400,000 ms)
      const targetGuild = mockClient.guilds.cache.get(testGuildId);
      const mockTimeout = vi.fn().mockResolvedValue({});

      const twoHoursAgo = Date.now() - (2 * 3600 * 1000);
      const youngMember = {
        id: testAttackerId,
        guild: targetGuild,
        moderatable: true,
        timeout: mockTimeout,
        user: {
          id: testAttackerId,
          tag: 'FreshAlt#9999',
          bot: false,
          createdTimestamp: twoHoursAgo,
          displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png',
        },
        client: mockClient,
      } as any;

      const quarantined = await SecurityShieldService.inspectMemberJoin(youngMember);
      expect(quarantined).toBe(true);

      // Verify 24h timeout (86,400,000 ms)
      expect(mockTimeout).toHaveBeenCalledWith(
        86400000,
        expect.stringContaining('[ANTI-ALT GATEKEEPER]')
      );

      // Verify Forensic Case created
      const cases = await prisma.moderationCase.findMany({
        where: { guildId: testGuildId, targetId: testAttackerId },
      });
      expect(cases.length).toBeGreaterThanOrEqual(1);
      expect(cases[0].action).toBe('ALT_ACCOUNT_QUARANTINE');

      // Verify Master SOC #audit-logs notification
      expect(mockAuditSend).toHaveBeenCalled();
      const sentTitles = mockAuditSend.mock.calls.map((c: any) => c[0].embeds[0].data.title);
      expect(sentTitles.some((t: string) => t.includes('ANTI-ALT QUARANTINE'))).toBe(true);
    });

    it('should allow established account older than minAccountAgeDays to join without quarantine', async () => {
      const targetGuild = mockClient.guilds.cache.get(testGuildId);
      const mockTimeout = vi.fn().mockResolvedValue({});

      const thirtyDaysAgo = Date.now() - (30 * 24 * 3600 * 1000);
      const matureMember = {
        id: testLegitUserId,
        guild: targetGuild,
        moderatable: true,
        timeout: mockTimeout,
        user: {
          id: testLegitUserId,
          tag: 'EstablishedUser#0001',
          bot: false,
          createdTimestamp: thirtyDaysAgo,
          displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png',
        },
        client: mockClient,
      } as any;

      const quarantined = await SecurityShieldService.inspectMemberJoin(matureMember);
      expect(quarantined).toBe(false);
      expect(mockTimeout).not.toHaveBeenCalled();
    });

    it('should trigger CRITICAL MASS JOIN RAID alert when >= 6 accounts join within 10 seconds', async () => {
      const targetGuild = mockClient.guilds.cache.get(testGuildId);

      const sixtyDaysAgo = Date.now() - (60 * 24 * 3600 * 1000);
      for (let i = 1; i <= 6; i++) {
        const raidMember = {
          id: `raid_member_${i}`,
          guild: targetGuild,
          moderatable: true,
          timeout: vi.fn().mockResolvedValue({}),
          user: {
            id: `raid_member_${i}`,
            tag: `RaidActor_${i}#0000`,
            bot: false,
            createdTimestamp: sixtyDaysAgo,
            displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png',
          },
          client: mockClient,
        } as any;

        await SecurityShieldService.inspectMemberJoin(raidMember);
      }

      // 6th join in window triggers mass-join alert
      expect(mockStatusSend).toHaveBeenCalled();
      const alertEmbed = mockStatusSend.mock.calls[0][0].embeds[0].data;
      expect(alertEmbed.title).toContain('CRITICAL MASS JOIN RAID DETECTED');
      expect(alertEmbed.description).toContain('Join Velocity:');
    });

    it('should suppress welcome card in onGuildMemberAdd when account is quarantined', async () => {
      const targetGuild = mockClient.guilds.cache.get(testGuildId);
      const mockTimeout = vi.fn().mockResolvedValue({});

      // Set up a mock welcome channel
      const welcomeSend = vi.fn().mockResolvedValue({});
      const welcomeChannel = {
        id: 'welcome_chan_1',
        type: ChannelType.GuildText,
        send: welcomeSend,
      };
      targetGuild.channels.cache.set('welcome_chan_1', welcomeChannel);

      await updateGuildConfig(testGuildId, {
        welcomeChannelId: 'welcome_chan_1',
      });

      const oneHourAgo = Date.now() - (1 * 3600 * 1000);
      const altMember = {
        id: testAttackerId,
        guild: targetGuild,
        moderatable: true,
        timeout: mockTimeout,
        user: {
          id: testAttackerId,
          tag: 'FreshAlt#9999',
          bot: false,
          createdTimestamp: oneHourAgo,
          displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png',
        },
        client: mockClient,
      } as any;

      await onGuildMemberAdd(altMember);

      // Quarantined -> timeout called, but welcome message suppressed
      expect(mockTimeout).toHaveBeenCalled();
      expect(welcomeSend).not.toHaveBeenCalled();
    });
  });

  describe('4. Master SOC CLI Extensions', () => {
    it('should handle honeypot CLI command to provision honeypot channel', async () => {
      const mockReply = vi.fn().mockResolvedValue({});
      const targetGuild = mockClient.guilds.cache.get(testGuildId);

      const trapChannel = {
        id: testHoneypotChannelId,
        name: '🔒・do-not-type-here',
        type: ChannelType.GuildText,
        send: vi.fn().mockResolvedValue({}),
        permissionOverwrites: { set: vi.fn().mockResolvedValue({}) },
      };
      targetGuild.channels.create = vi.fn().mockResolvedValue(trapChannel);

      const msg = {
        guildId: CONFIG.MASTER_GUILD_ID,
        channel: {
          name: 'command',
          topic: `TARGET_GUILD_ID:${testGuildId}`,
        },
        author: {
          id: CONFIG.MASTER_OWNER_ID,
          tag: 'RootMaster#0001',
          bot: false,
        },
        member: {
          permissions: { has: () => true },
        },
        content: 'honeypot',
        reply: mockReply,
      } as any;

      await MasterCommandExecutor.execute(msg, mockClient);
      expect(mockReply).toHaveBeenCalled();
      const replyDesc = mockReply.mock.calls[0][0].embeds[0].data.description;
      expect(replyDesc).toContain('HONEYPOT TRAP DEPLOYED');
      expect(replyDesc).toContain('ACTIVE & MONITORING');
    });

    it('should handle minage CLI command to update minimum account age threshold', async () => {
      const mockReply = vi.fn().mockResolvedValue({});

      const msg = {
        guildId: CONFIG.MASTER_GUILD_ID,
        channel: {
          name: 'command',
          topic: `TARGET_GUILD_ID:${testGuildId}`,
        },
        author: {
          id: CONFIG.MASTER_OWNER_ID,
          tag: 'RootMaster#0001',
          bot: false,
        },
        member: {
          permissions: { has: () => true },
        },
        content: 'minage 7',
        reply: mockReply,
      } as any;

      await MasterCommandExecutor.execute(msg, mockClient);
      expect(mockReply).toHaveBeenCalled();
      const replyDesc = mockReply.mock.calls[0][0].embeds[0].data.description;
      expect(replyDesc).toContain('Anti-Alt Raid Gatekeeper threshold set to 7 day(s)');

      // Verify DB was updated
      const config = await getOrCreateGuildConfig(testGuildId);
      expect(config.minAccountAgeDays).toBe(7);
    });
  });
});
