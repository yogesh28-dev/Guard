import { describe, it, expect } from 'vitest';
import { AntiNukeService } from '../src/services/antiNukeService';

describe('AntiNukeService Sliding Window Engine', () => {
  const guildId = 'guild_nuke_test_123';
  const rogueActorId = 'actor_rogue_999';

  it('should detect channel deletion breach when threshold (> 2 channels in 10s) is exceeded', () => {
    // 1st channel delete
    expect(AntiNukeService.trackAction(guildId, rogueActorId, 'CHANNEL_DELETE')).toBe(false);
    // 2nd channel delete
    expect(AntiNukeService.trackAction(guildId, rogueActorId, 'CHANNEL_DELETE')).toBe(false);
    // 3rd channel delete -> breaches threshold (> 2)
    expect(AntiNukeService.trackAction(guildId, rogueActorId, 'CHANNEL_DELETE')).toBe(true);
  });

  it('should detect role mutation breach when threshold (> 3 roles in 10s) is exceeded', () => {
    const actorRole = 'actor_role_888';
    expect(AntiNukeService.trackAction(guildId, actorRole, 'ROLE_MUTATION')).toBe(false);
    expect(AntiNukeService.trackAction(guildId, actorRole, 'ROLE_MUTATION')).toBe(false);
    expect(AntiNukeService.trackAction(guildId, actorRole, 'ROLE_MUTATION')).toBe(false);
    // 4th role mutation -> breaches threshold (> 3)
    expect(AntiNukeService.trackAction(guildId, actorRole, 'ROLE_MUTATION')).toBe(true);
  });

  it('should detect member eviction breach when threshold (> 3 members in 10s) is exceeded', () => {
    const actorMember = 'actor_member_777';
    expect(AntiNukeService.trackAction(guildId, actorMember, 'MEMBER_REMOVE')).toBe(false);
    expect(AntiNukeService.trackAction(guildId, actorMember, 'MEMBER_REMOVE')).toBe(false);
    expect(AntiNukeService.trackAction(guildId, actorMember, 'MEMBER_REMOVE')).toBe(false);
    // 4th member eviction -> breaches threshold (> 3)
    expect(AntiNukeService.trackAction(guildId, actorMember, 'MEMBER_REMOVE')).toBe(true);
  });
});
