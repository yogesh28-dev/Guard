import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
} from 'discord.js';
import { updateGuildConfig } from '../db';

export const byebyeactivate = {
  data: new SlashCommandBuilder()
    .setName('byebyeactivate')
    .setDescription('Set the channel for goodbye cards')
    .setDefaultMemberPermissions(0n)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Channel to send goodbye cards to (defaults to this channel)')
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
      byeChannelId: channel.id,
    };

    if (templateAttachment) {
      updateData.byeTemplateUrl = templateAttachment.url;
      updateData.byeTheme = 'CUSTOM_TEMPLATE';
    }

    await updateGuildConfig(interaction.guildId, updateData);

    const templateInfo = templateAttachment
      ? `\n🎨 Custom background: \`${templateAttachment.name}\``
      : '';

    await interaction.reply({
      content: `✅ Goodbye cards will now be sent to <#${channel.id}>.${templateInfo}`,
    });
  },
};
