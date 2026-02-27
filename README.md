# Notion Digest + Discord Action Bot

Deterministic daily task digest from Notion, with optional Google Calendar capacity checks and a Discord bot for interactive task actions.

## What This Project Does

- Pulls relevant tasks from Notion (due-window + overdue)
- Scores and ranks tasks deterministically
- Builds compact digest output:
  - Overdue
  - Due today
  - Due soon
  - Top 3
  - Capacity
  - Suggested defer (if constrained)
- Delivers digest to Discord or Slack webhooks
- Supports a Discord slash-command bot:
  - `/digest` (anytime digest)
  - `/evening` (interactive evening sweep)
  - `/reschedule`, `/defer`, `/done`
- Optional Gemini AI layer for morning and `/digest`:
  - Suggested order
  - Start now (90m)
  - If constrained fallback

## Architecture

- `src/digestService.js`: Notion ingest, scoring, ranking, capacity, AI plan/summary, digest rendering
- `src/discordBotService.js`: slash commands, embeds, action flows, confirm/cancel safety
- `src/botActions.js`: action validation + Notion property update payloads
- `src/botStateStore.js`: pending action persistence/TTL
- `src/config.js`: env parsing/defaults
- `.github/workflows/notion-digest.yml`: scheduled digest automation

## Runtime Modes

Set `APP_MODE`:

- `digest`: run digest webhook flow and exit
- `bot`: run Discord bot only
- `both`: run digest flow, then keep bot running

Set `MODE` for digest scope:

- `morning`
- `evening`
- `both`

## Quick Start

```bash
cd /Users/saarang/Documents/Personal/notion-digest
cp .env.example .env
npm install
DRY_RUN=1 MODE=morning node src/index.js
```

## Environment Setup

### Required Core

- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`

### Webhook Delivery

- `NOTIFIER=discord` with `DISCORD_WEBHOOK_URL`
- or `NOTIFIER=slack` with `SLACK_WEBHOOK_URL`

### Discord Bot

- `APP_MODE=bot` (or `both`)
- `DISCORD_BOT_TOKEN`
- `DISCORD_APP_ID`
- `DISCORD_GUILD_ID`
- Optional:
  - `DISCORD_BOT_STATE_PATH` (default `logs/discord-bot-state.json`)
  - `DISCORD_INTERACTION_TTL_MINUTES` (default `30`)
  - `DISCORD_MAX_ACTION_TASKS` (default `10`)

### Google Calendar Capacity (optional, read-only)

- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_CALENDAR_ID`
- Optional:
  - `WORKDAY_START_HOUR`
  - `WORKDAY_END_HOUR`
  - `FOCUS_BUFFER_MINUTES`

### Gemini AI (optional)

- `ENABLE_AI_SUMMARY=1`
- `GEMINI_API_KEY`
- Optional:
  - `GEMINI_MODEL` (default from config)
  - `AI_SUMMARY_WINDOW_DAYS`
  - `AI_SUMMARY_MAX_TASKS`

AI is guarded:
- If disabled/missing key, digest still works (no AI sections).
- AI plan currently applies to morning-style digest flows (including `/digest`), not evening sweep.

## Running Locally

### Digest only

```bash
npm run morning
npm run evening
npm run digest
```

### Bot only

```bash
npm run bot
```

### Both

```bash
npm run both
```

## Day in the Life

### 1. Scheduled morning webhook digest

- GitHub Actions triggers hourly.
- App sends only at your configured local morning hour (`MORNING_HOUR_LOCAL`).
- Digest posts to your configured webhook (`DISCORD_WEBHOOK_URL` or `SLACK_WEBHOOK_URL`).

### 2. Manual `/digest` check-in

- Bot is running in `APP_MODE=bot`.
- You run `/digest` in Discord anytime.
- Bot returns the morning-style digest embed, including AI plan sections when enabled.

### 3. Evening `/evening` triage with confirm flow

- You run `/evening` in Discord.
- Review the evening sweep embed.
- Choose an action (`Do Nothing`, `Reschedule`, `Defer`, `Mark Done`).
- For mutating actions:
  - select task
  - provide details if needed (date or defer days)
  - press `Confirm`
- Only confirmed actions write to Notion.

## Discord Bot Commands

- `/digest`: anytime digest embed
- `/evening`: evening sweep embed + action buttons
- `/reschedule`: select task -> date modal -> confirm
- `/defer`: select task -> +days -> confirm
- `/done`: select task -> confirm

Evening buttons:
- `Do Nothing`
- `Reschedule`
- `Defer`
- `Mark Done`

All Notion mutations require explicit confirmation.

## Dry Run Behavior

`DRY_RUN=1`:
- Digest mode: logs payload instead of posting webhook
- Bot action confirms: logs intended Notion mutation and returns `(DRY_RUN)`

Example:

```bash
DRY_RUN=1 MODE=morning node src/index.js
```

AI debug in dry-run:

```bash
DRY_RUN=1 MODE=morning node src/index.js 2>&1 | rg "AI_DEBUG|Gemini .*skipped|DRY_RUN enabled"
```

## Scheduling (GitHub Actions)

Workflow: [`.github/workflows/notion-digest.yml`](.github/workflows/notion-digest.yml)

Current behavior:
- Workflow runs hourly.
- App-level local-hour guard sends only at:
  - `MORNING_HOUR_LOCAL` (default `9`)
  - `EVENING_HOUR_LOCAL` (default `19`)
- Timezone from `TIMEZONE` (default `America/Los_Angeles`)
- This keeps scheduling DST-safe.

Important:
- Keep scheduled workflow in `APP_MODE=digest`.
- Do not run long-lived bot in GitHub Actions schedules.

## Syncing GitHub Actions Secrets/Variables

Use script:

```bash
./scripts/sync_github_actions_from_env.sh
```

Or target a specific repo:

```bash
./scripts/sync_github_actions_from_env.sh owner/repo .env
```

Script only syncs allowlisted keys from `.env`:
- secrets via `gh secret set`
- variables via `gh variable set`

## Run Bot 24/7 Locally (PM2)

Install PM2:

```bash
npm install -g pm2
```

Start:

```bash
cd /Users/saarang/Documents/Personal/notion-digest
APP_MODE=bot pm2 start src/index.js --name notion-bot --interpreter node --update-env
```

Persist across reboots:

```bash
pm2 save
pm2 startup
```

Use:

```bash
pm2 status
pm2 logs notion-bot --lines 100
pm2 restart notion-bot --update-env
pm2 stop notion-bot
pm2 delete notion-bot
pm2 save
```

## Common Troubleshooting

### `DiscordAPIError[50001]: Missing Access`

Bot is not properly invited or wrong guild ID.
- Invite with scopes: `bot`, `applications.commands`
- Set correct `DISCORD_GUILD_ID`

### `DiscordAPIError[10062]: Unknown interaction`

Interaction timed out or stale token. Restart bot and retry action flow.

### AI section missing

Check:
- `ENABLE_AI_SUMMARY=1`
- valid `GEMINI_API_KEY`
- model/quotas not failing (`Gemini ... skipped` logs)

### No Discord message after dry-run command

Expected if running digest dry-run: output is logged, not posted.

## Tests

```bash
npm test
```

Current test coverage includes:
- done action mapping
- reschedule action mapping
- defer action mapping
- pending-action TTL creation
