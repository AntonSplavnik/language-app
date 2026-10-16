# Language App

Companion app for learning German vocabulary from a book: photograph pages → AI extracts words → review → flashcards.

- **`docs/design.md` is the source of truth.** Read the relevant section before changing behaviour. If the implementation has to deviate, update the spec in the same commit.
- **`docs/design-system/` is how the UI looks.** Before building or changing UI, read `docs/design-system/README.md` (the brand book and component index), then `components/<Name>.md` for each component you touch. Take values from `tokens.json` by name (they are the CSS variables in `web/src/styles/global.css`) and reuse `web/src/styles/ui.module.css` and `web/src/components/` rather than restating a value. If you change a token, shared class or component, update the folder in the same commit.
- **`docs/plan.md`** is the build plan: Part 1, M0–M8 (the prototype, done); Part 2, M9 onward (next features, in build order).

## Workflow

- A Part 2 milestone starts by settling the open questions listed with it in `docs/plan.md` with the user, then writing its section of `docs/design.md` for the user to review before any code.
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
pnpm test:live            # real Claude API calls (~15¢ on Opus, ~1¢ on Haiku); run after changes under server/src/ai
pnpm --filter server ai:try extract <photo> [--save name]      # one real call: words, tokens, time, cost
pnpm --filter server ai:try enrich <words.json> [--save name]  # --save records a fixture in server/test/fixtures/ai/
pnpm --filter server import:wiktionary data/kaikki/kaikki.org-dictionary-German.jsonl  # (re)load the dictionary, ~11 s
pnpm --filter server dict:lookup <lemma> <pos> [article]       # what the dictionary check sees for a word
pnpm --filter server demo:import <photo> [--save]            # whole import flow against a running `pnpm dev` (one real AI call)
pnpm typecheck
pnpm check                # Biome lint + format check (`pnpm format` to fix)
```

Configuration lives in the repo-root `.env` (copy `.env.example`). iPhone testing: same Wi-Fi, open `http://<Mac IP>:5173`.

## Rules

- Every API request/response shape is a Zod schema in `core/`.
- `pnpm test` must never call Claude: server tests use recorded responses in `server/test/fixtures/ai/`.
- **Load the `claude-api` skill before touching `server/src/ai/`.**
- Real textbook photos stay out of git (`server/test/live/photos/` is ignored).
- The iPhone opens the app over plain HTTP on the home network, which is **not a secure context**: no `crypto.randomUUID()`, `crypto.subtle`, clipboard, camera/microphone streams or service workers in web code. Testing on desktop `localhost` hides this, so check on the phone.
