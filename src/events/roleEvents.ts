import { Role, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { AntiNukeService } from '../services/antiNukeService';
import { MasterSocService } from '../services/masterSocService';
import { saveRoleSnapshot, deleteRoleSnapshot } from '../db';
import { CONFIG } from '../config';

export async function onRoleDelete(role: Role): Promise<void> {
  const guild = role.guild;
  if (!guild) return;

  // 1. Anti-Nuke Sliding Window check & Restoration Queue
  await AntiNukeService.handleRoleDelete(role);

  // 2. Delete snapshot
  await deleteRoleSnapshot(guild.id, role.id);

  // 3. Telemetry Log
  const embed = new EmbedBuilder()
    .setTitle('🎭 ROLE DELETED')
    .setColor(CONFIG.DANGER_COLOR)
    .setDescription(`Role **@${role.name}** (\`${role.id}\`) was deleted.`)
    .addFields(
      { name: 'Color', value: `#${role.color.toString(16).padStart(6, '0')}`, inline: true },
      { name: 'Position', value: `${role.position}`, inline: true }
    )
    .setTimestamp();

  await MasterSocService.logAuditTelemetry(guild.client, guild.id, 'ROLE_HIERARCHY', embed);
}

export async function onRoleCreate(role: Role): Promise<void> {
  const guild = role.guild;
  if (!guild) return;

  // 1. Cache snapshot
  await saveRoleSnapshot(role);

  // 2. Telemetry Log
  const embed = new EmbedBuilder()
    .setTitle('🎭 ROLE CREATED')
    .setColor(CONFIG.SUCCESS_COLOR)
    .setDescription(`Role <@&${role.id}> (**@${role.name}**) was created.`)
    .addFields(
      { name: 'Color', value: `#${role.color.toString(16).padStart(6, '0')}`, inline: true },
      { name: 'Position', value: `${role.position}`, inline: true },
      { name: 'Admin Perms', value: role.permissions.has(PermissionFlagsBits.Administrator) ? '⚠️ YES' : 'No', inline: true }
    )
    .setTimestamp();

  await MasterSocService.logAuditTelemetry(guild.client, guild.id, 'ROLE_HIERARCHY', embed);
}

export async function onRoleUpdate(oldRole: Role, newRole: Role): Promise<void> {
  const guild = newRole.guild;
  if (!guild) return;

  // 1. Update snapshot
  await saveRoleSnapshot(newRole);

  const hadAdmin = oldRole.permissions.has(PermissionFlagsBits.Administrator);
  const hasAdmin = newRole.permissions.has(PermissionFlagsBits.Administrator);

  // 2. Telemetry Log
  const embed = new EmbedBuilder()
    .setTitle('🎭 ROLE MODIFIED')
    .setColor(hasAdmin && !hadAdmin ? CONFIG.DANGER_COLOR : CONFIG.WARN_COLOR)
    .setDescription(`Role <@&${newRole.id}> (**@${newRole.name}**) was updated.`)
    .addFields(
      { name: 'Old Name', value: oldRole.name, inline: true },
      { name: 'New Name', value: newRole.name, inline: true },
      { name: 'Admin Escalation', value: hasAdmin && !hadAdmin ? '🚨 ELEVATED TO ADMINISTRATOR' : 'Normal', inline: true }
    )
    .setTimestamp();

  await MasterSocService.logAuditTelemetry(guild.client, guild.id, 'ROLE_HIERARCHY', embed);
}
