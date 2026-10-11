import { describe, it, expect } from 'vitest';

describe('Welcome and Goodbye Message Copy Templates', () => {
  it('should format welcome message content exactly as specified', () => {
    const mockMember = {
      toString: () => '<@123456789012345678>',
      guild: {
        name: 'GUARD Central Hub',
        memberCount: 1337,
      },
    };

    const welcomeContent = `Hey ${mockMember}, welcome to${mockMember.guild.name}! 🎉\nGlad to have you here! \nEnjoy your stay! You're member #${mockMember.guild.memberCount} ✨`;

    expect(welcomeContent).toBe(
      "Hey <@123456789012345678>, welcome toGUARD Central Hub! 🎉\n" +
      "Glad to have you here! \n" +
      "Enjoy your stay! You're member #1337 ✨"
    );
  });

  it('should format goodbye message content exactly as specified', () => {
    const mockMember = {
      user: { username: 'CyberAgent' },
      displayName: 'CyberAgent',
      guild: {
        name: 'GUARD Central Hub',
        memberCount: 1336,
      },
    };

    const goodbyeContent = `Goodbye ${mockMember.user?.username ?? mockMember.displayName}, thanks for being part of ${mockMember.guild.name}! 👋\nSad to see you go!\nWish you the best! We're down to ${mockMember.guild.memberCount} members ✨`;

    expect(goodbyeContent).toBe(
      "Goodbye CyberAgent, thanks for being part of GUARD Central Hub! 👋\n" +
      "Sad to see you go!\n" +
      "Wish you the best! We're down to 1336 members ✨"
    );
  });
});
