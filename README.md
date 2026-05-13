# Local Planner

Private local planner backed by SQLite. The app is a local-first task and project workflow with Notion retained only as an import source.

## Current Scope

- React + Vite client
- Local Node API server
- SQLite database at `.data/planner.sqlite` by default
- Optional Electron desktop shell for local macOS use
- Manual project CRUD
- Manual task CRUD
- Bulk task capture into review
- Sidebar shell for Today, Bulk Add, Projects, Calendar, Analytics, and Easy
- Notion import for one-time migration into SQLite

## Development

Install dependencies:

```bash
npm install
```

Run the local API server:

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

Build the client:

```bash
npm run build
```

Run the desktop app locally:

```bash
npm run electron
```

Package the macOS desktop app:

```bash
npm run electron:package
```

The packaged app is written to `release/`.

## Database

Development database:

```text
.data/planner.sqlite
```

The Electron app stores its packaged-app database in the macOS app data directory by default. During packaging, the current `.data/planner.sqlite` database is copied into a temporary `electron-seed/` folder and bundled into the app. On first launch, Electron seeds app data from that bundled copy when no app database exists yet.

To overwrite the Electron app database with the current development database:

```bash
npm run electron:copy-db
```

Override with:

```bash
PLANNER_DB_PATH=/path/to/planner.sqlite npm run dev:server
```

## Tests

```bash
npm test
```

The focused tests cover SQLite repositories, planner date helpers, project/task behavior, analytics, calendar data, and Notion import mapping.

## Notion Import

Configure the source Notion database:

```bash
NOTION_API_KEY=secret_...
NOTION_DATABASE_ID=...
```

Optional property overrides:

```bash
NOTION_TASK_PROP=Task
NOTION_PRIORITY_PROP=Priority
NOTION_STATUS_PROP=Status
NOTION_DUE_PROP=Due
NOTION_PROJECT_PROP=Project
NOTION_COMPLETED_TIME_PROP="Completed time"
NOTION_COMPLETED_IMPORT_DAYS=90
CLOSED_STATUS_VALUES=done
```

Run the migration:

```bash
npm run import:notion
```

The importer creates projects from Notion `Project` values or resolved relation page titles, imports open tasks, imports recently completed tasks, and skips duplicate Notion page IDs on re-run. Project deadlines are not inferred from Notion.
