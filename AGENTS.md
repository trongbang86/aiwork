# AIWork project instructions

AIWork is an independent application and repository rooted at `D:\workspace\aiwork`. It is not part of `D:\workspace\ai` and must not import from, write to, or assume the runtime of that project.

## Engineering rules

- Use strict TypeScript throughout the backend and frontend.
- Keep privileged Windows and service-management operations out of AIWork; `admin` remains the workspace control plane.
- Use Fastify, Drizzle ORM, SQLite in development, React/Vite, and pnpm workspaces.
- Model work hierarchy generically with self-referencing work items and fetch hierarchy context in one recursive CTE call.
- Route every state change through the transition engine. Never allow status updates through the generic work-item patch route.
- Protect mutations with authentication/authorization hooks and optimistic concurrency. Audit every mutation with a correlation ID.
- Store binary attachments behind a storage interface and keep only metadata in the database.
- Keep implementation progress in numbered Markdown files under `todos`.
- Never perform a real shutdown, reboot, or privileged host operation in tests.

## Verification

Run `pnpm check`, `pnpm test`, and `pnpm build` before committing completed work.
