# Local Planner

Private local planner backed by SQLite. The app is replacing the old Notion digest automation with a local-first task and project workflow.

## Current Scope

- React + Vite client
- Local Node API server
- SQLite database at `.data/planner.sqlite` by default
- Manual project CRUD
- Manual task CRUD
- Bulk task capture into review
- Sidebar shell for Today, Bulk Add, Projects, Calendar, Analytics, and Easy

Legacy digest, webhook delivery, Google Calendar scheduling, and automatic rollover are no longer part of the main product path. Notion is retained only as a future migration source.

## Development

Install dependencies:

```bash
npm install
```

Run the local API:

```bash
npm run dev:server
```

Run the Vite client:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

The Vite dev server proxies `/api` to `http://127.0.0.1:4321`.

## Database

Development database:

```text
.data/planner.sqlite
```

Override with:

```bash
PLANNER_DB_PATH=/path/to/planner.sqlite npm run dev:server
```

## Tests

```bash
npm test
```

The current focused tests cover SQLite schema/repository behavior for projects and tasks, including review clearing, completion, deletion, and summaries.

## Notion Import

The planned import command is:

```bash
npm run import:notion
```

That command is reserved for the Notion migration phase. It should preserve useful Notion property mapping while avoiding webhook, digest, Google Calendar, and scheduling behavior.
