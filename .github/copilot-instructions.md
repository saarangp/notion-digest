# Copilot Instructions

## Project Overview

`local-planner` is a private local planner app. The main product is a React + Vite client talking to a local Node API backed by SQLite.

Notion is only a migration source. External planning integrations, AI planning, and automatic rollover are outside the active product path.

## Architecture

- `src/client/` — React client, view shell, API wrapper, styling, and planner views.
- `src/server/` — Local HTTP API, SQLite connection, schema, and repositories.
- `src/importers/` — Notion migration configuration and mapping code.
- `test/` — Node test runner tests for repositories and import mapping.
- `.data/planner.sqlite` — Default local development database, ignored by git.

## Commands

```bash
npm run dev:server
npm run dev
npm run build
npm test
```

The Vite dev server proxies `/api` to `http://127.0.0.1:4321`.

## Conventions

- Runtime is Node.js >= 20.
- Server code is CommonJS.
- Client code is React modules under `src/client/`.
- Keep functions small and direct.
- Avoid unnecessary abstractions and nested functions unless they make ownership clearer.
- Keep Notion mapping in importer-owned modules, not in the planner runtime.
- Keep runtime behavior local to the planner API, SQLite storage, React client, and importer-owned Notion migration code.

## Testing

Use Node's built-in test runner:

```bash
npm test
```

Add focused tests for repository, storage, and importer behavior when those areas change.
