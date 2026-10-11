# Plan: build the Language App prototype from docs/design.md

## Context

`docs/design.md` (476 lines) is the full prototype spec: a German vocabulary app built around photographing book pages, with AI extraction, a Wiktionary check, review, enrichment and flashcards. The repo has no code yet. The user chose:
- to build the **full spec**, nothing deferred;
- to work **milestone by milestone**. Each milestone is built test-first and ends with a demo, passing tests and a commit, and the user reviews it before the next one starts.

`docs/design.md` stays the source of truth. Any deviation found during a milestone is written back into it in the same commit.

Verified environment:
- Node 26.8.2 (the spec says 24), pnpm 11.18.0, Docker 29.5.3 running.
- **Port 5173 is already in use** by another node process (PID 2988, on `[::1]`).
- `ANTHROPIC_API_KEY` is not set. jq and psql are not installed.

## Milestones

| # | Milestone | Main risk it removes | Demo |
|---|---|---|---|
| M0 | Project setup | Workspace, Docker, iPhone over the LAN | iPhone shows "server ok" |
| M1 | Shared core + database | `NULLS NOT DISTINCT`, test DB reset | Home shows "Learning 0 · Learned 0" |
| M2 | AI client + recorded fixtures | Beta API shape, real latency | `ai:try page.jpg` prints the words |
| M3 | Wiktionary loader + lookup | Deprecated source file, field mapping | `dict:lookup See noun` → `[der, die]` |
| M4 | Import API | Merging, concurrency, error paths | curl import with dictionary statuses |
| M5 | Import screens | Photo handling on the iPhone | Photograph → review → save on the iPhone |
| M6 | Enrichment | Synchronous latency | "Adding details…" → Done; backfill of M5 words |
| M7 | Practice | Gestures, retry queue | Swipe session on the iPhone, airplane-mode test |
| M8 | My words, detail, finishing | — | Search, edit, delete; every check passes |

### M0: Project setup
- **Root files:** `package.json` (`engines >=24`, `packageManager pnpm@11.18.0`), `pnpm-workspace.yaml` (core, server, web; a catalog for typescript, zod 4 and vitest), `tsconfig.base.json` (strict, Bundler resolution, `noUncheckedIndexedAccess`), `biome.json`.
- **Database:** `docker-compose.yml` runs postgres:17 with a healthcheck; `docker/initdb/01-test-db.sql` creates `language_app_test`.
- **Repo files:** `.env.example`, `.gitignore` (node_modules, .env, .DS_Store, dist, `data/`, `server/test/live/photos/`).
- **`CLAUDE.md`:**
  - the spec is the source of truth;
  - the milestone workflow;
  - the commands;
  - rules: no Node or DOM APIs in `core`; all API shapes are Zod schemas in `core`; `pnpm test` never calls Claude; load the `claude-api` skill before touching `server/src/ai`.
- **Plan copy:** this plan goes into the repo as `docs/plan.md`.
- **No build step for `core`.** It exports `./src/index.ts`, which tsx (server), Vite (web) and Vitest compile directly. `core/tsconfig` has `types: []`, so any Node API used in core fails the typecheck.
- **Scripts:**
  - `pnpm dev`: the server via `tsx watch` on port 3000, and Vite with `--host` and `strictPort` on 5173, proxying `/api`.
  - `pnpm test`, `pnpm test:live` (separate config, `*.live.test.ts`), `typecheck`, `check`, `db:generate`, `db:migrate`.
- `server/src/config.ts` validates the `.env` values with Zod.
- **Tests:** one smoke test per package; `GET /api/health` tested with `app.inject`.
- **Demo:** the iPhone opens `http://<Mac IP>:5173` and shows "server ok" through the proxy. The other process on 5173 has to be stopped first.

### M1: Shared core and database
- **`core/src/schemas/`:** `common`, `ai`, `imports`, `words`, `sessions`, `stats`.
- **`core/src`:** `learning.ts` (`applyResult`), `card.ts` (front and back formatting, kept pure so React Native can reuse it), `shuffle.ts` (injectable random function), `api-client.ts` (`createApiClient({baseUrl, fetch})`, validates every response with Zod; grows each milestone).
- **`server/src/db/schema.ts`:** all 9 tables.
  - `words` identity uses `unique(...).nullsNotDistinct()`. Check that the generated SQL contains it.
  - Add an `id` to `dictionary_entries`.
  - Add `UNIQUE(session_id, user_word_id)` on `card_results`.
