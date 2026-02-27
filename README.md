# Notion Task Digest with Discord Bot + Webhook

Deterministic daily digest still runs exactly as before (same scoring, buckets, Top 3).
You can now also run a Discord bot for evening interactive actions.

## Features

- Deterministic Notion digest engine (unchanged logic)
- Webhook delivery (Discord/Slack) for scheduled digest
- Discord bot commands for evening actions:
  - `/evening` (summary + action buttons)
  - `/reschedule` (select task -> date -> confirm)
  - `/defer` (select task -> +days -> confirm)
  - `/done` (select task -> confirm)
- Safe confirmation before any Notion mutation
- Minimal persisted pending state in `logs/discord-bot-state.json`

## Runtime Modes

Use `APP_MODE`:

- `digest`: webhook digest only (default)
- `bot`: Discord bot only
- `both`: run digest first, then keep bot running

`MODE` still controls digest scope:

- `morning`
- `evening`
- `both`

## Quick Start

```bash
cd /Users/saarang/Documents/Personal/notion-digest
cp .env.example .env
npm install
npm run dry-run
```

## Discord Bot Setup (Guild-Only)

Guild-only means command registration is limited to one server (your private server), and updates appear quickly.

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create an app -> create a bot
3. Copy values:
   - Bot token -> `DISCORD_BOT_TOKEN`
   - Application ID -> `DISCORD_APP_ID`
4. Enable bot scopes/permissions when inviting bot to your server:
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: `Send Messages`, `Use Application Commands`
5. Get your server ID (enable Developer Mode in Discord -> right-click server -> Copy Server ID) -> `DISCORD_GUILD_ID`
6. Set:
   - `APP_MODE=bot` (or `both`)
   - `DISCORD_BOT_TOKEN=...`
   - `DISCORD_APP_ID=...`
   - `DISCORD_GUILD_ID=...`

Run bot:

```bash
npm run bot
```

## Webhook Setup (Transition-Compatible)

Webhook path still works unchanged.

- `NOTIFIER=discord` + `DISCORD_WEBHOOK_URL=...`
- or `NOTIFIER=slack` + `SLACK_WEBHOOK_URL=...`

Run webhook digest:

```bash
npm run digest
npm run morning
npm run evening
```

## Suggested Migration

1. Keep existing schedule using `APP_MODE=digest`
2. Start bot separately with `APP_MODE=bot`
3. Use bot evening actions for a few days
4. Optionally move to `APP_MODE=both` where needed

## New Environment Variables

- `APP_MODE=digest`
- `DISCORD_BOT_TOKEN=`
- `DISCORD_APP_ID=`
- `DISCORD_GUILD_ID=`
- `DISCORD_BOT_STATE_PATH=logs/discord-bot-state.json`
- `DISCORD_INTERACTION_TTL_MINUTES=30`
- `DISCORD_MAX_ACTION_TASKS=10`

Existing env vars stay the same, including Notion schema vars and webhook vars.

## Tests

```bash
npm test
```

Current tests cover core action handler logic for:

- done
- reschedule
- defer
- pending action TTL creation
