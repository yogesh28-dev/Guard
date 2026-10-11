import { Guild, EmbedBuilder } from 'discord.js';
import { TargetProvisioningService } from '../services/targetProvisioningService';
import { MasterSocService } from '../services/masterSocService';
import { CONFIG } from '../config';

export async function onGuildCreate(guild: Guild): Promise<void> {
  console.log(`[GUILD JOIN] Joined target guild: ${guild.name} (${guild.id})`);

  // Provision target guild Voice & Category
  await TargetProvisioningService.provisionGuild(guild);

  // Provision Master SOC Category & 4 Channels
  const masterGuild = guild.client.guilds.cache.get(CONFIG.MASTER_GUILD_ID);
  if (masterGuild && guild.id !== masterGuild.id) {
    await MasterSocService.provisionGuildSoc(masterGuild, guild);

    const logEmbed = new EmbedBuilder()
      .setTitle('📥 NEW TARGET GUILD ATTACHED')
      .setColor(CONFIG.SUCCESS_COLOR)
      .setDescription(
        `Bot successfully joined and provisioned **${guild.name}**.\n` +
        `• Target Guild ID: \`${guild.id}\`\n` +
        `• Member Count: \`${guild.memberCount}\`\n` +
        `• Owner ID: \`${guild.ownerId}\``
      )
      .setTimestamp();

    await MasterSocService.logBot(guild.client, guild.id, logEmbed);
  }
}
