import {
  Client,
  GatewayIntentBits,
  Partials,
} from 'discord.js';
import { CONFIG } from './config';
import { onReady } from './events/ready';
import { onGuildCreate } from './events/guildCreate';
import { onVoiceStateUpdate } from './events/voiceStateUpdate';
import { onGuildMemberAdd } from './events/guildMemberAdd';
import { onGuildMemberRemove } from './events/guildMemberRemove';
import { onInteractionCreate } from './events/interactionCreate';
import { onMessageCreate } from './events/messageCreate';
import { onChannelDelete, onChannelCreate, onChannelUpdate } from './events/channelEvents';
import { onRoleDelete, onRoleCreate, onRoleUpdate } from './events/roleEvents';
import { onMessageUpdate, onMessageDelete } from './events/messageMutationEvents';
import { onGuildBanAdd, onWebhooksUpdate, onGuildUpdate } from './events/guildSecurityEvents';

export function createBotClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildBans,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildWebhooks,
      GatewayIntentBits.GuildIntegrations,
    ],
    partials: [
      Partials.GuildMember,
      Partials.User,
      Partials.Message,
      Partials.Channel,
    ],
  });

  client.once('ready', () => onReady(client));
  client.on('guildCreate', onGuildCreate);
  client.on('voiceStateUpdate', onVoiceStateUpdate);
  client.on('guildMemberAdd', onGuildMemberAdd);
  client.on('guildMemberRemove', onGuildMemberRemove);
  client.on('interactionCreate', onInteractionCreate);
  client.on('messageCreate', onMessageCreate);

  // Security Engines & Audit Telemetry Events
  client.on('channelDelete', onChannelDelete);
  client.on('channelCreate', onChannelCreate);
  client.on('channelUpdate', onChannelUpdate);
  client.on('roleDelete', onRoleDelete);
  client.on('roleCreate', onRoleCreate);
  client.on('roleUpdate', onRoleUpdate);
  client.on('messageUpdate', onMessageUpdate);
  client.on('messageDelete', onMessageDelete);
  client.on('guildBanAdd', onGuildBanAdd);
  client.on('webhookUpdate', onWebhooksUpdate);
  client.on('guildUpdate', onGuildUpdate);

  return client;
}

// Auto-start when executed directly
if (require.main === module || process.env.NODE_ENV !== 'test') {
  const client = createBotClient();
  client.login(CONFIG.DISCORD_TOKEN).catch(err => {
    console.error('[GUARD LAUNCH ERROR] Failed to connect to Discord Gateway:', err);
  });
}
