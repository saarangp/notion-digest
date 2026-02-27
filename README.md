# Notion Task Triage -> Discord (Primary)

Deterministic daily task triage from Notion, delivered by webhook.

This project moved to **Discord-first delivery** for lower friction and personal use.
Slack remains supported as fallback via `NOTIFIER=slack`.

## What it does

- Pulls open Notion tasks due within the configured window (`DUE_WINDOW_DAYS`, default 7) plus overdue tasks
- Computes triage features:
  - `due_in_days`
  - `days_since_last_touch`
  - `is_overdue`
- Scores tasks deterministically (no adaptive behavior)
- Buckets tasks into:
  - `overdue`
  - `due_today`
  - `due_soon` (default 1-3 days)
  - `later` (default 4-7 days)
- Picks Top 3 focus tasks with project-diversity constraint
- Optionally checks today capacity from Google Calendar
- Sends compact daily message to Discord (or Slack)
- Writes daily JSON log at `logs/YYYY-MM-DD.json`

Optional AI summary exists but is off by default (`ENABLE_AI_SUMMARY=0`).

## Scoring Model

Priority mapping:
- `P0=5`, `P1=4`, `P2=3`, `P3=2`

Normalizations:
- `P(p) = p / 5`
- `D(d) = 1 / (max(d, 0) + 1)` where `d = due_in_days`
- `S(s) = log(1 + s) / log(1 + STALENESS_CAP_DAYS)` where `s = days_since_last_touch`

Final score:
- `score = W_PRIORITY * P + W_DUE * D + W_STALE * S + overdue_boost`
- default weights:
  - `W_PRIORITY=0.5`
  - `W_DUE=0.35`
  - `W_STALE=0.15`
  - `OVERDUE_BOOST=0`

Sorting:
1. Bucket precedence (`overdue` -> `due_today` -> `due_soon` -> `later`)
2. Score descending
3. Due date ascending

## Notion Schema (Default Property Names)

- `Task` (title)
- `Priority` (`P0`..`P3`)
- `Due` (date)
- `done` (checkbox)
- `Project`
- `estimated_minutes`
- `Created time`
- `Last edited time`

Closed tasks are excluded when either:
- `done` checkbox is true
- status value is in `CLOSED_STATUS_VALUES` (default `done`)

## Quick Start

```bash
cd /Users/saarang/Documents/Personal/notion-digest
cp .env.example .env
npm install
npm run dry-run
```

Run explicitly:

```bash
npm run morning
npm run evening
```

## Discord Setup (Recommended)

1. In Discord, open your target channel settings.
2. Go to `Integrations` -> `Webhooks` -> `New Webhook`.
3. Copy the webhook URL.
4. Set:
   - `NOTIFIER=discord`
   - `DISCORD_WEBHOOK_URL=<your webhook>`

## GitHub Actions Secrets

Required:
- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`
- `DISCORD_WEBHOOK_URL` (if `NOTIFIER=discord`)

Optional:
- `SLACK_WEBHOOK_URL` (if `NOTIFIER=slack`)
- `GEMINI_API_KEY` (if AI summary enabled)
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_CALENDAR_ID`

## Useful Variables

- `NOTIFIER` (`discord` or `slack`, recommended `discord`)
- `ENABLE_AI_SUMMARY` (`0` or `1`)
- `HIGH_PRIORITY_VALUES` (default `p0`)
- `DUE_WINDOW_DAYS` (default `7`)
- `DUE_SOON_DAYS` (default `3`)
- `W_PRIORITY`, `W_DUE`, `W_STALE`, `OVERDUE_BOOST`
- `TOP3_MAX_PER_PROJECT`
- `WORKDAY_START_HOUR`, `WORKDAY_END_HOUR`, `FOCUS_BUFFER_MINUTES`
- `MAX_SLACK_LINES`, `MAX_TASKS_PER_SECTION`

Workflow: `.github/workflows/notion-digest.yml`

## Roadmap / TODO

- Build a real Discord bot (not just webhook) for evening triage interaction.
- Add night-run actions directly in Discord:
  - `Sweep` (leave as-is)
  - `Reschedule` (move due date)
  - `Defer` (lower urgency)
  - `Mark done`
- Add per-task quick actions and confirmation flow for safe updates to Notion.
