import { Client, Guild } from 'discord.js';
import { groupACommands, groupBCommands } from '../commands';
import { TargetProvisioningService } from '../services/targetProvisioningService';
import { MasterSocService } from '../services/masterSocService';
import { AntiNukeService } from '../services/antiNukeService';
import { CONFIG } from '../config';

export async function onReady(client: Client): Promise<void> {
  console.log(`[BOOT] Logged in as ${client.user?.tag} (ID: ${client.user?.id})`);

  // Explicitly clear any existing activity presence so profile renders cleanly without rich presence cards
  client.user?.setPresence({
    activities: [],
    status: 'online',
  });

  // 1. Enforce explicit zero default permissions (0n) on all restricted commands (excluding public commands: /help, /about)
  const publicCommands = ['about', 'help'];
  for (const cmd of groupACommands) {
    if (!publicCommands.includes(cmd.data.name)) {
      cmd.data.setDefaultMemberPermissions(0n);
    }
  }
  for (const cmd of groupBCommands) {
    cmd.data.setDefaultMemberPermissions(0n);
  }

  // 2. Synchronize Global Commands strictly: overwrite global commands and permanently wipe obsolete commands
  try {
    console.log(`[SLASH] Synchronizing ${groupACommands.length} global application slash commands (Group A)...`);
    if (client.application) {
      const registered = await client.application.commands.set(groupACommands.map(c => c.data));
      console.log('[SLASH] Group A global commands synchronized strictly. Obsolete commands purged globally.');
      const helpCmd = registered?.find ? registered.find((c: any) => c.name === 'help') : null;
      const aboutCmd = registered?.find ? registered.find((c: any) => c.name === 'about') : null;
      if (helpCmd) console.log(`[SLASH INFO] /help registered -> ID: ${helpCmd.id} (Mention: </help:${helpCmd.id}>)`);
      if (aboutCmd) console.log(`[SLASH INFO] /about registered -> ID: ${aboutCmd.id} (Mention: </about:${aboutCmd.id}>)`);
    }
  } catch (error) {
    console.error('[SLASH ERROR] Failed to synchronize global slash commands:', error);
  }

  // 3. Strict Master Guild vs External Guild Command Sync:
  //    - If guild.id === CONFIG.MASTER_GUILD_ID: call await guild.commands.set(groupBCommands.map(c => c.data))
  //    - Otherwise: call await guild.commands.set([]) to wipe any leftover guild-level commands
  for (const [guildId, guild] of client.guilds.cache) {
    if (guildId === CONFIG.MASTER_GUILD_ID) {
      try {
        console.log(`[SLASH] Registering ${groupBCommands.length} Master Guild commands (Group B) to ${guild.name} (${guildId})...`);
        await guild.commands.set(groupBCommands.map(c => c.data));
        console.log('[SLASH] Master Guild commands registered strictly.');
      } catch (error) {
        console.error('[SLASH ERROR] Failed to register Master Guild commands:', error);
      }
    } else {
      try {
        if (guild.commands) {
          console.log(`[SLASH] Purging leftover guild-level commands from ${guild.name} (${guildId})...`);
          await guild.commands.set([]);
        }
      } catch {
        // Ignore inaccessible guilds or permissions issues
      }
    }
  }

  // Fallback: If Master Guild is not present in client.guilds.cache, attempt fetch and register
  if (!client.guilds.cache.has(CONFIG.MASTER_GUILD_ID)) {
    try {
      const masterGuild = await client.guilds.fetch(CONFIG.MASTER_GUILD_ID).catch(() => null) as Guild | null;
      if (masterGuild) {
        await masterGuild.commands.set(groupBCommands.map(c => c.data));
        console.log('[SLASH] Master Guild commands registered after fetch.');
      } else if (client.application) {
        await client.application.commands.set(groupBCommands.map(c => c.data), CONFIG.MASTER_GUILD_ID);
        console.log('[SLASH] Master Guild commands set via client.application.commands.');
      }
    } catch (err) {
      console.error('[SLASH ERROR] Master Guild fallback registration failed:', err);
    }
  }

  // 5. Target Server Provisioning & Snapshots: Category "Guard Space" & VC "Guard Vc" with 24/7 connection
  for (const [, guild] of client.guilds.cache) {
    try {
      console.log(`[PROVISION] Syncing Voice, Category & Snapshots for ${guild.name} (${guild.id})...`);
      await TargetProvisioningService.provisionGuild(guild);
      await AntiNukeService.snapshotGuild(guild);
    } catch (err) {
      console.error(`[PROVISION ERROR] Guild ${guild.id}:`, err);
    }
  }

  // 6. Start 24/7 Automatic Voice Reconnect Loop Monitor
  TargetProvisioningService.startReconnectMonitor(client);

  // 7. Master SOC Provisioning: Category "🌐・[Target Guild Name]" & 4 private channels + Daily Cron
  try {
    await MasterSocService.reconcileAllGuilds(client);
  } catch (err) {
    console.error('[MASTER SOC ERROR] Reconciliation failed on startup:', err);
  }

  // 8. Periodic Heartbeat Latency Monitor (every 60s)
  setInterval(() => {
    MasterSocService.checkHeartbeatLatency(client).catch(() => null);
  }, 60000);

  console.log(`[BOOT] All GUARD Enterprise systems are fully operational.`);
}
