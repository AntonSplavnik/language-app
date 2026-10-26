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
pnpm test:live            # real Claude API calls (~1¢ on Haiku, the default; ~15¢ on Opus); run after changes under server/src/ai
pnpm --filter server ai:try extract <photo> [--save name]      # one real call: words, tokens, time, cost
pnpm --filter server ai:try enrich <words.json> [--save name]  # --save records a fixture in server/test/fixtures/ai/
pnpm --filter server ai:try describe <text> [--entry file] [--save name]  # Ask AI (Call 3) for a typed word
pnpm --filter server import:wiktionary data/kaikki/kaikki.org-dictionary-German.jsonl  # (re)load the dictionary, ~11 s
pnpm --filter server dict:lookup <lemma> <pos> [article]       # what the dictionary check sees for a word
pnpm --filter server demo:import <photo> --user <email|username> [--save]  # whole import flow against a running `pnpm dev`, signed in (one real AI call)
pnpm --filter server user:claim <email> <username>           # once per database: user 1 (the prototype's word list) becomes your account; asks for a password
pnpm --filter server invite:add <email>                      # sign-up is invite-only (SIGNUP_MODE=invite); also invite:list, invite:remove <email>
pnpm --filter server user:set-password <email|username>      # new password (asked for, or piped in); ends the account's sign-ins
pnpm --filter server user:ai <email|username> on|off         # the account's AI features (photo/PDF import, Ask AI, example sentences)
pnpm typecheck
pnpm check                # Biome lint + format check (`pnpm format` to fix)
pnpm build:vercel         # web build + the API bundled into .vercel/output (Vercel's Build Output API)
pnpm test:bundle          # build, then test .vercel/output and the bundled function on the test DB (CI runs it)
pnpm --filter server serve:vercel [port]   # serve the built function with plain Node; reads only the environment
# Scripts against Neon: the string comes from the git-ignored deploy.env, never typed or shown (docs/design.md §18.8)
( set -a; . ./deploy.env; set +a; DATABASE_URL="$NEON_DIRECT_URL" pnpm db:migrate )   # likewise invite:*, user:*, import:wiktionary
```

CI is `.github/workflows/ci.yml`: the checks (typecheck, lint, `pnpm test`, `pnpm test:bundle`) on every push and pull request; on `main`, then Neon's migrations and the Vercel deploy. The Mac's `.env` never has `BETTER_AUTH_URL` (production's address; the Mac's server refuses it).

Configuration lives in the repo-root `.env` (copy `.env.example`); the server needs `BETTER_AUTH_SECRET` (`openssl rand -base64 32`). iPhone testing: same Wi-Fi, open `http://<Mac IP>:5173` and sign in (Safari and the Home Screen app each sign in once).

## Rules

- Every API request/response shape is a Zod schema in `core/`.
- `pnpm test` must never call Claude: server tests use recorded responses in `server/test/fixtures/ai/`.
- **Load the `claude-api` skill before touching `server/src/ai/`.**
- Real textbook photos stay out of git (`server/test/live/photos/` is ignored).
- The iPhone opens the app over plain HTTP on the home network, which is **not a secure context**: no `crypto.randomUUID()`, `crypto.subtle`, clipboard, camera/microphone streams or service workers in web code. Testing on desktop `localhost` hides this, so check on the phone.
