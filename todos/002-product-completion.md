# 002 - Product completion

- [ ] Add user, team, role, and project-scoped authorization models.
- [ ] Add project/work-item/workflow CRUD APIs and forms.
  - [x] Add project creation and project switching.
  - [x] Add hierarchy-aware child creation with automatic project keys.
  - [x] Add work-item search/detail and comment list/create REST flows.
  - [x] Keep inherited AI instructions and item counts out of project-list summaries.
  - [x] Add project detail lookup by project key or ID with item counts and without inherited AI instructions.
  - [x] Add separate project AI-instruction lookup and actor-list endpoints.
  - [x] Add scoped initiative, epic, and story collection/detail/AI routes.
  - [x] Add separate actor detail and actor AI-instruction endpoints.
  - [x] Add hierarchy-scoped create/update, comment, and picture routes at every level.
  - [x] Document the hierarchy and actor REST endpoints with curl examples.
  - [ ] Add deletion, workflow CRUD, and remaining edit forms.
- [ ] Persist workflow canvas state and validate graph changes.
- [ ] Add transition-aware Kanban drag/drop with actionable invalid-drop feedback.
- [ ] Add full work-item detail editing, comments, child management, and attachment UI.
  - [x] Add comment reading/writing and context-aware child creation to the React inspector.
  - [x] Add transition controls and image upload/preview to the React inspector.
- [ ] Add S3/MinIO storage adapter and signed attachment delivery.
- [ ] Add PostgreSQL integration profile and migration verification.
- [ ] Add browser end-to-end tests and accessibility checks.
  - [x] Complete an initial Playwright usability pass with responsive navigation, keyboard-dismissable overlays, and clearer inspector states.
- [ ] Add production authentication, CSRF policy for cookie sessions, deployment, and HTTPS configuration.

## IQ Prep BAU automation

- [x] Define a dedicated IQ Prep workflow whose In Progress actor is `iqprep.bau.testing`.
- [ ] Provision the `IQPREP / BAU / Testing` hierarchy idempotently through the worker.
- [ ] Import each parent feedback request as a story with its immutable source reference.

## Kids games automation

- [x] Define a dedicated kids-game workflow and `games.kids.developer` In Progress actor.
- [x] Seed the `GAMES / New Game` project hierarchy with inherited kids-game instructions.
- [x] Support worker-provisioned `GAMES / New Game` stories with inherited TypeScript, URL, accessibility, and child-safety instructions.
- [ ] Transition imported stories only through the transition engine and forward their full `/ai` context to AI.
