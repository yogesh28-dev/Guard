import { Interaction } from 'discord.js';
import { commandCollection } from '../commands';
import { TargetProvisioningService } from '../services/targetProvisioningService';
import { MasterSocService } from '../services/masterSocService';

export async function onInteractionCreate(interaction: Interaction): Promise<void> {
  try {
    // 1. Slash Command Handling
    if (interaction.isChatInputCommand()) {
      const command = commandCollection.get(interaction.commandName);
      if (!command) {
        console.warn(`[COMMAND UNKNOWN] No handler for /${interaction.commandName}`);
        return;
      }
      await command.execute(interaction);
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
