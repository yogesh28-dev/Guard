import { VoiceState, VoiceChannel, EmbedBuilder } from 'discord.js';
import { TargetProvisioningService } from '../services/targetProvisioningService';
import { MasterSocService } from '../services/masterSocService';
import { CONFIG, isMasterOwner, isGuardVc } from '../config';

export async function onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const guild = newState.guild;
  const member = newState.member;
  if (!member) return;

  // 1. Maintain 24/7 connection if the bot was disconnected from GUARD VC
  if (member.id === guild.client.user?.id) {
    if (!newState.channelId) {
      const guardVC = guild.channels.cache.find(
        c => c.type === (c as any).type && isGuardVc(c.name)
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

  if (isOwner && joinedChannel && joinedChannel.id !== leftChannelId) {
    if (isGuardVc(joinedChannel.name) || isMasterOwner(member.id)) {
      console.log(`[VC PANEL] Server Owner ${member.user.tag} joined ${joinedChannel.name}. Spawning 20-button panel.`);
      await TargetProvisioningService.spawnVoiceControlPanel(joinedChannel, member.id);
    }
  }

  // 3. Telemetry Stream for Voice Actions (Join, Leave, Switch, Move)
  if (!member.user.bot) {
    let voiceAction: string | null = null;
    let desc = '';

    if (!oldState.channelId && newState.channelId) {
      voiceAction = '🔊 VOICE CHANNEL JOINED';
      desc = `<@${member.id}> joined voice channel <#${newState.channelId}>.`;
    } else if (oldState.channelId && !newState.channelId) {
      voiceAction = '🔇 VOICE CHANNEL LEFT';
      desc = `<@${member.id}> disconnected from voice channel <#${oldState.channelId}>.`;
    } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      voiceAction = '🔀 VOICE CHANNEL SWITCHED';
      desc = `<@${member.id}> moved from <#${oldState.channelId}> to <#${newState.channelId}>.`;
    } else if (oldState.serverMute !== newState.serverMute) {
      voiceAction = newState.serverMute ? '🔇 SERVER MUTED' : '🔊 SERVER UNMUTED';
      desc = `<@${member.id}> was ${newState.serverMute ? 'server-muted' : 'server-unmuted'}.`;
    } else if (oldState.serverDeaf !== newState.serverDeaf) {
      voiceAction = newState.serverDeaf ? '🔕 SERVER DEAFENED' : '🔔 SERVER UNDEAFENED';
      desc = `<@${member.id}> was ${newState.serverDeaf ? 'server-deafened' : 'server-undeafened'}.`;
    }

    if (voiceAction) {
      const embed = new EmbedBuilder()
        .setTitle(voiceAction)
        .setColor(0x14FA22)
        .setDescription(desc)
        .setFooter({ text: `User ID: ${member.id}` })
        .setTimestamp();

      await MasterSocService.logAuditTelemetry(guild.client, guild.id, 'VOICE_ACTIONS', embed);
    }
  }
}
