import { describe, it, expect } from 'vitest';
import { MasterSocService } from '../src/services/masterSocService';
import { commands, commandCollection } from '../src/commands';

describe('Master SOC & Slash Commands', () => {
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

  it('should include all required 17 slash commands in the registry including syncall', () => {
    const expectedCommands = [
      'welcomeactivate',
      'byebyeactivate',
      'auditlogactivate',
      'auditlogs',
      'securitystatus',
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
      'giverole',
      'syncall',
    ];

    expect(commands.length).toBe(17);
    for (const name of expectedCommands) {
      expect(commandCollection.has(name)).toBe(true);
    }
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
