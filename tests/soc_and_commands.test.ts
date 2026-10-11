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

  it('should include all required 15 slash commands in the registry', () => {
    const expectedCommands = [
      'welcomeactivate',
      'byebyeactivate',
      'auditlogactivate',
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
    ];

    expect(commands.length).toBe(15);
    for (const name of expectedCommands) {
      expect(commandCollection.has(name)).toBe(true);
    }
  });
});
