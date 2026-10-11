# 🛡️ GUARD Enterprise Discord Security & SOC Bot

**GUARD** is a next-generation Enterprise Discord Security & SOC (Security Operations Center) Bot built with TypeScript, Discord.js v14, Prisma ORM (SQLite), and `@napi-rs/canvas`.

---

## ⚡ Core Architecture & Features

### 1. Target Server Provisioning
- **Category & Voice Channel:** On bot startup and guild join, GUARD automatically reconciles or creates category `𝖦𝖺𝗎𝗋𝖽 𝖲𝗉𝖺𝖼𝖾` and voice channel `𝖦𝖺𝗎𝗋𝖽 𝖵𝖼`.
- **24/7 Locked Connection:** Enforces `@everyone` (`ViewChannel: true`, `Connect: false`). The bot stays permanently connected to the channel.
- **Server Owner Exclusive Voice Control Panel:** Whenever the Server Owner or Master Owner joins the VC, GUARD automatically spawns an interactive console equipped with **20 Moderation & Control Buttons**:
  1. `🔇 Mute All` — Server-mutes all non-owners in VC.
  2. `🔊 Unmute All` — Server-unmutes all members in VC.
  3. `🔕 Deafen All` — Server-deafens all non-owners in VC.
  4. `🔔 Undeafen All` — Restores audio to all members.
  5. `🚪 Disconnect All` — Disconnects all non-owner members.
  6. `🔒 Lock VC` — Disables `@everyone` connection permissions.
  7. `🔓 Unlock VC` — Enables `@everyone` connection permissions.
  8. `👢 VC Ban / Kick` — Disconnects user via interactive modal.
  9. `🧲 VDrag All` — Mass moves members from other channels into current VC.
  10. `👥 Limit VC` — Modifies max participant count via modal.
  11. `✏️ Rename VC` — Updates channel name via modal.
  12. `📶 Boost Bitrate` — Cycles optimal audio bitrates (up to 384kbps).
  13. `🎙️ Priority Speaker` — Toggles priority audio permissions.
  14. `🖥️ Toggle Video` — Toggles screen share & video streaming perms.
  15. `📢 Toggle Sound` — Toggles soundboard perms for @everyone.
  16. `🤖 Mute Bot` — Toggles bot self-mute state in VC.
  17. `🧹 Purge VC Chat` — Bulk-deletes messages inside VC text chat.
  18. `🚨 Lockdown Guild` — Triggers emergency guild text freeze.
  19. `ℹ️ VC Diagnostics` — Displays live bitrate, RTC region, and participant metrics.
  20. `🛑 End Session` — Mass disconnects members and permanently locks the VC.

---

### 2. Master SOC Provisioning (`masterSocService.ts`)
- **Central Master Guild:** `1549116937567609035`
- **Dynamic Category:** `🌐・[Target Guild Name]`
- **4 Dedicated Private Channels:**
  - `#panel-[last4]` — Live telemetry dashboard with quick buttons (Emergency Lockdown, Refresh Status, Intel).
  - `#audit-logs` — Centralized security and member event stream.
  - `#bot-log` — Operational events (Guild join/leave, provisioning anomalies).
  - `#command` — Root CLI Terminal interface.
- **Startup Auto-Reconciliation:** Automatically creates and synchronizes missing categories/channels for all attached servers.

---

### 3. Master Command Terminal (`masterCommandExecutor.ts`)
Type directly inside `#command` in the Master Guild to remotely execute high-privilege operations:
```bash
serverclone              # Create snapshot of target server's channels & roles
lockdown [reason]        # Emergency text freeze on target server
unlockdown [reason]      # Lift text freeze on target server
kick <user> [reason]     # Remotely kick a member
ban <user> [reason]      # Remotely ban a member
unban <userId> [reason]  # Remotely unban a member
warn <user> <reason>     # Issue security warning to member
timeout <user> <m> [r]   # Remotely timeout a member
purge <count>            # Bulk-purge messages
security [on|off]        # Toggle Anti-Nuke and Anti-Raid shields
serverinfo               # Print real-time target server dossier
userinfo <user>          # Print identity and role dossier
giverole <user> <role>   # Grant or revoke role on target server
```

---

### 4. Slash Commands Suite

#### Setup & Activation
- `/welcomeactivate [channel]` — Designate channel for Cyberpunk Welcome Cards.
- `/byebyeactivate [channel]` — Designate channel for Twilight Departure Cards.
- `/auditlogactivate [channel]` — Designate channel for target server audit events.
- `/securitystatus` — Check status of Anti-Nuke, Anti-Raid, Lockdown, and SOC Link.

#### Moderation Suite
- `/ban <user> [reason] [delete_days]`
- `/unban <user_id> [reason]`
- `/kick <user> [reason]`
- `/timeout <user> <duration> [reason]`
- `/warn <user> <reason>`
- `/lockdown [reason]`
- `/unlockdown [reason]`

#### Info & Secret Help
- `/serverinfo` — Server stats, owner, security profile, channels & boost tier.
- `/userinfo [user]` — User profile, roles, permissions, account age.
- `/help` — Interactive command directory. **Strictly gates Super Owner overrides and Web Dashboard to `MASTER_OWNER_ID` (`1519909192373112923`) and Master Guild (`1549116937567609035`).**

#### Super Owner
- `/giverole <guild_id> <user_id> <role_id>` — Cross-guild role assignment strictly restricted to `MASTER_OWNER_ID`.

---

### 5. Dynamic Canvas Cards (`@napi-rs/canvas`)
- **Cyberpunk Welcome Card (800x400):**
  - Neon grid and glowing border accents.
  - Circular masked avatar with neon cyan & magenta halo.
  - Bold `"WELCOME"` typography with member counter badge.
- **Twilight Goodbye Card (800x400):**
  - Twilight sky gradient with starfield particle elements.
  - Circular masked avatar with violet/crimson aura.
  - Bold `"GOOD BYE"` typography with remaining member badge.

---

## 🛠️ Verification & Scripts

```bash
# Type check TypeScript code
npm run type-check

# Compile TypeScript into dist/
npm run build

# Run Vitest test suite
npm test

# Start the bot
npm start
```
