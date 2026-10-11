# 🛡️ GUARD Enterprise Discord Security & SOC Platform

**GUARD** is a world-class defensive security engine, real-time audit reconciliation matrix, and enterprise SOC (Security Operations Center) platform for Discord. Built from scratch with TypeScript, Discord.js v14, Prisma ORM (SQLite), and `@napi-rs/canvas`.

---

## ⚡ Core Upgraded Architecture

### 1. Target Guild Provisioning & 24/7 Voice Lock
- **Category at Position 0:** Automatically provisions or repositions category `"Guard Space"` directly to position `0`.
- **Dedicated Voice Channel:** Provisions `"Guard Vc"` with hardened permissions:
  - `@everyone`: `ViewChannel: true`, `Connect: false`, `Speak: false`
  - Bot & Server Owner: `ViewChannel: true`, `Connect: true`, `Speak: true`, `Administrator: true`
- **Persistent 24/7 Connection & Auto-Reconnect Loop:**
  - Continuous locked audio connection.
  - Automatic error recovery loop on disconnects or network disruptions with an active 15s background heartbeat monitor.
- **Server Owner Exclusive Voice Control Panel:** Spawns an interactive 20-button moderation console when the Server Owner or Super Owner joins the VC.

---

### 2. Military-Grade Defensive Security Engines (Sliding Window & Non-Blocking)
- **Anti-Nuke Sliding Window (10-Second Window):**
  - **Thresholds:**
    - `> 2` channels deleted within 10s
    - `> 3` roles modified/deleted within 10s
    - `> 3` members banned/kicked within 10s
  - **Quarantine Action:** Instantaneous permission strip (revokes administrative & management roles) and applies a 28-day timeout or ban on the offending actor.
  - **Restoration Queue:** Automatically reconstructs deleted channels and roles from cached database snapshots, restoring exact channel types, parents, topics, and permission overwrites.
- **Unauthorized Bot & Webhook Shield:**
  - **Rogue Bot Shield:** Automatically kicks or bans any non-whitelisted bot added by a non-owner, and quarantines the actor who invited it.
  - **Rogue Webhook Shield:** Detects webhooks created by unauthorized actors, immediately deletes the webhook, and quarantines the creator.
- **Threat & Phishing Filter:**
  - **Malware & Executable Blocker:** Automatically deletes messages with dangerous executable payloads (`.exe`, `.bat`, `.vbs`, `.scr`, `.jar`, `.ps1`, `.cmd`, `.msi`, `.pif`, `.com`, etc.) and mutes the sender.
  - **Phishing & Nitro Scam Scanner:** Regex and domain scanner intercepting typosquatting domains (e.g. `discorcl`, `dlscord`, `discorqd`, `discord-nitro`, `free-nitro`, etc.) and token-grabber signatures.
  - **URL Shortener Blocker:** Flags and intercepts obfuscated links (`bit.ly`, `tinyurl.com`, `is.gd`, `cutt.ly`, etc.).
- **Zero-Trust & Passcode Protection:**
  - Sensitive administrative modifications (guild vanity, server updates, role elevations) are restricted strictly to the Guild Owner and Master Owner.

---

### 3. Target Server Local Commands & Dynamic Customizer
- **`/welcomeactivate [template_image]`:**
  - Upload an image/screenshot template.
  - Extracts and caches the custom background layout into the database.
  - Generates custom 800x400 cyberpunk welcome cards on `guildMemberAdd`.
- **`/byebyeactivate [template_image]`:**
  - Upload a departure template.
  - Generates twilight goodbye cards with custom theme background on `guildMemberRemove`.
- **`/auditlogs <type: "audit logs" | "server logs" | "message logs">`:**
  - Routes specific telemetry streams to the current channel:
    - `"audit logs"`: Voice activity (joins, leaves, switches, moves, mutes, deafens).
    - `"server logs"`: Server mutations (roles created/deleted/updated, kicks, bans, timeouts).
    - `"message logs"`: Message mutations (message edits with before/after diffs, deletions).

---

### 4. Master SOC Centralized Infrastructure (Master Guild: `1549116937567609035`)
Under category `🌐・[Target Guild Name]`, GUARD provisions 4 dedicated private channels:

1. **`#server-status`:**
   - **Daily Cron Job (04:00 AM IST / 22:30 UTC):** Comprehensive 24h analytical breakdown of server vitals, security violations intercepted, population trends, and health score (0-100%).
   - Interactive quick buttons (Emergency Lockdown, Unlock, Refresh Vitals, Server Intel).
2. **`#audit-logs`:**
   - Full 11-category audit telemetry streaming:
     1. Guild Updates
     2. Channel Mutation
     3. Role Hierarchy
     4. Member Logs
     5. Message Diffs
     6. Voice Actions
     7. Threads
     8. Webhook/Integrations
     9. AutoMod Triggers
     10. Invites/Events
     11. Custom Assets
3. **`#bot-log`:**
   - Dedicated stream for GUARD bot operations (join/leave dates, role/permission modifications, heartbeat ping spikes > 250ms, voice reconnection events).
4. **`#command`:**
   - Super Owner CLI Terminal and Slash command `/giverole user:<userId> role:<roleId>` to remotely assign roles in the target guild (strictly gated to `MASTER_OWNER_ID`: `1519909192373112923`).
   - Supported CLI Commands:
     `serverclone`, `lockdown`, `unlockdown`, `kick`, `ban`, `unban`, `warn`, `timeout`, `purge`, `security`, `serverinfo`, `userinfo`, `giverole`.

---

## 🛠️ Verification & Test Suite

```bash
# Type check TypeScript codebase
npm run type-check

# Compile to production bundle in dist/
npm run build

# Run comprehensive test suite
npm test
```
