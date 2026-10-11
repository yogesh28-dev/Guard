import { DMChannel, NonThreadGuildBasedChannel, EmbedBuilder } from 'discord.js';
import { AntiNukeService } from '../services/antiNukeService';
import { MasterSocService } from '../services/masterSocService';
import { saveChannelSnapshot, deleteChannelSnapshot } from '../db';
import { CONFIG } from '../config';

export async function onChannelDelete(channel: DMChannel | NonThreadGuildBasedChannel): Promise<void> {
  if (!('guild' in channel) || !channel.guild) return;
  const guild = channel.guild;

  // 1. Anti-Nuke Sliding Window check & Restoration Queue
  await AntiNukeService.handleChannelDelete(channel);

  // 2. Delete snapshot
  await deleteChannelSnapshot(guild.id, channel.id);

  // 3. Telemetry Log
  const embed = new EmbedBuilder()
    .setTitle('📁 CHANNEL DELETED')
    .setColor(CONFIG.DANGER_COLOR)
    .setDescription(`Channel **#${channel.name}** (\`${channel.id}\`) was deleted.`)
    .addFields(
      { name: 'Channel Type', value: `\`${channel.type}\``, inline: true },
      { name: 'Parent Category', value: channel.parent ? channel.parent.name : 'None', inline: true }
    )
    .setTimestamp();

  await MasterSocService.logAuditTelemetry(guild.client, guild.id, 'CHANNEL_MUTATION', embed);
}

export async function onChannelCreate(channel: NonThreadGuildBasedChannel): Promise<void> {
  if (!channel.guild) return;
  const guild = channel.guild;

  // 1. Cache snapshot
  await saveChannelSnapshot(channel);

  // 2. Telemetry Log
  const embed = new EmbedBuilder()
    .setTitle('📁 CHANNEL CREATED')
    .setColor(CONFIG.SUCCESS_COLOR)
    .setDescription(`Channel <#${channel.id}> (**#${channel.name}**) was created.`)
    .addFields(
      { name: 'Channel Type', value: `\`${channel.type}\``, inline: true },
      { name: 'Parent Category', value: channel.parent ? channel.parent.name : 'None', inline: true }
    )
    .setTimestamp();

  await MasterSocService.logAuditTelemetry(guild.client, guild.id, 'CHANNEL_MUTATION', embed);
}

export async function onChannelUpdate(
  oldChannel: DMChannel | NonThreadGuildBasedChannel,
  newChannel: DMChannel | NonThreadGuildBasedChannel
): Promise<void> {
  if (!('guild' in newChannel) || !newChannel.guild) return;
  const guild = newChannel.guild;

  // 1. Update snapshot
  await saveChannelSnapshot(newChannel);

  const oldName = 'name' in oldChannel ? oldChannel.name : 'Direct Message';
  const newName = 'name' in newChannel ? newChannel.name : 'Direct Message';

  // 2. Telemetry Log
  const embed = new EmbedBuilder()
    .setTitle('📁 CHANNEL MODIFIED')
    .setColor(CONFIG.WARN_COLOR)
    .setDescription(`Channel <#${newChannel.id}> (**#${newName}**) settings were updated.`)
    .addFields(
      { name: 'Old Name', value: oldName, inline: true },
      { name: 'New Name', value: newName, inline: true }
    )
    .setTimestamp();

  await MasterSocService.logAuditTelemetry(guild.client, guild.id, 'CHANNEL_MUTATION', embed);
}
