import { Message } from 'discord.js';
import { MasterCommandExecutor } from '../services/masterCommandExecutor';

export async function onMessageCreate(message: Message): Promise<void> {
  await MasterCommandExecutor.execute(message, message.client);
}
