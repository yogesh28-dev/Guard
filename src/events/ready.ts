import { Client, ActivityType } from 'discord.js';
import { commands } from '../commands';
import { TargetProvisioningService } from '../services/targetProvisioningService';
import { MasterSocService } from '../services/masterSocService';
import { CONFIG } from '../config';

export async function onReady(client: Client): Promise<void> {
  console.log(`[BOOT] Logged in as ${client.user?.tag} (ID: ${client.user?.id})`);

  // Set rich security bot activity
  client.user?.setPresence({
    activities: [
      {
        name: 'GUARD SOC // Enterprise Defense Grid',
        type: ActivityType.Watching,
      },
    ],
    status: 'online',
  });

  // 1. Deploy Global Slash Commands
  try {
    console.log(`[SLASH] Registering ${commands.length} application slash commands...`);
    const commandData = commands.map(c => c.data);
    await client.application?.commands.set(commandData);
    console.log('[SLASH] Application commands synchronized successfully.');
  } catch (error) {
    console.error('[SLASH ERROR] Failed to register slash commands:', error);
  }

  // 2. Target Server Provisioning: Category "𝖦𝖺𝗎𝗋𝖽 𝖲𝗉𝖺𝖼𝖾" & VC "𝖦𝖺𝗎𝗋𝖽 𝖵𝖼" with 24/7 connection
  for (const [, guild] of client.guilds.cache) {
    try {
      console.log(`[PROVISION] Checking Voice & Category for ${guild.name} (${guild.id})...`);
      await TargetProvisioningService.provisionGuild(guild);
    } catch (err) {
      console.error(`[PROVISION ERROR] Guild ${guild.id}:`, err);
    }
  }

  // 3. Master SOC Provisioning: Category "🌐・[Target Guild Name]" & 4 private channels
  try {
    await MasterSocService.reconcileAllGuilds(client);
  } catch (err) {
    console.error('[MASTER SOC ERROR] Reconciliation failed on startup:', err);
  }

  console.log(`[BOOT] All GUARD Enterprise systems are fully operational.`);
}
