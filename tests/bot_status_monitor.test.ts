import { describe, it, expect } from 'vitest';
import { BotStatusMonitorService } from '../src/services/botStatusMonitorService';
import { CONFIG } from '../src/config';

describe('BotStatusMonitorService & Hourly Telemetry Engine', () => {
  it('should format process uptime into human-readable strings', () => {
    expect(BotStatusMonitorService.formatUptime(45)).toBe('45s');
    expect(BotStatusMonitorService.formatUptime(3665)).toBe('1h 1m 5s');
    expect(BotStatusMonitorService.formatUptime(90061)).toBe('1d 1h 1m 1s');
  });

  it('should generate dark cyber telemetry embed with complete vitals and health badge', async () => {
    const mockClient = {
      ws: { ping: 42 },
      guilds: {
        cache: new Map([
          [
            CONFIG.MASTER_GUILD_ID,
            {
              id: CONFIG.MASTER_GUILD_ID,
              name: 'Master SOC Hub',
              memberCount: 10,
              channels: { cache: new Map() },
            },
          ],
          [
            'target_alpha',
            {
              id: 'target_alpha',
              name: 'Target Alpha',
              memberCount: 250,
              channels: {
                cache: new Map([
                  ['c1', { type: 0 }],
                  ['c2', { type: 2 }],
                ]),
              },
            },
          ],
        ]),
      },
      user: {
        fetch: async () => {},
      },
    } as any;

    const embed = await BotStatusMonitorService.generateStatusEmbed(mockClient);

    expect(embed.data.title).toContain('HOURLY TELEMETRY');
    expect(embed.data.description).toContain('OPERATIONAL');
    expect(embed.data.fields?.length).toBe(6);

    const fieldNames = embed.data.fields?.map(f => f.name);
    expect(fieldNames).toContain('💻 System Vitals');
    expect(fieldNames).toContain('📡 Discord Telemetry');
    expect(fieldNames).toContain('🌐 Fleet Scale');
    expect(fieldNames).toContain('🔊 Voice Security Engine');
    expect(fieldNames).toContain('🛡️ Security Interceptions (Past Hour)');
    expect(fieldNames).toContain('🗄️ Database & Cache Vitals');
  });

  it('should ensure #bot-status channel with strict private permissions', async () => {
    let createdChannelName = '';
    let createdOverwrites: any[] = [];

    const mockMasterGuild = {
      id: CONFIG.MASTER_GUILD_ID,
      roles: { everyone: { id: 'everyone_role' } },
      client: { user: { id: 'bot_id' } },
      channels: {
        cache: new Map(),
        create: async (data: any) => {
          createdChannelName = data.name;
          createdOverwrites = data.permissionOverwrites;
          return {
            name: data.name,
            permissionOverwrites: { set: async () => {} },
          };
        },
      },
    } as any;

    const channel = await BotStatusMonitorService.ensureBotStatusChannel(mockMasterGuild);
    expect(channel).not.toBeNull();
    expect(createdChannelName).toBe('bot-status');
    expect(createdOverwrites.length).toBeGreaterThanOrEqual(2);
  });
});
