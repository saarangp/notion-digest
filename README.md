# Notion Digest + Day Planner

Deterministic Notion digest with Google Calendar time-block planning in the morning and automatic rollover in the evening.

## What This Project Does

- Pulls open tasks from Notion
- Scores and ranks tasks deterministically
- Posts compact digest output to Discord/Slack webhooks
- Morning run (9 AM local):
  - computes free time from Google Calendar
  - uses Gemini (with fallback) to assign focus blocks
  - creates real **busy** calendar events
- Evening run (6 PM local):
  - auto-moves all open overdue + due-today tasks to tomorrow
  - posts rollover summary
- Highlights "future pressure" tasks due later that need early start based on daily workload

## Architecture

- `src/digestService.js`: Notion ingest, scoring, ranking, future-pressure detection, AI summary/plan, calendar planning, evening rollover
- `src/config.js`: env parsing/defaults
- `src/index.js`: mode dispatch (`morning`/`midday`/`evening`) with local-hour guard
- `.github/workflows/notion-digest.yml`: hourly scheduler + local-hour enforcement

## Runtime Modes

Set `MODE`:

- `morning`: digest + calendar block creation
- `midday`: digest + remaining-day calendar replan
- `evening`: digest + rollover

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

### Google Calendar (read + write)

- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_CALENDAR_ID` (legacy fallback for both read/write)
- `GOOGLE_SOURCE_CALENDAR_ID` (recommended source calendar for meeting reads)
- `GOOGLE_PLANNER_CALENDAR_ID` (recommended destination calendar for focus-block writes)
- Optional:
  - `WORKDAY_START_HOUR`
  - `WORKDAY_END_HOUR`
  - `LUNCH_START_HOUR`
  - `LUNCH_START_MINUTE`
  - `LUNCH_END_HOUR`
  - `LUNCH_END_MINUTE`
  - `FOCUS_BUFFER_MINUTES`
  - `PLAN_MIN_BLOCK_MINUTES`
  - `PLAN_MAX_BLOCKS`
  - `PLAN_MAX_PROJECTS`
  - `PLAN_CANDIDATE_LIMIT`
  - `PLANNER_EVENT_PREFIX`
  - `PLANNER_EVENT_COLOR_ID` (default `11`)

### Gemini (optional but recommended for planner quality)

- `GEMINI_API_KEY`
- Optional:
  - `ENABLE_AI_SUMMARY=1` (controls digest summary/ordering sections)
  - `GEMINI_MODEL`
  - `AI_SUMMARY_WINDOW_DAYS`
  - `AI_SUMMARY_MAX_TASKS`

### Planning / Future Pressure

- `PLANNING_HORIZON_DAYS` (default `14`)
- `FUTURE_RISK_DAILY_MINUTES_THRESHOLD` (default `60`)
- `URGENT_LOAD_DAYS` (default `3`)
- `URGENT_LOAD_MIN_DAILY_MINUTES` (default `120`)
- `URGENT_LOAD_BOOST` (default `0.25`)
- `URGENT_LOAD_HEAVY_MINUTES` (default `180`)
- `URGENT_LOAD_HEAVY_BOOST` (default `0.45`)
- `ONE_OFF_MINUTES` (default `60`)
- `ONE_OFF_MAX_TASKS` (default `2`)

## TODO

- [ ] Add `MODE=weekly` to generate a weekly risk report and suggest pre-work focus blocks for high-pressure upcoming tasks.

## Running Locally

```bash
npm run morning
npm run midday
npm run evening
npm run test
```

## Scheduling (GitHub Actions)

Workflow: `.github/workflows/notion-digest.yml`

- Runs on targeted UTC schedules for LA local times
- Local-hour guard is disabled in workflow steps (`ENFORCE_LOCAL_HOUR=0`) so delayed jobs still run
- Morning fires at `MORNING_HOUR_LOCAL` (default `9`)
- Midday replan fires at `MIDDAY_HOUR_LOCAL` (default `14`)
- Evening fires at `EVENING_HOUR_LOCAL` (default `18`)
- Timezone default: `America/Los_Angeles`

If you keep fixed UTC crons, update them when DST season changes.

## Planner Behavior

Morning planner:

1. Reads today's source calendar events
2. Removes previously generated planner blocks for today (planner calendar)
3. Computes free slots inside workday window
4. Reserves `FOCUS_BUFFER_MINUTES`
5. Builds candidates from overdue, due-today, due-soon, and high-pressure future tasks
6. Produces a Morning Decision section: `Must / Move / Start` (Gemini IDs + deterministic fallback)
7. Converts task triage into project demand (`triage score -> 30m units per task`)
8. Reserves a dedicated one-off lane for urgent non-dominant-project tasks
9. Uses Gemini to order project focus sequence (fallback deterministic if Gemini fails)
10. Creates grouped busy project blocks in planner calendar with task breakdowns

## Evening Rollover Behavior

Evening run auto-updates Notion due dates for all open:

- overdue tasks
- due-today tasks

Target date is tomorrow in local timezone.

## Syncing GitHub Actions Secrets/Variables

Use script:

```bash
./scripts/sync_github_actions_from_env.sh
```

Or target a specific repo:

```bash
./scripts/sync_github_actions_from_env.sh owner/repo .env
```

## Troubleshooting

### Planner skipped

Check calendar env vars and service account permissions on source/planner calendar IDs.

### No webhook message in dry run

Expected. `DRY_RUN=1` logs output and intended mutations.

### Gemini sections missing

Check `GEMINI_API_KEY` and model quotas/errors.
