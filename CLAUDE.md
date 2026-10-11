# Language App

Companion app for learning German vocabulary from a book: photograph pages → AI extracts words → review → flashcards.

- **`docs/design.md` is the source of truth.** Read the relevant section before changing behaviour. If the implementation has to deviate, update the spec in the same commit.
- **`docs/plan.md`** is the build plan (milestones M0–M8).

## Workflow

- Build one milestone at a time, test-first. Each milestone ends with: tests, typecheck and lint passing → the milestone's demo run → a commit → stop for the user's review before starting the next one.

## Layout

pnpm workspace, TypeScript everywhere, no build step (packages import each other's `src/` directly).

- `core/`: shared Zod schemas, API client, learning rules. **No Node or browser-only APIs** (the typecheck has no `@types/node`); a future React Native app must use it unchanged.
- `server/`: Fastify + PostgreSQL (Drizzle). The only part that talks to the database and to Claude.
- `web/`: React + Vite. Screens and interaction only; all data goes through the `core` API client.

## Commands

```sh
docker compose up -d      # PostgreSQL 17: databases language_app and language_app_test
pnpm dev                  # migrates the dev DB, then server on 127.0.0.1:3000 and Vite on 0.0.0.0:$WEB_PORT (default 5173) proxying /api
pnpm db:generate          # after editing server/src/db/schema.ts: writes a migration to server/drizzle/
pnpm db:migrate           # applies migrations to DATABASE_URL (tests rebuild the test DB themselves)
pnpm test                 # all unit + server tests; never calls Claude
pnpm test:live            # real Claude API calls (~25¢); run after changes under server/src/ai
pnpm typecheck
pnpm check                # Biome lint + format check (`pnpm format` to fix)
```

Configuration lives in the repo-root `.env` (copy `.env.example`). iPhone testing: same Wi-Fi, open `http://<Mac IP>:5173`.

## Rules

- Every API request/response shape is a Zod schema in `core/`.
- `pnpm test` must never call Claude: server tests use recorded responses in `server/test/fixtures/ai/`.
- **Load the `claude-api` skill before touching `server/src/ai/`.**
- Real textbook photos stay out of git (`server/test/live/photos/` is ignored).
