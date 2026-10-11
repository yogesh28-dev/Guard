import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { updateGuildConfig } from '../db';

export const welcomeactivate = {
  data: new SlashCommandBuilder()
    .setName('welcomeactivate')
    .setDescription('Configure or activate the Cyberpunk Welcome Card channel and custom layout template')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Target channel to dispatch welcome cards (defaults to current channel)')
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
      welcomeChannelId: channel.id,
    };

    if (templateAttachment) {
      updateData.welcomeTemplateUrl = templateAttachment.url;
      updateData.welcomeTheme = 'CUSTOM_TEMPLATE';
    }

    await updateGuildConfig(interaction.guildId, updateData);

    const templateInfo = templateAttachment
      ? `\n🎨 **Custom Template Applied:** \`${templateAttachment.name}\` cached as active theme background.`
      : '';

    await interaction.reply({
      content: `⚡ **GUARD PROTOCOL ACTIVATED**: Cyberpunk Welcome Cards will now be dispatched to <#${channel.id}>.${templateInfo}`,
    });
  },
};
