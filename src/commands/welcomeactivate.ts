import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
} from 'discord.js';
import { updateGuildConfig } from '../db';

export const welcomeactivate = {
  data: new SlashCommandBuilder()
    .setName('welcomeactivate')
    .setDescription('Set the channel for welcome cards')
    .setDefaultMemberPermissions(0n)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to send welcome cards to (defaults to this channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option
        .setName('template_image')
        .setDescription('Optional custom background image for the card')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;

    const channel = interaction.options.getChannel('channel') || interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: '❌ Invalid channel selected. Please choose a valid text channel.',
        ephemeral: true,
      });
      return;
    }

    const templateAttachment = interaction.options.getAttachment('template_image');
    const updateData: any = {
      welcomeChannelId: channel.id,
    };

    if (templateAttachment) {
      updateData.welcomeTemplateUrl = templateAttachment.url;
      updateData.welcomeTheme = 'CUSTOM_TEMPLATE';
    }

    await updateGuildConfig(interaction.guildId, updateData);

    const templateInfo = templateAttachment
      ? `\n🎨 Custom background: \`${templateAttachment.name}\``
      : '';

    await interaction.reply({
      content: `✅ Welcome cards will now be sent to <#${channel.id}>.${templateInfo}`,
    });
  },
};