- **Migrations:** a custom migration seeds the single user (`server/src/user.ts`, `SINGLE_USER_ID`).
- **Test harness** (`server/test/helpers/db.ts`): `globalSetup` migrates the test DB; `beforeEach` truncates everything except `users`; test files run one at a time (`fileParallelism: false`).
- **Endpoint and screen:** `GET /api/stats` and a minimal Home screen with React Router.
- **Tests first:**
  - every row of §8.5;
  - card formatting: noun, verb, other, `custom_translation` priority, "Details pending";
  - identity constraints: an adjective inserted twice conflicts, *der See* and *die See* coexist;
  - `/stats`.

### M2: AI client and fixtures
**Before starting:** the user puts `ANTHROPIC_API_KEY` in `.env` and provides 3–4 real book-page photos, one of them blurry.

- **`server/src/ai/types.ts`:** `AiClient {extractWords, enrichWords}` and `AiError` (`busy | refused | invalid_output | too_long`).
- **`server/src/ai/transport.ts`:** the real transport is `client.beta.messages.create`; a replay transport returns recorded raw responses for tests.
- **`server/src/ai/claude.ts`:**
  - Request: `output_config: {effort, format}`, `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`, `max_tokens: 16000`, **no `thinking` field**.
  - Read `stop_reason` before the content; find the text block by type (never `content[0]`).
  - JSON-parse, then Zod `safeParse`, with one retry on invalid output.
  - Map 429, 5xx and connection errors to `busy`.
  - Record `response.model` and sum `usage.iterations` when a fallback ran.
  - Parse responses ourselves rather than with `messages.parse()`, so the parsing code is what the fixtures test.
- **`server/src/ai/usage.ts`:** one `ai_usage` row per attempt, failures and retries included.
- **`server/src/ai/prompts.ts`:** the rules from §11.2 and §11.3.
- **`server/scripts/ai-try.ts`:** prints the words, tokens, latency and cost. `--save` records a fixture with metadata (model, effort, prompt hash).
- **Fixtures:** 3 extract pages, a poor page and an enrich batch, all recorded. Refusal, max_tokens and invalid output are made by editing a recorded file.
- **Tests first:** every mapping of `stop_reason` and errors, the usage rows, a snapshot of the request parameters, enrich parsing. Plus `server/test/live/ai.live.test.ts`.
- **To verify against the installed SDK** (load the `claude-api` skill first):
  - `create` accepts the format object from `betaZodOutputFormat`; otherwise pass `{type:"json_schema", schema}`;
  - the SDK types accept `fallbacks: "default"`.

### M3: Wiktionary dictionary
- **Download first.** Get the kaikki German JSONL into `data/` now; the file is marked deprecated. The loader accepts `.jsonl` or `.jsonl.gz` and filters `lang_code === "de"`, so the raw all-languages dump also works if the German file disappears.
- **Field mapping:** inspect real entries with a Node script, then fix the mapping.
- **Test sample:** `scripts/make-kaikki-sample.ts` cuts about 50 entries into a committed `server/test/fixtures/kaikki-sample.jsonl`. It covers Tisch, See, Band, gehen, aufstehen, sein, schnell, a form-of entry, a proper name and a compound.
- **`server/src/dictionary/`:**
  - `kaikki.ts`: pure `mapEntry`.
  - `load.ts`: stream, insert in batches of 1000, truncate and insert in one transaction.
  - `lookup.ts`: exact match, then lowercase; merges genders across all matching rows; indexed.
  - `check.ts`: the pure rules from §6.3.
- **Script:** `import:wiktionary <file>`.
- **Tests first:** sample file → expected rows; loading twice is idempotent; check rules.

### M4: Import API
- **`server/src/imports/candidates.ts`:** pure `mergeCandidates`.
- **`server/src/imports/service.ts`:**
  - `addPhoto`: check the daily limit, then call extract outside any lock, then in one transaction lock the import with `FOR UPDATE`, merge, compare, run the dictionary check and write.
  - `getImport`: recomputes `existing` each time.
  - `save`: in one transaction, lock the import (409 if it is already done), validate the article fix against the dictionary genders, process adds before skips, find-or-create words with `IS NOT DISTINCT FROM`, upsert `user_words`, mark the import done.
- **`server/src/imports/routes.ts`:** register multipart with `fileSize: 10MB` (the default is 1 MB).
- **`server/src/http/errors.ts`:** errors become `{error:{code,message}}`.

  | Code | HTTP status |
  |---|---|
  | `daily_limit` | 429 |
  | `ai_busy` | 503 |
  | AI output errors | 422 |
  | conflict | 409 |

