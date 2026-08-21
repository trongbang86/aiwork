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

## Hierarchy REST API

Scoped URLs accept either a resource ID or its case-insensitive key.

```text
GET  /v1/projects
GET  /v1/projects/{project}
GET  /v1/projects/{project}/ai
GET/POST /v1/projects/{project}/initiatives
GET      /v1/projects/{project}/initiatives/{initiative}[/ai]
GET/POST /v1/projects/{project}/initiatives/{initiative}/epics
GET      /v1/projects/{project}/initiatives/{initiative}/epics/{epic}[/ai]
GET/POST /v1/projects/{project}/initiatives/{initiative}/epics/{epic}/stories
GET      /v1/projects/{project}/initiatives/{initiative}/epics/{epic}/stories/{story}[/ai]
```

Collection responses omit AI instructions and item counts. Detail responses omit AI instructions and include the direct-child `itemCount`. The separate `/ai` response contains the resource's AI instructions.

Every project, initiative, epic, and story detail URL also supports:

```text
PUT  {detail-url}            Update using expectedVersion
GET/POST {detail-url}/comments
GET/POST {detail-url}/pictures
```

All `POST` and `PUT` requests require bearer authentication and are audited. Picture creation accepts one multipart image. Examples for the installed self-signed HTTPS service:

```powershell
curl.exe -k https://localhost:8446/v1/projects/proj_games
curl.exe -k https://localhost:8446/v1/projects/proj_games/ai
curl.exe -k https://localhost:8446/v1/actors
curl.exe -k https://localhost:8446/v1/actors/actor_developer
curl.exe -k https://localhost:8446/v1/actors/actor_developer/ai

curl.exe -k -X POST `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"body":"Acceptance evidence"}' `
  https://localhost:8446/v1/projects/GAMES/comments

curl.exe -k -X POST `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -F "file=@C:\path\picture.png" `
  https://localhost:8446/v1/projects/GAMES/pictures
```

`GET /v1/actors` lists actor metadata. `GET /v1/actors/{id-or-name}` returns one actor without instructions; `GET /v1/actors/{id-or-name}/ai` returns its AI instructions.

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
