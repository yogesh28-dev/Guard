import { Message } from 'discord.js';
import { MasterCommandExecutor } from '../services/masterCommandExecutor';
import { SecurityShieldService } from '../services/securityShieldService';

export async function onMessageCreate(message: Message): Promise<void> {
  // 1. Automated Honeypot Trap Check
  const isHoneypot = await SecurityShieldService.inspectHoneypotMessage(message);
  if (isHoneypot) return;

  // 2. Military-grade Threat, Phishing, Anti-Flood & Mass-Mention Filter
  const intercepted = await SecurityShieldService.inspectMessage(message);
  if (intercepted) return;

  // 3. Master SOC #command CLI Terminal execution
  await MasterCommandExecutor.execute(message, message.client);
}
