import {
  Client,
  Guild,
  ChannelType,
  PermissionFlagsBits,
  CategoryChannel,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from 'discord.js';
import { CONFIG } from '../config';
import { ModerationService } from './moderationService';
import { getOrCreateGuildConfig } from '../db';

export class MasterSocService {
  /**
   * Reconcile all connected target guilds into the Master SOC
   */
  public static async reconcileAllGuilds(client: Client): Promise<void> {
    const masterGuild = client.guilds.cache.get(CONFIG.MASTER_GUILD_ID);
    if (!masterGuild) {
      console.warn(`[MASTER SOC] Master Guild (${CONFIG.MASTER_GUILD_ID}) not found in client cache.`);
      return;
    }

    console.log(`[MASTER SOC] Initiating reconciliation across ${client.guilds.cache.size} guilds...`);
    for (const [, targetGuild] of client.guilds.cache) {
      if (targetGuild.id === masterGuild.id) continue;
      await this.provisionGuildSoc(masterGuild, targetGuild).catch(err => {
        console.error(`[MASTER SOC] Failed to reconcile guild ${targetGuild.name} (${targetGuild.id}):`, err);
      });
    }
    console.log(`[MASTER SOC] Reconciliation completed.`);
  }

  /**
   * Provision the category and 4 private channels for a target guild in the Master Guild
   */
  public static async provisionGuildSoc(masterGuild: Guild, targetGuild: Guild): Promise<{
    category: CategoryChannel;
    panelChannel: TextChannel;
    auditChannel: TextChannel;
    botLogChannel: TextChannel;
    commandChannel: TextChannel;
  } | null> {
    try {
      const categoryName = `🌐・${targetGuild.name.slice(0, 25)}`;
      const last4 = targetGuild.id.slice(-4);
      const panelChannelName = `panel-${last4}`;
      const auditChannelName = 'audit-logs';
      const botLogChannelName = 'bot-log';
      const commandChannelName = 'command';

      // 1. Find or create Category
      let category = masterGuild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && (c.name === categoryName || c.name.startsWith(`🌐・${targetGuild.name.slice(0, 15)}`))
      ) as CategoryChannel | undefined;

      const privateOverwrites = [
        {
          id: masterGuild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: masterGuild.client.user!.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ];

      if (CONFIG.MASTER_OWNER_ID) {
        privateOverwrites.push({
          id: CONFIG.MASTER_OWNER_ID,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        });
      }

      if (!category) {
        category = await masterGuild.channels.create({
          name: categoryName,
          type: ChannelType.GuildCategory,
          permissionOverwrites: privateOverwrites,
        });
      }

      // Helper to ensure channel
      const ensureChannel = async (name: string, topic: string): Promise<TextChannel> => {
        let channel = masterGuild.channels.cache.find(
          c => c.type === ChannelType.GuildText && c.parentId === category!.id && c.name === name
        ) as TextChannel | undefined;

        if (!channel) {
          channel = await masterGuild.channels.create({
            name,
            type: ChannelType.GuildText,
            parent: category!.id,
            topic,
            permissionOverwrites: privateOverwrites,
          });
        } else if (channel.topic !== topic) {
          await channel.setTopic(topic).catch(() => null);
        }
        return channel;
      };

      const panelChannel = await ensureChannel(panelChannelName, `TARGET_GUILD_ID:${targetGuild.id}:PANEL`);
      const auditChannel = await ensureChannel(auditChannelName, `TARGET_GUILD_ID:${targetGuild.id}:AUDIT`);
      const botLogChannel = await ensureChannel(botLogChannelName, `TARGET_GUILD_ID:${targetGuild.id}:BOT`);
      const commandChannel = await ensureChannel(commandChannelName, `TARGET_GUILD_ID:${targetGuild.id}:COMMAND`);

      // Post initial SOC panel embed if panel channel is empty
      const messages = await panelChannel.messages.fetch({ limit: 5 }).catch(() => null);
      if (!messages || messages.size === 0) {
        await this.postInitialSocPanel(panelChannel, targetGuild);
      }

      return { category, panelChannel, auditChannel, botLogChannel, commandChannel };
    } catch (error) {
      console.error(`[MASTER SOC] Error provisioning for ${targetGuild.name}:`, error);
      return null;
    }
  }

  /**
   * Post initial SOC Control Panel in #panel-[last4]
   */
  public static async postInitialSocPanel(panelChannel: TextChannel, targetGuild: Guild): Promise<void> {
    const config = await getOrCreateGuildConfig(targetGuild.id);
    const owner = await targetGuild.fetchOwner().catch(() => null);

    const embed = new EmbedBuilder()
      .setTitle(`🛰️ ENTERPRISE SOC TERMINAL // ${targetGuild.name.toUpperCase()}`)
      .setColor(CONFIG.CYBERPUNK_CYAN)
      .setDescription(
        `Centralized real-time monitoring and defense interface for **${targetGuild.name}**.\n` +
        `Target Server ID: \`${targetGuild.id}\``
      )
      .addFields(
        { name: '👑 Server Owner', value: owner ? `${owner.user.tag} (\`${owner.id}\`)` : 'Unknown', inline: true },
        { name: '👥 Member Count', value: `\`${targetGuild.memberCount}\``, inline: true },
        { name: '🔒 Lockdown', value: config.isLockedDown ? '🚨 ACTIVE' : '🟢 NORMAL', inline: true },
        { name: '🛡️ Anti-Nuke', value: config.antiNukeEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
        { name: '🛑 Anti-Raid', value: config.antiRaidEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
        { name: '💻 CLI Terminal', value: `Active in <#${panelChannel.parentId}>`, inline: true }
      )
      .setFooter({ text: 'GUARD Enterprise SOC Master Control Grid' })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`soc_lockdown_${targetGuild.id}`).setLabel('Lockdown').setEmoji('🚨').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`soc_unlock_${targetGuild.id}`).setLabel('Unlockdown').setEmoji('🔓').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`soc_status_${targetGuild.id}`).setLabel('Refresh Status').setEmoji('🔄').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`soc_serverinfo_${targetGuild.id}`).setLabel('Server Intel').setEmoji('📊').setStyle(ButtonStyle.Secondary)
    );

    await panelChannel.send({ embeds: [embed], components: [row] });
  }

  /**
   * Resolves target Guild from a Master SOC channel
   */
  public static findTargetGuildFromChannel(channel: any, client: Client): Guild | null {
    if (!channel || !channel.topic) return null;
    const match = channel.topic.match(/TARGET_GUILD_ID:(\d+)/);
    if (match && match[1]) {
      return client.guilds.cache.get(match[1]) || null;
    }

    // Try looking at category parent channels if topic missing
    if (channel.parent && channel.parent.type === ChannelType.GuildCategory) {
      for (const [, sibling] of channel.parent.children.cache) {
        if (sibling.topic) {
          const siblingMatch = sibling.topic.match(/TARGET_GUILD_ID:(\d+)/);
          if (siblingMatch && siblingMatch[1]) {
            return client.guilds.cache.get(siblingMatch[1]) || null;
          }
        }
      }
    }

    return null;
  }

  /**
   * Dispatch log message to both target server's log channel and Master SOC #audit-logs
   */
  public static async logAudit(client: Client, targetGuildId: string, embed: EmbedBuilder): Promise<void> {
    try {
      // 1. Post to Target Guild log channel if configured
      const config = await getOrCreateGuildConfig(targetGuildId);
      const targetGuild = client.guilds.cache.get(targetGuildId);

      if (targetGuild && config.logChannelId) {
        const targetLogChannel = targetGuild.channels.cache.get(config.logChannelId) as TextChannel | undefined;
        if (targetLogChannel) {
          await targetLogChannel.send({ embeds: [embed] }).catch(() => null);
        }
      }

      // 2. Post to Master Guild #audit-logs
      const masterGuild = client.guilds.cache.get(CONFIG.MASTER_GUILD_ID);
      if (masterGuild) {
        const auditChannel = masterGuild.channels.cache.find(
          c => c.type === ChannelType.GuildText && (c as TextChannel).topic?.includes(`TARGET_GUILD_ID:${targetGuildId}:AUDIT`)
        ) as TextChannel | undefined;

        if (auditChannel) {
          await auditChannel.send({ embeds: [embed] }).catch(() => null);
        }
      }
    } catch (error) {
      console.error(`[AUDIT LOG DISPATCH ERROR]:`, error);
    }
  }

  /**
   * Dispatch system / bot operational event to Master SOC #bot-log
   */
  public static async logBot(client: Client, targetGuildId: string, embed: EmbedBuilder): Promise<void> {
    try {
      const masterGuild = client.guilds.cache.get(CONFIG.MASTER_GUILD_ID);
      if (!masterGuild) return;

      const botLogChannel = masterGuild.channels.cache.find(
        c => c.type === ChannelType.GuildText && (c as TextChannel).topic?.includes(`TARGET_GUILD_ID:${targetGuildId}:BOT`)
      ) as TextChannel | undefined;

      if (botLogChannel) {
        await botLogChannel.send({ embeds: [embed] }).catch(() => null);
      }
    } catch (error) {
      console.error(`[BOT LOG DISPATCH ERROR]:`, error);
    }
  }

  /**
   * Handles SOC Panel buttons in #panel-[last4]
   */
  public static async handleSocButton(interaction: ButtonInteraction, client: Client): Promise<void> {
    const id = interaction.customId;
    if (!id.startsWith('soc_')) return;

    const parts = id.split('_');
    const action = parts[1];
    const targetGuildId = parts[2];

    const targetGuild = client.guilds.cache.get(targetGuildId);
    if (!targetGuild) {
      await interaction.reply({ content: `❌ Target Guild (\`${targetGuildId}\`) not reachable.`, ephemeral: true });
      return;
    }

    if (action === 'lockdown') {
      const res = await ModerationService.lockdownGuild(targetGuild, 'Master SOC Console Action');
      await interaction.reply({ content: res.message, ephemeral: true });
    } else if (action === 'unlock') {
      const res = await ModerationService.unlockdownGuild(targetGuild, 'Master SOC Console Action');
      await interaction.reply({ content: res.message, ephemeral: true });
    } else if (action === 'status') {
      const embed = await ModerationService.getServerInfoEmbed(targetGuild);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (action === 'serverinfo') {
      const embed = await ModerationService.getServerInfoEmbed(targetGuild);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
}
