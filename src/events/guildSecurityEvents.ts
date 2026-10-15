import { Guild, GuildBan, NonThreadGuildBasedChannel, EmbedBuilder } from 'discord.js';
import { AntiNukeService } from '../services/antiNukeService';
import { SecurityShieldService } from '../services/securityShieldService';
import { MasterSocService } from '../services/masterSocService';
import { CONFIG } from '../config';

export async function onGuildBanAdd(ban: GuildBan): Promise<void> {
  const guild = ban.guild;
  if (!guild) return;

  // 1. Anti-Nuke check for mass bans
  await AntiNukeService.handleMemberRemoveOrBan(guild, 'BAN');

  // 2. Telemetry Log
  const embed = new EmbedBuilder()
    .setTitle('🔨 MEMBER BANNED')
    .setColor(CONFIG.DANGER_COLOR)
    .setDescription(`User <@${ban.user.id}> (${ban.user.tag}) was banned from **${guild.name}**.`)
    .addFields({ name: 'Reason', value: ban.reason || 'No reason provided', inline: false })
    .setThumbnail(ban.user.displayAvatarURL({ size: 128 }))
    .setTimestamp();

  await MasterSocService.logAuditTelemetry(guild.client, guild.id, 'MEMBER_LOGS', embed);
}

export async function onWebhooksUpdate(channel: NonThreadGuildBasedChannel): Promise<void> {
  const guild = channel.guild;
  if (!guild) return;

  // 1. Unauthorized Webhook Shield
  await SecurityShieldService.handleWebhookCreate(channel);

  // 2. Telemetry Log
  const embed = new EmbedBuilder()
    .setTitle('🔗 WEBHOOK ACTIVITY')
    .setColor(CONFIG.THEME_COLOR)
    .setDescription(`Webhook configuration updated in channel <#${channel.id}>.`)
    .setTimestamp();

  await MasterSocService.logAuditTelemetry(guild.client, guild.id, 'WEBHOOKS', embed);
}

export async function onGuildUpdate(oldGuild: Guild, newGuild: Guild): Promise<void> {
  // Telemetry Log for Server Updates
  const embed = new EmbedBuilder()
    .setTitle('🌐 SERVER MUTATION DETECTED')
    .setColor(CONFIG.WARN_COLOR)
    .setDescription(`Server configuration updated for **${newGuild.name}**.`)
    .addFields(
      { name: 'Old Name', value: oldGuild.name, inline: true },
      { name: 'New Name', value: newGuild.name, inline: true },
      { name: 'Vanity URL', value: newGuild.vanityURLCode || 'None', inline: true }
    )
    .setTimestamp();

  await MasterSocService.logAuditTelemetry(newGuild.client, newGuild.id, 'GUILD_UPDATE', embed);
}
