# Copilot Instructions

## Project Overview

`notion-digest` is a Node.js application that pulls tasks from a Notion database, scores and ranks them deterministically, and delivers a structured daily digest to Discord or Slack. It also supports a Discord slash-command bot for interactive task actions (reschedule, defer, mark done).

## Architecture

- **`src/index.js`** — Entry point. Reads `APP_MODE` and `MODE` env vars, then delegates to digest or bot services.
- **`src/digestService.js`** — Notion ingest, scoring/ranking, capacity check (Google Calendar), optional Gemini AI plan, and digest rendering.
- **`src/discordBotService.js`** — Discord slash commands (`/digest`, `/evening`, `/reschedule`, `/defer`, `/done`), embeds, action flows, confirm/cancel safety.
- **`src/botActions.js`** — Action validation and Notion property update payload builders.
- **`src/botStateStore.js`** — Pending action persistence with TTL.
- **`src/config.js`** — Env var parsing with typed defaults. All runtime configuration lives here.
- **`src/logger.js`** — Logging utilities.
- **`.github/workflows/notion-digest.yml`** — Scheduled digest automation (GitHub Actions).

## Runtime Modes

Set `APP_MODE` to control what runs:
- `digest` — Run the webhook digest flow and exit.
- `bot` — Run the Discord bot only (long-lived process).
- `both` — Run the digest flow, then keep the bot running.

Set `MODE` to control which digest is sent:
- `morning` / `evening` / `both`

## Language and Conventions

- **Runtime**: Node.js >= 20 (CommonJS modules — use `require`/`module.exports`).
- **No build step** — source is run directly with `node`.
- **No linter or formatter is configured** — match the existing code style (2-space indentation, single quotes for strings).
- **Environment variables** are parsed and defaulted in `src/config.js`. Add new env vars there; never read `process.env` directly in other modules.
- **Deterministic behavior** — scoring and bucketing must remain deterministic; avoid randomness or adaptive heuristics.
- **All Notion mutations require explicit user confirmation** in the bot action flow — do not bypass the confirm step.

## Testing

Run the test suite with:

```bash
npm test
```

Tests use Node.js's built-in test runner (`node --test`). Test files live in `test/` and follow the naming pattern `*.test.js`. New tests should use `node:test` and `node:assert/strict`.

## Required Environment Variables

See `.env.example` for the full list. Minimum required:
- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`
- A webhook URL (`DISCORD_WEBHOOK_URL` or `SLACK_WEBHOOK_URL`) for digest mode.

For the Discord bot: `DISCORD_BOT_TOKEN`, `DISCORD_APP_ID`, `DISCORD_GUILD_ID`.

## Dry Run

Set `DRY_RUN=1` to log payloads instead of posting webhooks or mutating Notion. Always use dry-run when testing locally:

```bash
DRY_RUN=1 MODE=morning node src/index.js
```

## Common Patterns

- Parse env integers with the exported `parseInteger(raw, fallback)` from `src/config.js`.
- New bot actions follow the pattern in `src/botActions.js`: validate inputs → build a Notion property update object → return it for the caller to apply after confirmation.
- Avoid adding new npm dependencies unless strictly necessary.
