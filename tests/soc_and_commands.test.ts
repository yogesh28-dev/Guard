import { describe, it, expect, vi } from 'vitest';
import { MasterSocService } from '../src/services/masterSocService';
import {
  commands,
  groupACommands,
  groupBCommands,
  commandCollection,
  GROUP_A_COMMAND_NAMES,
  GROUP_B_COMMAND_NAMES,
  giveRoleCommand,
  syncAllCommand,
} from '../src/commands';
import { onInteractionCreate } from '../src/events/interactionCreate';
import { PermissionFlagsBits } from 'discord.js';

describe('Master SOC & Slash Commands RBAC', () => {
  it('should resolve target guild ID from channel topic', () => {
    const mockChannel = {
      topic: 'TARGET_GUILD_ID:888777666555:COMMAND',
    };

    const mockClient = {
      guilds: {
        cache: new Map([
          ['888777666555', { id: '888777666555', name: 'Mock Target Guild' }],
        ]),
      },
    } as any;

    const resolved = MasterSocService.findTargetGuildFromChannel(mockChannel, mockClient);
    expect(resolved).not.toBeNull();
    expect(resolved?.id).toBe('888777666555');
  });

  it('should have strictly 14 Group A commands (including public about) and 2 Group B commands (total 16)', () => {
    const expectedGroupA = [
      'welcomeactivate',
      'byebyeactivate',
      'auditlogs',
      'ban',
      'unban',
      'kick',
      'timeout',
      'warn',
      'lockdown',
      'unlockdown',
      'serverinfo',
      'userinfo',
      'help',
      'about',
    ];

    const expectedGroupB = [
      'giverole',
      'syncall',
    ];

    expect(groupACommands.length).toBe(14);
    expect(groupBCommands.length).toBe(2);
    expect(commands.length).toBe(16);

    for (const name of expectedGroupA) {
      expect(GROUP_A_COMMAND_NAMES).toContain(name);
      expect(commandCollection.has(name)).toBe(true);
      const cmd = commandCollection.get(name)!;
      const json = typeof cmd.data.toJSON === 'function' ? cmd.data.toJSON() : cmd.data;
      if (!['about', 'help'].includes(name)) {
        expect(['0', PermissionFlagsBits.Administrator.toString()]).toContain(json.default_member_permissions);
      } else {
        expect(json.default_member_permissions).toBeUndefined();
      }
    }

    for (const name of expectedGroupB) {
      expect(GROUP_B_COMMAND_NAMES).toContain(name);
      expect(commandCollection.has(name)).toBe(true);
      const cmd = commandCollection.get(name)!;
      const json = typeof cmd.data.toJSON === 'function' ? cmd.data.toJSON() : cmd.data;
      expect(['0', PermissionFlagsBits.Administrator.toString()]).toContain(json.default_member_permissions);
    }

    // Ensure removed commands do not exist
    expect(commandCollection.has('securitystatus')).toBe(false);
    expect(commandCollection.has('auditlogactivate')).toBe(false);
  });

  it('should enforce Group A RBAC: reject ordinary member/admin with exact error message', async () => {
    const mockReply = vi.fn();
    const mockInteraction = {
      isChatInputCommand: () => true,
      isButton: () => false,
      isModalSubmit: () => false,
      commandName: 'ban',
      user: { id: '999888777666', tag: 'Admin#1234' },
      guildId: '111222333444',
      guild: {
        id: '111222333444',
        ownerId: '123456789012', // Different owner
      },
      reply: mockReply,
    } as any;

    await onInteractionCreate(mockInteraction);

    expect(mockReply).toHaveBeenCalledWith({
      content: '⛔ This command is strictly reserved for the Server Owner.',
      ephemeral: true,
    });
  });

  it('should allow Group A execution for Server Owner', async () => {
    const banCmd = commandCollection.get('ban')!;
    const executeSpy = vi.spyOn(banCmd, 'execute').mockImplementation(async () => {});

    const mockReply = vi.fn();
    const mockInteraction = {
      isChatInputCommand: () => true,
      isButton: () => false,
      isModalSubmit: () => false,
      commandName: 'ban',
      user: { id: '123456789012', tag: 'GuildOwner#0001' },
      guildId: '111222333444',
      guild: {
        id: '111222333444',
        ownerId: '123456789012',
      },
      reply: mockReply,
    } as any;

    await onInteractionCreate(mockInteraction);

    expect(executeSpy).toHaveBeenCalled();
    expect(mockReply).not.toHaveBeenCalledWith(expect.objectContaining({
      content: '⛔ This command is strictly reserved for the Server Owner.',
    }));

    executeSpy.mockRestore();
  });

  it('should allow Group A execution for Super Owner even if not Guild Owner', async () => {
    const banCmd = commandCollection.get('ban')!;
    const executeSpy = vi.spyOn(banCmd, 'execute').mockImplementation(async () => {});

    const mockReply = vi.fn();
    const mockInteraction = {
      isChatInputCommand: () => true,
      isButton: () => false,
      isModalSubmit: () => false,
      commandName: 'ban',
      user: { id: '1519909192373112923', tag: 'SuperOwner#0001' },
      guildId: '111222333444',
      guild: {
        id: '111222333444',
        ownerId: '999999999999', // Different owner
      },
      reply: mockReply,
    } as any;

    await onInteractionCreate(mockInteraction);

    expect(executeSpy).toHaveBeenCalled();
    expect(mockReply).not.toHaveBeenCalledWith(expect.objectContaining({
      content: '⛔ This command is strictly reserved for the Server Owner.',
    }));

    executeSpy.mockRestore();
  });

  it('should enforce Group B execution rules: Super Owner, Master Guild, and #command channel', async () => {
    const syncCmd = commandCollection.get('syncall')!;
    const executeSpy = vi.spyOn(syncCmd, 'execute').mockImplementation(async () => {});

    // 1. Non-super owner rejected
    const mockReply1 = vi.fn();
    const nonSuperOwnerInteraction = {
      isChatInputCommand: () => true,
      isButton: () => false,
      isModalSubmit: () => false,
      commandName: 'syncall',
      user: { id: '123456789012' },
      guildId: '1549116937567609035',
      channel: { name: 'command' },
      reply: mockReply1,
    } as any;

    await onInteractionCreate(nonSuperOwnerInteraction);
    expect(mockReply1).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('strictly restricted to the Super Owner'),
      ephemeral: true,
    }));
    expect(executeSpy).not.toHaveBeenCalled();

    // 2. Outside Master Guild rejected
    const mockReply2 = vi.fn();
    const wrongGuildInteraction = {
      isChatInputCommand: () => true,
      isButton: () => false,
      isModalSubmit: () => false,
      commandName: 'syncall',
      user: { id: '1519909192373112923' },
      guildId: '999999999999',
      channel: { name: 'command' },
      reply: mockReply2,
    } as any;

    await onInteractionCreate(wrongGuildInteraction);
    expect(mockReply2).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('inside the Master Guild'),
      ephemeral: true,
    }));
    expect(executeSpy).not.toHaveBeenCalled();

    // 3. Outside #command channel rejected
    const mockReply3 = vi.fn();
    const wrongChannelInteraction = {
      isChatInputCommand: () => true,
      isButton: () => false,
      isModalSubmit: () => false,
      commandName: 'syncall',
      user: { id: '1519909192373112923' },
      guildId: '1549116937567609035',
      channel: { name: 'general' },
      reply: mockReply3,
    } as any;

    await onInteractionCreate(wrongChannelInteraction);
    expect(mockReply3).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('#command'),
      ephemeral: true,
    }));
    expect(executeSpy).not.toHaveBeenCalled();

    // 4. Authorized execution
    const mockReply4 = vi.fn();
    const authorizedInteraction = {
      isChatInputCommand: () => true,
      isButton: () => false,
      isModalSubmit: () => false,
      commandName: 'syncall',
      user: { id: '1519909192373112923' },
      guildId: '1549116937567609035',
      channel: { name: 'command' },
      reply: mockReply4,
    } as any;

    await onInteractionCreate(authorizedInteraction);
    expect(executeSpy).toHaveBeenCalled();

    executeSpy.mockRestore();
  });

  it('should export giveRoleCommand and syncAllCommand matching Group B', () => {
    expect(giveRoleCommand).toBeDefined();
    expect(syncAllCommand).toBeDefined();
    expect(giveRoleCommand.data.name).toBe('giverole');
    expect(syncAllCommand.data.name).toBe('syncall');
  });

  it('should synchronize global commands with Group A, master guild with Group B, and purge external guild commands on ready', async () => {
    const { onReady } = await import('../src/events/ready');
    const setGlobalSpy = vi.fn();
    const setMasterSpy = vi.fn();
    const purgeExternalSpy = vi.fn();

    const mockMasterGuild = {
      id: '1549116937567609035',
      name: 'Master SOC Guild',
      commands: { set: setMasterSpy },
    };

    const mockExternalGuild = {
      id: '888777666555',
      name: 'External Target Guild',
      commands: {
        fetch: vi.fn().mockResolvedValue(new Map([['old_cmd', {}]])),
        set: purgeExternalSpy,
      },
    };

    const mockClient = {
      user: { tag: 'GUARD#0001', id: '123456', setPresence: vi.fn() },
      application: { commands: { set: setGlobalSpy } },
      guilds: {
        cache: new Map([
          ['1549116937567609035', mockMasterGuild],
          ['888777666555', mockExternalGuild],
        ]),
        fetch: vi.fn().mockImplementation(async (id: string) => {
          if (id === '1549116937567609035') return mockMasterGuild;
          return null;
        }),
      },
      ws: { ping: 25 },
    } as any;

    const { TargetProvisioningService } = await import('../src/services/targetProvisioningService');
    const { AntiNukeService } = await import('../src/services/antiNukeService');
    const { MasterSocService } = await import('../src/services/masterSocService');
    vi.spyOn(TargetProvisioningService, 'provisionGuild').mockResolvedValue(null as any);
    vi.spyOn(TargetProvisioningService, 'startReconnectMonitor').mockImplementation(() => {});
    vi.spyOn(AntiNukeService, 'snapshotGuild').mockResolvedValue();
    vi.spyOn(MasterSocService, 'reconcileAllGuilds').mockResolvedValue({ totalGuilds: 2, syncedGuilds: 1, failedGuilds: 0 });

    await onReady(mockClient);

    expect(setGlobalSpy).toHaveBeenCalled();
    expect(setGlobalSpy.mock.calls[0][0].length).toBe(14);

    expect(setMasterSpy).toHaveBeenCalled();
    expect(setMasterSpy.mock.calls[0][0].length).toBe(2);

    expect(purgeExternalSpy).toHaveBeenCalledWith([]);
  });

  it('should allow public execution of /about for regular members and return dark cyberpunk embed with invite link', async () => {
    const mockReply = vi.fn();
    const mockInteraction = {
      isChatInputCommand: () => true,
      isButton: () => false,
      isModalSubmit: () => false,
      commandName: 'about',
      user: { id: '999888777666', tag: 'RandomMember#1234' },
      guildId: '111222333444',
      guild: {
        id: '111222333444',
        ownerId: '123456789012', // Different owner - ordinary member!
      },
      client: {
        user: {
          id: '1548766359020896397',
          displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png',
        },
      },
      reply: mockReply,
    } as any;

    await onInteractionCreate(mockInteraction);

    expect(mockReply).toHaveBeenCalled();
    const replyArgs = mockReply.mock.calls[0][0];
    const embed = replyArgs.embeds[0].data;

    expect(embed.title).toBe('🛡️ ABOUT GUARD ENTERPRISE');
    expect(embed.description).toContain('GUARD . an autonomous enterprise security & SOC bot');
    expect(embed.fields?.some((f: any) => f.name.includes('Core Features'))).toBe(true);
    expect(embed.fields?.some((f: any) => f.name.includes('Quick Links'))).toBe(true);
    expect(embed.footer?.text).toContain('Use /help to view command manual');

    // Button row
    expect(replyArgs.components?.length).toBeGreaterThanOrEqual(1);
    const button = replyArgs.components[0].components[0].data;
    expect(button.url).toContain('1548766359020896397');
    expect(button.url).toContain('permissions=8');
  });

  it('should allow public execution of /help for regular members without being rejected by owner RBAC', async () => {
    const mockReply = vi.fn();
    const mockInteraction = {
      isChatInputCommand: () => true,
      isButton: () => false,
      isModalSubmit: () => false,
      commandName: 'help',
      user: { id: '999888777666', tag: 'RandomMember#1234' },
      guildId: '111222333444',
      guild: {
        id: '111222333444',
        ownerId: '123456789012', // Different owner - ordinary member!
      },
      client: {
        user: { id: '1548766359020896397' },
      },
      reply: mockReply,
    } as any;

    await onInteractionCreate(mockInteraction);

    expect(mockReply).toHaveBeenCalled();
    const replyArgs = mockReply.mock.calls[0][0];
    const embed = replyArgs.embeds[0].data;

    expect(embed.title).toBe('🛡️ GUARD ENTERPRISE // SECURITY & DEFENSE DIRECTORY');
    expect(embed.fields?.length).toBeGreaterThanOrEqual(4);
    // Ephemeral for regular members
    expect(replyArgs.ephemeral).toBe(true);
  });

  it('should generate comprehensive 24h analytical status embed', async () => {
    const mockGuild = {
      id: '888777666555',
      name: 'Alpha Defense Grid',
      memberCount: 500,
      premiumTier: 2,
      premiumSubscriptionCount: 7,
      roles: { cache: new Map([['r1', {}], ['r2', {}]]) },
      channels: {
        cache: new Map([
          ['c1', { type: 0 }],
          ['c2', { type: 2 }],
        ]),
      },
      fetchOwner: async () => ({
        id: '1519909192373112923',
        user: { tag: 'Commander#0001' },
      }),
    } as any;

    const embed = await MasterSocService.generateServerStatusEmbed(mockGuild);
    expect(embed.data.title).toContain('24H SOC ANALYTICAL BREAKDOWN');
    expect(embed.data.fields?.length).toBeGreaterThanOrEqual(6);
  });
});
