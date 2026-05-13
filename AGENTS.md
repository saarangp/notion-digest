# AGENTS.md

## Product Direction

This repository is a private local planner app. The source of truth is the local SQLite planner database, not Notion.

Do not reintroduce the old digest automation, Discord or Slack webhooks, Google Calendar scheduling, Pomodoro flows, automatic rollover, or task scoring systems unless explicitly requested.

Notion is retained only as an importer and migration source.

## Runtime

- Local API server: `npm run dev:server`
- Vite client: `npm run dev`
- Build: `npm run build`
- Tests: `npm test`
- Default database: `.data/planner.sqlite`
- Database override: `PLANNER_DB_PATH=/path/to/planner.sqlite`

## Architecture

- `src/client/` contains the React planner UI.
- `src/server/` contains the local HTTP API, SQLite schema, and repositories.
- `src/importers/` contains Notion import code.
- `test/` contains Node test-runner tests.

Keep planner runtime code separate from importer code.

## Coding Agreements

- Inspect existing code before changing behavior.
- Give a short implementation plan before edits.
- Keep functions small and direct.
- Avoid redundant code and unnecessary abstractions.
- Add focused tests when behavior changes.
- Run `npm test` and `npm run build` before finishing.

## Future Agent And Scheduled Integration

If Claude Code, Codex, or another scheduled agent is integrated later:

- Read and write planner data through explicit local APIs or repository functions.
- Preserve local SQLite as the source of truth.
- Avoid external notifications unless explicitly added as a new feature.
- Do not depend on Notion except for manual import or migration.
- Keep scheduled agents narrow and auditable.
- Prefer non-mutating scheduled workflows, such as summarizing today's open tasks or suggesting a plan.
- Require clear tests and a documented manual correction path for any mutating scheduled workflow.
