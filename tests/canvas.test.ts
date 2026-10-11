import { describe, it, expect } from 'vitest';
import { CanvasCardService } from '../src/services/canvasCardService';

describe('CanvasCardService', () => {
  it('should generate a 800x400 cyberpunk Welcome Card Buffer', async () => {
    const buffer = await CanvasCardService.generateWelcomeCard({
      username: 'CyberOperative',
      discriminator: '0001',
      guildName: 'GUARD Central Hub',
      memberCount: 1337,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    // Verify PNG magic bytes
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50); // P
    expect(buffer[2]).toBe(0x4e); // N
    expect(buffer[3]).toBe(0x47); // G
  });

  it('should generate a 800x400 twilight Goodbye Card Buffer', async () => {
    const buffer = await CanvasCardService.generateGoodbyeCard({
      username: 'TwilightGhost',
      guildName: 'GUARD Central Hub',
      memberCount: 1336,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    // Verify PNG magic bytes
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4e);
    expect(buffer[3]).toBe(0x47);
  });
});
