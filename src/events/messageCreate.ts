import { Message } from 'discord.js';
import { MasterCommandExecutor } from '../services/masterCommandExecutor';
import { SecurityShieldService } from '../services/securityShieldService';

export async function onMessageCreate(message: Message): Promise<void> {
  // 1. Military-grade Threat & Phishing Filter
  const intercepted = await SecurityShieldService.inspectMessage(message);
  if (intercepted) return;

  // 2. Master SOC #command CLI Terminal execution
  await MasterCommandExecutor.execute(message, message.client);
}
