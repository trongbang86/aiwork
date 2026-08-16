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

## REST and agent quick start

Start at `GET /v1/ai`. It describes authentication, searchable entry points, projects, actors, and a suggested story workflow. A client can then:

```text
GET  /v1/work-items?q=DEMO-1
GET  /v1/work-items/{id}/ai?mode=full
POST /v1/work-items/{id}/comments
POST /v1/work-items/{id}/transition
```

The full AI response includes inherited instructions, comments, children, attachments, valid next transitions, the current version, and executable tool schemas. Mutations require the bearer token; updates and transitions use `expectedVersion` to prevent lost changes.

Create a project with `POST /v1/projects`, then create initiatives, epics, stories, or tasks with `POST /v1/work-items`. The latter accepts `parentId`, `type`, and `title`; `key` is optional and automatically allocated within the project.

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
