import { describe, it, expect } from 'vitest';
import { SecurityShieldService } from '../src/services/securityShieldService';
import { CONFIG } from '../src/config';

describe('SecurityShieldService & Zero-Trust Architecture', () => {
  it('should intercept dangerous executable file attachments', async () => {
    const mockMessage = {
      author: { bot: false, id: 'user_malicious' },
      guild: { id: 'guild_test' },
      content: 'Hey check out this game!',
      attachments: new Map([
        ['att1', { name: 'free_nitro_installer.exe' }],
      ]),
      delete: async () => {},
      member: { moderatable: false },
      channel: { send: async () => ({ delete: async () => {} }) },
      client: { guilds: { cache: new Map() } },
    } as any;

    const intercepted = await SecurityShieldService.inspectMessage(mockMessage);
    expect(intercepted).toBe(true);
  });

  it('should intercept phishing and nitro scam typosquatting domains', async () => {
    const phishingMessages = [
      'Claim your free nitro at https://discorcl.com/nitro-gift',
      'Steam trade discord: https://dlscord.ru/claim',
      'Free gifts here: https://discord-nitro.click',
    ];

    for (const text of phishingMessages) {
      const mockMessage = {
        author: { bot: false, id: 'user_spammer' },
        guild: { id: 'guild_test' },
        content: text,
        attachments: new Map(),
        delete: async () => {},
        member: { moderatable: false },
        channel: { send: async () => ({ delete: async () => {} }) },
        client: { guilds: { cache: new Map() } },
      } as any;

      const intercepted = await SecurityShieldService.inspectMessage(mockMessage);
      expect(intercepted).toBe(true);
    }
  });

  it('should intercept masked URL shorteners', async () => {
    const mockMessage = {
      author: { bot: false, id: 'user_shortener' },
      guild: { id: 'guild_test' },
      content: 'Click here: https://bit.ly/hidden-payload',
      attachments: new Map(),
      delete: async () => {},
      member: { moderatable: false },
      channel: { send: async () => ({ delete: async () => {} }) },
      client: { guilds: { cache: new Map() } },
    } as any;

    const intercepted = await SecurityShieldService.inspectMessage(mockMessage);
    expect(intercepted).toBe(true);
  });

  it('should enforce Zero-Trust access control strictly to Guild Owner and Master Owner', () => {
    const mockGuild = {
      ownerId: '111222333444555666',
    } as any;

    // Guild Owner is authorized
    expect(SecurityShieldService.isZeroTrustAuthorized(mockGuild, '111222333444555666')).toBe(true);
    // Master Owner is authorized
    expect(SecurityShieldService.isZeroTrustAuthorized(mockGuild, CONFIG.MASTER_OWNER_ID)).toBe(true);
    // Unauthorized admin/user is blocked
    expect(SecurityShieldService.isZeroTrustAuthorized(mockGuild, '999999999999999999')).toBe(false);
  });
});
