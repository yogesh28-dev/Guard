import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { CONFIG, isMasterOwner, isMasterGuild } from '../config';

export const help = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View all available commands and how to use them')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2]),

  async execute(interaction: ChatInputCommandInteraction) {
    const isOwner = isMasterOwner(interaction.user.id);
    const inMasterGuild = isMasterGuild(interaction.guildId);
    const isAuthorizedRoot = isOwner && inMasterGuild;

    const embed = new EmbedBuilder()
      .setTitle('🛡️ GUARD // Commands')
      .setColor(isAuthorizedRoot ? CONFIG.CYBERPUNK_PURPLE : CONFIG.CYBERPUNK_CYAN)
      .setDescription(
        'Here are the commands you can use with **GUARD** on this server.'
      )
      .addFields(
        {
          name: '⚙️ Server Setup',
          value:
            '`/welcomeactivate [channel]` — Set up the welcome card channel\n' +
            '`/byebyeactivate [channel]` — Set up the goodbye card channel\n' +
            '`/auditlogs <type>` — Choose channels for voice, server, or message logs',
          inline: false,
        },
        {
          name: '⚖️ Moderation',
          value:
            '`/ban <user> [reason] [delete_days]` — Ban a user and delete recent messages\n' +
            '`/unban <user_id> [reason]` — Unban a user using their ID\n' +
            '`/kick <user> [reason]` — Kick a member from the server\n' +
            '`/timeout <user> <duration> [reason]` — Mute a member for a set time (e.g. 10m, 1h)\n' +
            '`/warn <user> <reason>` — Issue a warning to a member\n' +
            '`/lockdown [reason]` — Lock text channels to stop new messages\n' +
            '`/unlockdown [reason]` — Unlock text channels back to normal',
          inline: false,
        },
        {
          name: '📊 Information',
          value:
            '`/serverinfo` — View stats, roles, and settings for this server\n' +
            '`/userinfo [user]` — View profile info, join date, and roles for a member\n' +
            '`/about` — Learn about GUARD and get the bot invite link\n' +
            '`/help` — Show this list of commands',
          inline: false,
        },
        {
          name: '🎙️ Voice Controls',
          value:
            '• Sets up a private owner voice room (`𝖦𝖺𝗎𝗋𝖽 𝖲𝗉𝖺𝖼𝖾` / `𝖦𝖺𝗎𝗋𝖽 𝖵𝖼`)\n' +
            '• Spawns an interactive 20-button moderation panel when the owner joins',
          inline: false,
        }
      );

    if (isAuthorizedRoot || (isOwner && !inMasterGuild)) {
      embed.addFields({
        name: '👑 Owner Controls',
        value:
          '• **Sync Servers**: `/syncall` (Refresh all server settings and channels)\n' +
          '• **Give Role**: `/giverole user:<id> role:<id>`\n' +
          '• **Terminal Commands** (`#command`): `ban`, `unban`, `kick`, `timeout`, `warn`, `lockdown`, `unlockdown`, `purge`, `serverinfo`, `userinfo`, `giverole`, `syncall`',
        inline: false,
      });
    }

    embed.setFooter({
      text: 'GUARD Security • Type /help for assistance',
    });
    embed.setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: !isAuthorizedRoot });
  },
};
