import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || 'MTU0ODc2NjM1OTAyMDg5NjM5Nw.GIX0Fy.wKEvzjISa8gLLMkiI-hbVoBdhz8Ukug8majcw8',
  MASTER_GUILD_ID: process.env.MASTER_GUILD_ID || '1549116937567609035',
  MASTER_OWNER_ID: process.env.MASTER_OWNER_ID || '1519909192373112923',
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  GUARD_CATEGORY_NAME: '𝖦𝖺𝗎𝗋𝖽 𝖲𝗉𝖺𝖼𝖾',
  GUARD_VC_NAME: '𝖦𝖺𝗎𝗋𝖽 𝖵𝖼',
  THEME_COLOR: 0x5865f2,
  SUCCESS_COLOR: 0x00ffaa,
  DANGER_COLOR: 0xff0055,
  WARN_COLOR: 0xffaa00,
  CYBERPUNK_PURPLE: 0x9b5de5,
  CYBERPUNK_CYAN: 0x00f0ff,
};

export function isMasterOwner(userId: string): boolean {
  return userId === CONFIG.MASTER_OWNER_ID;
}

export function isMasterGuild(guildId: string | null | undefined): boolean {
  return guildId === CONFIG.MASTER_GUILD_ID;
}
