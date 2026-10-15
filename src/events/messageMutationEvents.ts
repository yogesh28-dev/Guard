import { Message, PartialMessage, EmbedBuilder } from 'discord.js';
import { SecurityShieldService } from '../services/securityShieldService';
import { MasterSocService } from '../services/masterSocService';
import { CONFIG } from '../config';

export async function onMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage
): Promise<void> {
  if (newMessage.partial) {
    try {
      await newMessage.fetch();
    } catch {
      return;
    }
  }

  const msg = newMessage as Message;
  if (msg.author?.bot || !msg.guild) return;

  // 1. Re-scan edited content with Threat & Phishing Filter
  const intercepted = await SecurityShieldService.inspectMessage(msg);
  if (intercepted) return;

  // 2. Telemetry Diff Log
  const oldContent = oldMessage.content || '[Unknown / Cached Content Missing]';
  const newContent = msg.content || '[Empty Content]';

  if (oldContent === newContent) return;

  const embed = new EmbedBuilder()
    .setTitle('📝 MESSAGE EDITED')
    .setColor(CONFIG.THEME_COLOR)
    .setDescription(
      `Message by <@${msg.author.id}> edited in <#${msg.channel.id}>.\n` +
      `[Jump to Message](${msg.url})`
    )
    .addFields(
      {
        name: '🔴 Before Diff',
        value: oldContent.length > 500 ? oldContent.slice(0, 497) + '...' : oldContent,
        inline: false,
      },
      {
        name: '🟢 After Diff',
        value: newContent.length > 500 ? newContent.slice(0, 497) + '...' : newContent,
        inline: false,
      }
    )
    .setFooter({ text: `Author ID: ${msg.author.id} | Message ID: ${msg.id}` })
    .setTimestamp();

  await MasterSocService.logAuditTelemetry(msg.client, msg.guild.id, 'MESSAGE_DIFFS', embed);
}

export async function onMessageDelete(message: Message | PartialMessage): Promise<void> {
  if (!message.guild || message.author?.bot) return;

  const content = message.content || '[Unknown Content or Embed/Attachment Only]';
  const authorTag = message.author ? message.author.tag : 'Unknown User';
  const authorId = message.author ? message.author.id : 'Unknown ID';

  const embed = new EmbedBuilder()
    .setTitle('🗑️ MESSAGE DELETED')
    .setColor(CONFIG.DANGER_COLOR)
    .setDescription(`A message in <#${message.channel.id}> was deleted.`)
    .addFields(
      { name: 'Author', value: `${authorTag} (<@${authorId}>)`, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      {
        name: 'Content',
        value: content.length > 800 ? content.slice(0, 797) + '...' : content,
        inline: false,
      }
    )
    .setFooter({ text: `Message ID: ${message.id}` })
    .setTimestamp();

  await MasterSocService.logAuditTelemetry(message.client, message.guild.id, 'MESSAGE_DIFFS', embed);
}
