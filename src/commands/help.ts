import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import { CONFIG, isMasterOwner, isMasterGuild } from '../config';

export const help = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Display documentation of GUARD Security commands and operational directives'),

  async execute(interaction: ChatInputCommandInteraction) {
    const isOwner = isMasterOwner(interaction.user.id);
    const inMasterGuild = isMasterGuild(interaction.guildId);
    const isAuthorizedRoot = isOwner && inMasterGuild;

    const embed = new EmbedBuilder()
      .setTitle('🛡️ GUARD ENTERPRISE // SECURITY & DEFENSE DIRECTORY')
      .setColor(isAuthorizedRoot ? CONFIG.CYBERPUNK_PURPLE : CONFIG.CYBERPUNK_CYAN)
      .setDescription(
        `**GUARD Enterprise SOC** is an automated defense grid, audit reconciliation engine, and voice security infrastructure.\n` +
        `Framework: Discord.js v14 | Engine: TypeScript | Database: SQLite Prisma Client`
      )
      .addFields(
        {
          name: '⚙️ Configuration & Activation Suite',
          value:
            '`/welcomeactivate [channel]` — Deploy Cyberpunk Welcome Card dispatcher\n' +
            '`/byebyeactivate [channel]` — Deploy Twilight Goodbye Card dispatcher\n' +
            '`/auditlogactivate [channel]` — Designate target server audit log channel\n' +
            '`/securitystatus` — Check shields (Anti-Nuke, Anti-Raid, Lockdown, SOC Link)',
          inline: false,
        },
        {
          name: '⚖️ Moderation & Enforcement Suite',
          value:
            '`/ban <user> [reason] [delete_days]` — Ban user & purge messages\n' +
            '`/unban <user_id> [reason]` — Revoke ban for specified user ID\n' +
            '`/kick <user> [reason]` — Kick member from server\n' +
            '`/timeout <user> <duration> [reason]` — Temporary communication timeout\n' +
            '`/warn <user> <reason>` — Issue formal security warning\n' +
            '`/lockdown [reason]` — Emergency freeze on text channels\n' +
            '`/unlockdown [reason]` — Restore standard channel permissions',
          inline: false,
        },
        {
          name: '📊 Intelligence & Diagnostics',
          value:
            '`/serverinfo` — Comprehensive guild telemetry & security profile\n' +
            '`/userinfo [user]` — Identity dossier & permissions report\n' +
            '`/help` — Interactive command directory',
          inline: false,
        },
        {
          name: '🎙️ Autonomous Voice Security Grid',
          value:
            '• Auto-provisions category `𝖦𝖺𝗎𝗋𝖽 𝖲𝗉𝖺𝖼𝖾` & channel `𝖦𝖺𝗎𝗋𝖽 𝖵𝖼`\n' +
            '• 24/7 Locked Connection (`@everyone` view=true, connect=false)\n' +
            '• Interactive 20-Button Moderation Console for the Server Owner',
          inline: false,
        }
      );

    if (isAuthorizedRoot || (isOwner && !inMasterGuild)) {
      embed.addFields({
        name: '👑 [CLASSIFIED] SUPER OWNER & MASTER SOC DIRECTORY',
        value:
          '**Master SOC Hierarchy (Guild: `' + CONFIG.MASTER_GUILD_ID + '`):**\n' +
          '• Category `🌐・[Guild Name]` with 4 dedicated private channels:\n' +
          '  `#panel-[last4]`, `#audit-logs`, `#bot-log`, `#command` (CLI Terminal)\n' +
          '• Remote Role Assignment: `/giverole <guild_id> <user_id> <role_id>`\n' +
          '• **CLI Terminal Commands** (`#command`):\n' +
          '  `serverclone`, `lockdown`, `unlockdown`, `kick`, `ban`, `unban`, `warn`,\n' +
          '  `timeout`, `purge`, `security`, `serverinfo`, `userinfo`, `giverole`\n' +
          '• **Web SOC Security Dashboard**: `https://guard-soc.internal/dashboard` (Root Token: `MASTER_KEY_AUTH`)',
        inline: false,
      });
    }

    embed.setFooter({
      text: isAuthorizedRoot
        ? 'GUARD SOC ROOT AUTHORIZATION ACTIVE'
        : 'GUARD Enterprise Defense Engine v1.0',
    });
    embed.setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: !isAuthorizedRoot });
  },
};
