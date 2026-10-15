import { Interaction } from 'discord.js';
import { commandCollection, GROUP_A_COMMAND_NAMES, GROUP_B_COMMAND_NAMES } from '../commands';
import { TargetProvisioningService } from '../services/targetProvisioningService';
import { MasterSocService } from '../services/masterSocService';
import { CONFIG, isMasterOwner } from '../config';

export async function onInteractionCreate(interaction: Interaction): Promise<void> {
  try {
    // 1. Slash Command Handling
    if (interaction.isChatInputCommand()) {
      const command = commandCollection.get(interaction.commandName);
      if (!command) {
        console.warn(`[COMMAND UNKNOWN] No handler for /${interaction.commandName}`);
        if (interaction.isRepliable()) {
          await interaction.reply({
            content: '⛔ This command is disabled or unrecognized.',
            ephemeral: true,
          }).catch(() => null);
        }
        return;
      }

      // Group B: Super Owner ONLY (/giverole, /syncall)
      if (GROUP_B_COMMAND_NAMES.includes(interaction.commandName)) {
        if (!isMasterOwner(interaction.user.id)) {
          await interaction.reply({
            content: '⛔ **Access Denied**: This command is strictly restricted to the Super Owner (MASTER_OWNER_ID).',
            ephemeral: true,
          });
          return;
        }

        if (interaction.guildId !== CONFIG.MASTER_GUILD_ID) {
          await interaction.reply({
            content: `⛔ **Access Denied**: This command can only be executed inside the Master Guild (\`${CONFIG.MASTER_GUILD_ID}\`).`,
            ephemeral: true,
          });
          return;
        }

        const channelName = (interaction.channel as any)?.name?.toLowerCase();
        const channelTopic = (interaction.channel as any)?.topic;
        const isCommandChannel = channelName === 'command' || channelName?.includes('command') || channelTopic?.includes(':COMMAND');
        if (!isCommandChannel) {
          await interaction.reply({
            content: '⛔ **Access Denied**: This command can only be executed strictly inside a `#command` channel.',
            ephemeral: true,
          });
          return;
        }

        await command.execute(interaction);
        return;
      }

      // Public Commands: Accessible to all members and users (/help, /about)
      if (interaction.commandName === 'about' || interaction.commandName === 'help') {
        await command.execute(interaction);
        return;
      }

      // Group A: Server Owner & Super Owner Access
      if (GROUP_A_COMMAND_NAMES.includes(interaction.commandName)) {
        let ownerId = interaction.guild?.ownerId;
        if (!ownerId && interaction.guild) {
          const fetchedGuild = await interaction.guild.fetch().catch(() => null);
          ownerId = fetchedGuild?.ownerId;
        }

        const isServerOwner = !!ownerId && interaction.user.id === ownerId;
        const isSuperOwner = isMasterOwner(interaction.user.id);

        if (!isServerOwner && !isSuperOwner) {
          await interaction.reply({
            content: '⛔ This command is strictly reserved for the Server Owner.',
            ephemeral: true,
          });
          return;
        }

        await command.execute(interaction);
        return;
      }

      // Unrecognized or disabled command
      await interaction.reply({
        content: '⛔ This command is disabled or unrecognized.',
        ephemeral: true,
      });
      return;
    }

    // 2. Button Interactions
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('vc_')) {
        await TargetProvisioningService.handleButtonInteraction(interaction);
        return;
      }

      if (interaction.customId.startsWith('soc_')) {
        await MasterSocService.handleSocButton(interaction, interaction.client);
        return;
      }
    }

    // 3. Modal Submissions
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('modal_vc_')) {
        await TargetProvisioningService.handleModalSubmission(interaction);
        return;
      }
    }
  } catch (error: any) {
    console.error(`[INTERACTION ERROR]:`, error);
    if (interaction.isRepliable() && !interaction.replied) {
      if (interaction.deferred) {
        await interaction.editReply({
          content: `⚠️ An error occurred while executing this action: ${error?.message || error}`,
        }).catch(() => null);
      } else {
        await interaction.reply({
          content: `⚠️ An error occurred while executing this action: ${error?.message || error}`,
          ephemeral: true,
        }).catch(() => null);
      }
    }
  }
}
