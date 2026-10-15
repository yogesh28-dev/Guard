import {
  Guild,
  ChannelType,
  PermissionFlagsBits,
  VoiceChannel,
  CategoryChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
  Client,
} from 'discord.js';
import {
  joinVoiceChannel,
  VoiceConnection,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import { CONFIG, isMasterOwner, isGuardCategory, isGuardVc } from '../config';
import { ModerationService } from './moderationService';

export class TargetProvisioningService {
  private static reconnectingGuilds = new Set<string>();
  private static monitorInterval: NodeJS.Timeout | null = null;

  /**
   * Provision the "Guard Space" category at position 0 and "Guard Vc" voice channel with 24/7 connection
   */
  public static async provisionGuild(guild: Guild): Promise<{
    category: CategoryChannel;
    voiceChannel: VoiceChannel;
    connection?: VoiceConnection;
  } | null> {
    try {
      // 1. Find or create category "Guard Space"
      let category = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && isGuardCategory(c.name)
      ) as CategoryChannel | undefined;

      const categoryOverwrites = [
        {
          id: guild.roles.everyone.id,
          allow: [PermissionFlagsBits.ViewChannel],
        },
      ];

      if (!category) {
        category = await guild.channels.create({
          name: CONFIG.GUARD_CATEGORY_NAME,
          type: ChannelType.GuildCategory,
          position: 0,
          permissionOverwrites: categoryOverwrites,
        });
      } else {
        // Enforce position 0
        if (category.position !== 0) {
          await category.setPosition(0).catch(() => null);
        }
      }

      // 2. Find or create voice channel "Guard Vc"
      let voiceChannel = guild.channels.cache.find(
        c => c.type === ChannelType.GuildVoice && isGuardVc(c.name) && c.parentId === category?.id
      ) as VoiceChannel | undefined;

      if (!voiceChannel) {
        voiceChannel = guild.channels.cache.find(
          c => c.type === ChannelType.GuildVoice && isGuardVc(c.name)
        ) as VoiceChannel | undefined;
      }

      // Overwrites:
      // @everyone: ViewChannel: true, Connect: false, Speak: false
      // Bot & Server Owner: ViewChannel: true, Connect: true, Speak: true, Administrator: true
      const everyonePermissions = {
        id: guild.roles.everyone.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
      };

      const ownerPermissions = {
        id: guild.ownerId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.PrioritySpeaker,
          PermissionFlagsBits.MoveMembers,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.DeafenMembers,
          PermissionFlagsBits.Administrator,
        ],
      };

      const botId = guild.members.me?.id || guild.client.user?.id;
      const botPermissions = botId
        ? [
            {
              id: botId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.Connect,
                PermissionFlagsBits.Speak,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.MuteMembers,
                PermissionFlagsBits.DeafenMembers,
                PermissionFlagsBits.MoveMembers,
                PermissionFlagsBits.Administrator,
              ],
            },
          ]
        : [];

      if (!voiceChannel) {
        voiceChannel = await guild.channels.create({
          name: CONFIG.GUARD_VC_NAME,
          type: ChannelType.GuildVoice,
          parent: category.id,
          permissionOverwrites: [everyonePermissions, ownerPermissions, ...botPermissions],
        });
      } else {
        // Ensure proper permissions and parent
        await voiceChannel.permissionOverwrites.set([everyonePermissions, ownerPermissions, ...botPermissions]).catch(() => null);
        if (voiceChannel.parentId !== category.id) {
          await voiceChannel.setParent(category.id).catch(() => null);
        }
      }

      // 3. Persistent 24/7 Locked Voice Connection with automatic reconnect loop
      const connection = this.maintainVoiceConnection(voiceChannel);

      return { category, voiceChannel, connection };
    } catch (error) {
      console.error(`[PROVISIONING ERROR] Guild ${guild.id} (${guild.name}):`, error);
      return null;
    }
  }

  /**
   * Maintain 24/7 voice connection in the Guard VC with an automatic reconnect loop
   */
  public static maintainVoiceConnection(voiceChannel: VoiceChannel): VoiceConnection {
    const guildId = voiceChannel.guild.id;
    const existing = getVoiceConnection(guildId);

    if (existing && existing.joinConfig.channelId === voiceChannel.id && existing.state.status !== VoiceConnectionStatus.Destroyed) {
      return existing;
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    this.attachConnectionReconnectLoop(connection, voiceChannel);
    return connection;
  }

  /**
   * Automatic reconnect loop and error-recovery handlers for voice connection
   */
  private static attachConnectionReconnectLoop(connection: VoiceConnection, voiceChannel: VoiceChannel): void {
    const guildId = voiceChannel.guild.id;

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        // Connection recovered
      } catch {
        if (!this.reconnectingGuilds.has(guildId)) {
          this.reconnectingGuilds.add(guildId);
          console.warn(`[VOICE RECONNECT] Connection lost in ${voiceChannel.guild.name}. Triggering reconnect loop...`);

          setTimeout(() => {
            try {
              connection.destroy();
            } catch {}
            this.reconnectingGuilds.delete(guildId);
            this.maintainVoiceConnection(voiceChannel);
          }, 2000);
        }
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      if (!this.reconnectingGuilds.has(guildId)) {
        this.reconnectingGuilds.add(guildId);
        setTimeout(() => {
          this.reconnectingGuilds.delete(guildId);
          this.maintainVoiceConnection(voiceChannel);
        }, 3000);
      }
    });

    connection.on('error', (error) => {
      console.error(`[VOICE ERROR] Guild ${voiceChannel.guild.name}:`, error);
    });
  }

  /**
   * Start periodic 24/7 background heartbeat monitor across all guilds
   */
  public static startReconnectMonitor(client: Client): void {
    if (this.monitorInterval) return;

    this.monitorInterval = setInterval(async () => {
      for (const [, guild] of client.guilds.cache) {
        if (guild.id === CONFIG.MASTER_GUILD_ID) continue;

        const guardVC = guild.channels.cache.find(
          c => c.type === ChannelType.GuildVoice && isGuardVc(c.name)
        ) as VoiceChannel | undefined;

        if (guardVC) {
          const conn = getVoiceConnection(guild.id);
          if (!conn || conn.state.status === VoiceConnectionStatus.Destroyed || conn.state.status === VoiceConnectionStatus.Disconnected) {
            console.log(`[VOICE MONITOR] Reconnecting Guard VC in ${guild.name} (${guild.id})...`);
            this.maintainVoiceConnection(guardVC);
          }
        }
      }
    }, 15000);
  }

  /**
   * Build the 20-button Voice Control Panel Embed & Rows
   */
  public static createVoiceControlPanel(guild: Guild, ownerId: string) {
    const embed = new EmbedBuilder()
      .setTitle('🎙️ Voice Control Panel')
      .setDescription(
        `Welcome <@${ownerId}>. Use the buttons below to manage **${CONFIG.GUARD_VC_NAME}**, control members, or adjust voice settings.`
      )
      .setColor(0x14FA22)
      .addFields(
        { name: '👥 Voice Room', value: `\`${CONFIG.GUARD_VC_NAME}\``, inline: true },
        { name: '👑 Managed By', value: `<@${ownerId}>`, inline: true }
      )
      .setFooter({ text: 'GUARD Security • Voice Controls' })
      .setTimestamp();

    // Row 1: Audio Mass Controls (5 buttons)
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('vc_mute_all').setLabel('Mute All').setEmoji('🔇').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('vc_unmute_all').setLabel('Unmute All').setEmoji('🔊').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('vc_deafen_all').setLabel('Deafen All').setEmoji('🔕').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('vc_undeafen_all').setLabel('Undeafen All').setEmoji('🔔').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('vc_disconnect_all').setLabel('Disconnect All').setEmoji('🚪').setStyle(ButtonStyle.Danger)
    );

    // Row 2: Access & Member Controls (5 buttons)
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('vc_lock').setLabel('Lock VC').setEmoji('🔒').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('vc_unlock').setLabel('Unlock VC').setEmoji('🔓').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('vc_kick_user').setLabel('VC Ban/Kick').setEmoji('👢').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('vc_vdrag').setLabel('VDrag All').setEmoji('🧲').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('vc_limit').setLabel('User Limit').setEmoji('👥').setStyle(ButtonStyle.Secondary)
    );

    // Row 3: Quality & Permission Flags (5 buttons)
    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('vc_rename').setLabel('Rename VC').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vc_bitrate').setLabel('Boost Bitrate').setEmoji('📶').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('vc_priority').setLabel('Priority Speaker').setEmoji('🎙️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('vc_toggle_stream').setLabel('Toggle Video').setEmoji('🖥️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vc_toggle_soundboard').setLabel('Toggle Sound').setEmoji('📢').setStyle(ButtonStyle.Secondary)
    );

    // Row 4: Diagnostics & Emergency Commands (5 buttons)
    const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('vc_mute_bot').setLabel('Mute Bot').setEmoji('🤖').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('vc_purge_chat').setLabel('Purge VC Chat').setEmoji('🧹').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('vc_security_alert').setLabel('Lockdown Guild').setEmoji('🚨').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('vc_status_info').setLabel('VC Diagnostics').setEmoji('ℹ️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('vc_end_session').setLabel('End Session').setEmoji('🛑').setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row1, row2, row3, row4] };
  }

  /**
   * Spawns the Voice Control Panel inside the VC text chat when the server owner joins
   */
  public static async spawnVoiceControlPanel(voiceChannel: VoiceChannel, ownerId: string): Promise<void> {
    try {
      const panel = this.createVoiceControlPanel(voiceChannel.guild, ownerId);
      await voiceChannel.send(panel);
    } catch (error) {
      console.error(`[PANEL ERROR] Failed to send VC Control Panel to channel ${voiceChannel.id}:`, error);
    }
  }

  /**
   * Handle the 20 moderation buttons
   */
  public static async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!guild) return;

    // Check permissions: Only guild owner or Master Owner
    const isOwner = guild.ownerId === interaction.user.id || isMasterOwner(interaction.user.id);
    if (!isOwner) {
      await interaction.reply({
        content: '⛔ **Access Denied**: Voice Control Panel is strictly reserved for the Server Owner and Super Admin.',
        ephemeral: true,
      });
      return;
    }

    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    const voiceChannel = member?.voice.channel as VoiceChannel | null;

    switch (interaction.customId) {
      case 'vc_mute_all': {
        if (!voiceChannel) {
          await interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
          return;
        }
        let count = 0;
        for (const [, m] of voiceChannel.members) {
          if (m.id !== guild.ownerId && !m.user.bot) {
            await m.voice.setMute(true, 'VC Panel Mute All').catch(() => null);
            count++;
          }
        }
        await interaction.reply({ content: `🔇 Server-muted ${count} members in ${voiceChannel.name}.`, ephemeral: true });
        break;
      }

      case 'vc_unmute_all': {
        if (!voiceChannel) {
          await interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
          return;
        }
        let count = 0;
        for (const [, m] of voiceChannel.members) {
          await m.voice.setMute(false, 'VC Panel Unmute All').catch(() => null);
          count++;
        }
        await interaction.reply({ content: `🔊 Unmuted ${count} members in ${voiceChannel.name}.`, ephemeral: true });
        break;
      }

      case 'vc_deafen_all': {
        if (!voiceChannel) {
          await interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
          return;
        }
        let count = 0;
        for (const [, m] of voiceChannel.members) {
          if (m.id !== guild.ownerId && !m.user.bot) {
            await m.voice.setDeaf(true, 'VC Panel Deafen All').catch(() => null);
            count++;
          }
        }
        await interaction.reply({ content: `🔕 Server-deafened ${count} members in ${voiceChannel.name}.`, ephemeral: true });
        break;
      }

      case 'vc_undeafen_all': {
        if (!voiceChannel) {
          await interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
          return;
        }
        let count = 0;
        for (const [, m] of voiceChannel.members) {
          await m.voice.setDeaf(false, 'VC Panel Undeafen All').catch(() => null);
          count++;
        }
        await interaction.reply({ content: `🔔 Undeafened ${count} members in ${voiceChannel.name}.`, ephemeral: true });
        break;
      }

      case 'vc_disconnect_all': {
        if (!voiceChannel) {
          await interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
          return;
        }
        let count = 0;
        for (const [, m] of voiceChannel.members) {
          if (m.id !== guild.ownerId && !m.user.bot) {
            await m.voice.disconnect('VC Panel Disconnect All').catch(() => null);
            count++;
          }
        }
        await interaction.reply({ content: `🚪 Disconnected ${count} non-owner members.`, ephemeral: true });
        break;
      }

      case 'vc_lock': {
        const targetVC = voiceChannel || (guild.channels.cache.find(c => c.name === CONFIG.GUARD_VC_NAME) as VoiceChannel);
        if (!targetVC) {
          await interaction.reply({ content: '❌ Voice channel not found.', ephemeral: true });
          return;
        }
        await targetVC.permissionOverwrites.edit(guild.roles.everyone, { Connect: false });
        await interaction.reply({ content: `🔒 **Locked**: @everyone can no longer connect to ${targetVC.name}.`, ephemeral: true });
        break;
      }

      case 'vc_unlock': {
        const targetVC = voiceChannel || (guild.channels.cache.find(c => c.name === CONFIG.GUARD_VC_NAME) as VoiceChannel);
        if (!targetVC) {
          await interaction.reply({ content: '❌ Voice channel not found.', ephemeral: true });
          return;
        }
        await targetVC.permissionOverwrites.edit(guild.roles.everyone, { Connect: true });
        await interaction.reply({ content: `🔓 **Unlocked**: @everyone can now connect to ${targetVC.name}.`, ephemeral: true });
        break;
      }

      case 'vc_kick_user': {
        // Show modal to kick member from voice
        const modal = new ModalBuilder()
          .setCustomId('modal_vc_kick')
          .setTitle('VC Ban / Kick Member')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('kick_user_id')
                .setLabel('User ID or Mention to disconnect')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. 123456789012345678')
                .setRequired(true)
            )
          );
        await interaction.showModal(modal);
        break;
      }

      case 'vc_vdrag': {
        if (!voiceChannel) {
          await interaction.reply({ content: '❌ You must be in a voice channel to drag users into it.', ephemeral: true });
          return;
        }
        let dragged = 0;
        const otherVCs = guild.channels.cache.filter(
          c => c.type === ChannelType.GuildVoice && c.id !== voiceChannel.id
        ) as Map<string, VoiceChannel>;

        for (const [, otherVC] of otherVCs) {
          for (const [, m] of otherVC.members) {
            await m.voice.setChannel(voiceChannel, 'VDrag command').catch(() => null);
            dragged++;
          }
        }
        await interaction.reply({ content: `🧲 Dragged ${dragged} members from all other channels into ${voiceChannel.name}.`, ephemeral: true });
        break;
      }

      case 'vc_limit': {
        const modal = new ModalBuilder()
          .setCustomId('modal_vc_limit')
          .setTitle('Set Channel User Limit')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('user_limit_value')
                .setLabel('Maximum Users (0 for unlimited, max 99)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. 10')
                .setRequired(true)
            )
          );
        await interaction.showModal(modal);
        break;
      }

      case 'vc_rename': {
        const modal = new ModalBuilder()
          .setCustomId('modal_vc_rename')
          .setTitle('Rename Voice Channel')
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('channel_name_value')
                .setLabel('New Channel Name')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. 𝖦𝖺𝗎𝗋𝖽 𝖵𝖼 // 𝖲𝖮𝖢')
                .setRequired(true)
            )
          );
        await interaction.showModal(modal);
        break;
      }

      case 'vc_bitrate': {
        const targetVC = voiceChannel || (guild.channels.cache.find(c => c.name === CONFIG.GUARD_VC_NAME) as VoiceChannel);
        if (!targetVC) {
          await interaction.reply({ content: '❌ Voice channel not found.', ephemeral: true });
          return;
        }
        // Max bitrate supported by guild tier
        const maxBitrate = guild.premiumTier === 3 ? 384000 : guild.premiumTier === 2 ? 256000 : guild.premiumTier === 1 ? 128000 : 96000;
        const newBitrate = targetVC.bitrate >= maxBitrate ? 64000 : maxBitrate;
        await targetVC.setBitrate(newBitrate);
        await interaction.reply({ content: `📶 Bitrate set to **${newBitrate / 1000}kbps** (Max: ${maxBitrate / 1000}kbps).`, ephemeral: true });
        break;
      }

      case 'vc_priority': {
        if (!member) {
          await interaction.reply({ content: '❌ Member not found.', ephemeral: true });
          return;
        }
        const hasPriority = voiceChannel?.permissionsFor(member)?.has(PermissionFlagsBits.PrioritySpeaker);
        await voiceChannel?.permissionOverwrites.edit(member, { PrioritySpeaker: !hasPriority });
        await interaction.reply({
          content: `🎙️ Priority Speaker toggled ${!hasPriority ? '🟢 ON' : '🔴 OFF'} for <@${member.id}>.`,
          ephemeral: true,
        });
        break;
      }

      case 'vc_toggle_stream': {
        const targetVC = voiceChannel || (guild.channels.cache.find(c => c.name === CONFIG.GUARD_VC_NAME) as VoiceChannel);
        if (!targetVC) {
          await interaction.reply({ content: '❌ Voice channel not found.', ephemeral: true });
          return;
        }
        const allowsStream = targetVC.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.Stream);
        await targetVC.permissionOverwrites.edit(guild.roles.everyone, { Stream: !allowsStream });
        await interaction.reply({ content: `🖥️ Video & Screenshare toggled ${!allowsStream ? '🟢 ON' : '🔴 OFF'} for @everyone.`, ephemeral: true });
        break;
      }

      case 'vc_toggle_soundboard': {
        const targetVC = voiceChannel || (guild.channels.cache.find(c => c.name === CONFIG.GUARD_VC_NAME) as VoiceChannel);
        if (!targetVC) {
          await interaction.reply({ content: '❌ Voice channel not found.', ephemeral: true });
          return;
        }
        const allowsSound = targetVC.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.UseSoundboard);
        await targetVC.permissionOverwrites.edit(guild.roles.everyone, { UseSoundboard: !allowsSound });
        await interaction.reply({ content: `📢 Soundboard toggled ${!allowsSound ? '🟢 ON' : '🔴 OFF'} for @everyone.`, ephemeral: true });
        break;
      }

      case 'vc_mute_bot': {
        const botMember = guild.members.me;
        if (!botMember || !botMember.voice.channel) {
          await interaction.reply({ content: '❌ Bot is not connected to voice.', ephemeral: true });
          return;
        }
        const isMuted = botMember.voice.serverMute;
        await botMember.voice.setMute(!isMuted);
        await interaction.reply({ content: `🤖 Bot voice state toggled to ${!isMuted ? 'Muted' : 'Unmuted'}.`, ephemeral: true });
        break;
      }

      case 'vc_purge_chat': {
        const textChannel = voiceChannel ? voiceChannel : (interaction.channel as any);
        if (textChannel && 'bulkDelete' in textChannel) {
          await textChannel.bulkDelete(20, true).catch(() => null);
          await interaction.reply({ content: '🧹 Purged recent voice text messages.', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ Cannot purge messages in this channel.', ephemeral: true });
        }
        break;
      }

      case 'vc_security_alert': {
        const result = await ModerationService.lockdownGuild(guild, 'Emergency Triggered via VC Console');
        await interaction.reply({ content: result.message, ephemeral: true });
        break;
      }

      case 'vc_status_info': {
        const targetVC = voiceChannel || (guild.channels.cache.find(c => c.name === CONFIG.GUARD_VC_NAME) as VoiceChannel);
        const count = targetVC ? targetVC.members.size : 0;
        const bitrate = targetVC ? targetVC.bitrate / 1000 : 0;
        const userLimit = targetVC ? (targetVC.userLimit === 0 ? 'Unlimited' : targetVC.userLimit) : 'N/A';

        const infoEmbed = new EmbedBuilder()
          .setTitle('📊 Voice Channel Stats')
          .setColor(0x14FA22)
          .addFields(
            { name: 'Channel', value: targetVC?.name || 'N/A', inline: true },
            { name: 'Connected', value: `${count} members`, inline: true },
            { name: 'Bitrate', value: `${bitrate} kbps`, inline: true },
            { name: 'User Limit', value: `${userLimit}`, inline: true },
            { name: 'Region', value: targetVC?.rtcRegion || 'Automatic', inline: true },
            { name: 'Screenshare', value: targetVC?.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.Stream) ? 'Enabled' : 'Disabled', inline: true }
          )
          .setFooter({ text: 'GUARD Security' })
          .setTimestamp();

        await interaction.reply({ embeds: [infoEmbed], ephemeral: true });
        break;
      }

      case 'vc_end_session': {
        if (!voiceChannel) {
          await interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
          return;
        }
        for (const [, m] of voiceChannel.members) {
          if (!m.user.bot) {
            await m.voice.disconnect('Session Ended by Owner').catch(() => null);
          }
        }
        await voiceChannel.permissionOverwrites.edit(guild.roles.everyone, { Connect: false });
        await interaction.reply({ content: '🛑 Session ended. All members disconnected and VC locked.', ephemeral: true });
        break;
      }

      default:
        break;
    }
  }

  /**
   * Handle modal submissions for VC controls
   */
  public static async handleModalSubmission(interaction: ModalSubmitInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!guild) return;

    if (interaction.customId === 'modal_vc_kick') {
      const rawInput = interaction.fields.getTextInputValue('kick_user_id').replace(/[<@!>]/g, '').trim();
      const targetMember = await guild.members.fetch(rawInput).catch(() => null);
      if (!targetMember || !targetMember.voice.channel) {
        await interaction.reply({ content: `❌ User <@${rawInput}> not found or not in a voice channel.`, ephemeral: true });
        return;
      }
      await targetMember.voice.disconnect('Kicked via VC Control Panel').catch(() => null);
      await interaction.reply({ content: `👢 Disconnected <@${targetMember.id}> from voice.`, ephemeral: true });
    } else if (interaction.customId === 'modal_vc_limit') {
      const rawLimit = parseInt(interaction.fields.getTextInputValue('user_limit_value').trim(), 10);
      if (isNaN(rawLimit) || rawLimit < 0 || rawLimit > 99) {
        await interaction.reply({ content: '❌ Invalid limit. Provide a number between 0 and 99.', ephemeral: true });
        return;
      }
      const member = await guild.members.fetch(interaction.user.id).catch(() => null);
      const voiceChannel = member?.voice.channel as VoiceChannel | null;
      if (!voiceChannel) {
        await interaction.reply({ content: '❌ You must be connected to a voice channel.', ephemeral: true });
        return;
      }
      await voiceChannel.setUserLimit(rawLimit);
      await interaction.reply({ content: `👥 Voice channel user limit set to **${rawLimit === 0 ? 'Unlimited' : rawLimit}**.`, ephemeral: true });
    } else if (interaction.customId === 'modal_vc_rename') {
      const newName = interaction.fields.getTextInputValue('channel_name_value').trim();
      const member = await guild.members.fetch(interaction.user.id).catch(() => null);
      const voiceChannel = member?.voice.channel as VoiceChannel | null;
      if (!voiceChannel) {
        await interaction.reply({ content: '❌ You must be connected to a voice channel.', ephemeral: true });
        return;
      }
      await voiceChannel.setName(newName);
      await interaction.reply({ content: `✏️ Voice channel renamed to **${newName}**.`, ephemeral: true });
    }
  }
}
