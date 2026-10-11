import { VoiceState, VoiceChannel } from 'discord.js';
import { TargetProvisioningService } from '../services/targetProvisioningService';
import { CONFIG, isMasterOwner } from '../config';

export async function onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const guild = newState.guild;
  const member = newState.member;
  if (!member) return;

  // 1. Maintain 24/7 connection if the bot was disconnected from GUARD VC
  if (member.id === guild.client.user?.id) {
    if (!newState.channelId) {
      const guardVC = guild.channels.cache.find(
        c => c.name === CONFIG.GUARD_VC_NAME && c.isVoiceBased()
      ) as VoiceChannel | undefined;

      if (guardVC) {
        setTimeout(() => {
          TargetProvisioningService.maintainVoiceConnection(guardVC);
        }, 1500);
      }
    }
    return;
  }

  // 2. Server Owner Exclusive Voice Control Panel: On voiceStateUpdate when owner joins
  const isOwner = member.id === guild.ownerId || isMasterOwner(member.id);
  const joinedChannel = newState.channel as VoiceChannel | null;
  const leftChannelId = oldState.channelId;

  // Did the owner just join a voice channel?
  if (isOwner && joinedChannel && joinedChannel.id !== leftChannelId) {
    // Check if it's the Guard VC or any provisioned voice channel
    if (joinedChannel.name === CONFIG.GUARD_VC_NAME || isMasterOwner(member.id)) {
      console.log(`[VC PANEL] Server Owner ${member.user.tag} joined ${joinedChannel.name}. Spawning 20-button panel.`);
      await TargetProvisioningService.spawnVoiceControlPanel(joinedChannel, member.id);
    }
  }
}
