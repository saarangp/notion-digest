# Notion Task Digest with Discord Bot + Webhook

Deterministic daily digest still runs exactly as before (same scoring, buckets, Top 3).
You can now also run a Discord bot for evening interactive actions.

## Features

- Deterministic Notion digest engine (unchanged logic)
- Webhook delivery (Discord/Slack) for scheduled digest
- Discord bot commands for evening actions:
  - `/digest` (show digest anytime)
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

### Run Bot 24/7 Locally (PM2)

Use PM2 if you want the bot to keep running after closing the terminal.

Install PM2:

```bash
npm install -g pm2
```

Start bot with environment from your shell / `.env`:

```bash
cd /Users/saarang/Documents/Personal/notion-digest
APP_MODE=bot pm2 start src/index.js --name notion-bot --interpreter node --update-env
```

Persist across reboots:

```bash
pm2 save
pm2 startup
```

`pm2 startup` prints a command. Run that one-time command.

Useful PM2 commands:

```bash
pm2 status
pm2 logs notion-bot --lines 100
pm2 restart notion-bot --update-env
pm2 stop notion-bot
pm2 delete notion-bot
pm2 save
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
