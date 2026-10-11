import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { updateGuildConfig } from '../db';

export const byebyeactivate = {
  data: new SlashCommandBuilder()
    .setName('byebyeactivate')
    .setDescription('Configure or activate the Twilight Goodbye Card channel and custom layout template')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Target channel to dispatch goodbye cards (defaults to current channel)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option
        .setName('template_image')
        .setDescription('Upload a template image/screenshot for the card layout background')
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
      ? `\n🎨 **Custom Template Applied:** \`${templateAttachment.name}\` cached as active theme background.`
      : '';

    await interaction.reply({
      content: `🌌 **GUARD PROTOCOL ACTIVATED**: Twilight Departure Cards will now be dispatched to <#${channel.id}>.${templateInfo}`,
    });
  },
};
