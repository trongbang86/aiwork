# AIWork

AIWork is an independent, AI-native multi-project work-management platform. It combines generic hierarchical work items, inherited AI instructions, workflow-activated actors, and a self-describing REST API.

## Run locally

```powershell
corepack pnpm install
corepack pnpm dev
```

The API listens on `http://localhost:4300` and its OpenAPI UI is at `/docs`. The Vite UI listens on `http://localhost:5173`.

The installed Windows service is URL-first and serves HTTPS on port 8446: `/v1/ai` for agent discovery, `/docs` for OpenAPI documentation, and `/health` for monitoring. The React client is development-only.

Development API authentication uses `Authorization: Bearer dev-token`. Set `AIWORK_API_TOKEN` to replace it.

## Commands

```powershell
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

The equivalent operational interface follows the workspace convention:

```powershell
make up
make check
make test
make backup
make up-prod
make service-install
```

`make up-prod` stops before launch if checks, tests, SQLite integrity validation, or the verified timestamped backup fails. Backups default to `data/backups`; override with `AIWORK_BACKUP_DIR`.

## URL-based GUI

- `/projects` — portfolio overview
- `/projects/{id}/hierarchy` — inherited context map
- `/projects/{id}/board` — workflow board
- `/work-items/{id}` — work item and AI-context inspector
- `/workflows/{id}/designer` — workflow graph