- **Tests first.** These use the replay AI and dictionary rows from the sample file loaded through the M3 loader.
  - The full flow, including a second photo merging into the first.
  - Skipped words are never offered again.
  - Mismatch fixed, mismatch kept, and a fixed identity that is already in the list becomes a no-op.
  - Saving twice gives 409.
  - Concurrent saves and concurrent uploads lose nothing.
  - The daily limit counts today's calls only.
  - Each error fixture gives the right code.
  - A poor-quality page still merges its words.

### M5: Import screens
- **Device wrappers:**
  - `web/src/device/pickPhotos.ts`.
  - `web/src/device/shrinkImage.ts`: `createImageBitmap` with EXIF orientation, falling back to an `<img>`; JPEG at quality 0.85 with the longest side 1600 px; one photo at a time, calling `bitmap.close()` after each.
- **Screens:**
  - **Home:** counters and banners for unfinished imports.
  - **Import:** thumbnails, per-photo states, at most 2 uploads at once, Retry and Retake.
  - **Review:** toggles, Add all / Skip all, mismatch fix with a gender choice, a collapsed list of words already in your list.
  - **Done.**
- **State:** pure reducers in `web/src/state/`. Review decisions are kept in localStorage per import.
- **Tests first:** `fitWithin`, the photo-state reducer, the review reducer (the original key plus an `article` override).

### M6: Enrichment
- **`server/src/imports/enrich.ts`:**
  1. **Dictionary first:** use the entry whose genders include the word's article.
  2. **AI fills the gaps:** batches of 30, 2–3 at a time; a failed batch doesn't stop the others.
  3. Updates use `WHERE enriched_at IS NULL`.
- **Wiring:** runs after the save transaction commits. Also exposed as `POST /words/enrich-pending`. The Done screen shows "Adding details…", then "N words without details" + **Retry** when some fail.
- **Schema change:** add a `ref` index to the enrich input and output so results match their words reliably (record this in the spec).
- **Tests first:**
  - `forms_source` is `dictionary` or `ai` correctly;
  - words already enriched cause no AI call;
  - 65 words make 3 calls;
  - a busy error leaves words pending, and enrich-pending later fills them;
  - usage rows are written as `enrich`.
- **Measure** how long save + enrich takes on the iPhone. If it is usually over about 20 s, ask the user about switching to 202 + polling.

### M7: Practice
- **Server:**
  - `server/src/practice/select.ts`: the three sources from §8.1, at most 20 words, never ignored ones.
  - Results insert with `ON CONFLICT DO NOTHING` and run `applyResult` only when a row was inserted.
  - `finish` returns the summary.
- **Web:**
  - Screens: PracticeSetup (the first non-empty source is preselected, so starting takes two taps), Flashcards, Summary.
  - `Card.tsx`: 3D flip.
  - Swipes: pure `decideSwipe` in `web/src/practice/swipe.ts`, plus `@use-gesture/react` with `touch-action: none`.
  - Keys: Space, ←, →, ↑.
  - `web/src/practice/resultQueue.ts`: retries on the `online` event and every 5 s; empties before finish.
  - **Practice these now** on the Done screen.
- **Tests first:**
  - counts per source;
  - `not_learned` order;
  - the 20 cap;
  - 3 knew make a word learned;
  - a duplicate result is applied once;
  - skipped changes no progress;
  - swipe thresholds;
  - queue order.

### M8: My words, detail, finishing
- **`server/src/words/routes.ts`:**
  - GET list with `status` and `q` (ILIKE on the lemma and both translations);
  - GET detail;
  - PATCH: a manual change to `learning` resets the streak;
  - DELETE: the shared `words` row stays and `card_results` cascade.
- **Screens:** MyWords and WordDetail.
- **Errors:** a global error toast; JSON 500 responses carry the request id.
- **Spec update:** write every deviation into `docs/design.md`.
- **Optional:** a skeleton `scripts/ai-quality.ts`. It needs hand-checked pages from the user.

## Spec changes to record as they come up
- §4: Node 24+, since development runs on 26.
- §7: the kaikki source is deprecated; the loader also accepts the raw dump.
- **Daily limit:** counts every extract attempt, retries included, by the server's local day.
- **New fields:** a `ref` in the enrich schema; an optional `ai_usage.duration_ms` to track the "under a minute" target; `UNIQUE(session_id, user_word_id)` on `card_results`.
- **Photos:** a photo can be removed only before upload or after it failed.
- **Review:** decisions are kept per device, in localStorage.

## Verification (every milestone)
1. `pnpm test`, `pnpm typecheck` and `pnpm check` pass. `pnpm test` never calls Claude.
2. Run the milestone's demo; the iPhone demos are on the same Wi-Fi at `http://<Mac IP>:5173`.
3. From M2 on: `pnpm test:live` before committing any change under `server/src/ai` (about 25¢).
4. Commit, then stop for the user's review.
