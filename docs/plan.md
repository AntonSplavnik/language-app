# Plan

- **Part 1, M0–M8 (done):** build the prototype from `docs/design.md` (a bare § always means a section of that file). Everything up to "Spec changes to record as they come up" is that plan, kept as it was written.
- **Part 2, M9 onward:** the features chosen after the prototype, in the order they will be built (see Part 2 below).
- The verification at the end applies to every milestone of both parts.

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

## Part 2: after the prototype (M9 onward)

### Context

The prototype (M0–M8) and its redesign (`docs/redesign/`) are built. On 2026-10-14 the user listed the features to add next and agreed the order below. On 2026-10-23 deployment was added as M12, right after M11, and the milestones after it were renumbered (themes M12 → M13 … time M20 → M21). Each milestone is described here only as far as it has been decided. A milestone starts by writing its section of `docs/design.md`, settling the open questions listed with it together with the user; then it follows the usual workflow (CLAUDE.md): test-first, the demo, the user's check on the iPhone, a commit.

Milestones that change a prompt or an AI call (M10, M11, M13) load the `claude-api` skill first, re-record the affected fixtures and run `pnpm test:live`.

**Name (the user, 2026-10-25):** the working name is **Dingsda** (German for "thingy", the word you reach for when the real one won't come). It is provisional: it is kept behind one constant (`APP_NAME` in `core/src/app.ts`; a web test holds `index.html` and the manifest to the same value), it stays out of tests, fixtures, database names, environment variables and the Neon project name, and it names the Vercel project (`dingsda.vercel.app`, M12.4). The naming brief and shortlist are in a git stash on the Mac ("naming brief"); the name is finalised after M12 and before anyone but the author gets the address.

| # | Milestone | Demo |
|---|---|---|
| M9 | Past imports, date added | In Practice, pick an old import and practise only its words; filter My words to it; name an import on Done and rename it in Settings |
| M10 | Add a word by hand | Type *Regenschirm*, confirm the filled details, find it in My words; type three words as a list, confirm them one by one, practise them as an import |
| M11 | Import from PDF | Pages 42–45 of a book PDF → review → save |
| M12 | Accounts and deployment (Vercel + Neon) | Away from home Wi-Fi, the iPhone opens the app's https address, signs in, imports a photo and practises its words |
| M13 | Themes and own groups | Correct a theme in review; make a group "Hard ones"; the existing words have themes |
| M14 | Filters and practice builder | Practise "verbs from Weather"; filter My words to *die* nouns |
| M15 | Card modes | An article session and a German → English session |
| M16 | Spaced repetition | Home shows the words due today; a "Due today" session |
| M17 | Progress over time | Daily goal, streak and history after a few days of practice |
| M18 | Basics and the alphabet | The alphabet page with sounds; a letter card session |
| M19 | Text-to-speech | A generated recording plays on the iPhone |
| M20 | Numbers | The explanation, then a listen-and-type session |
| M21 | Time | The explanation, then a typed session that accepts both "Viertel vor vier" and "fünfzehn Uhr fünfundvierzig" |

### Phase 1: words

#### M9: Past imports and date added
Settled with the user on 2026-10-15; the behaviour is in `docs/design.md` §5, §8.1, §9, §9.2 and §10 (screens 1, 3, 4, 7 and 10–13).
- **Past imports are reached where they are used** (no Imports screen on Home or in My words):
  - **Practice setup:** the `last_import` source becomes `import`, a card with a menu of the past imports (newest first, so the latest is the default and starting still takes two taps). Up to 20 words, shuffled, as before.
  - **My words:** a view menu under the search: All words · A–Z, All words · Newest first (grouped by day), or one import.
  - **Settings** (new, a gear on Home) → **Imports** → one import → **Rename** (a sheet like Edit word). Settings is a menu, so later settings (M17's daily goal) join it, and later actions on an import join the import's page. Changed from rename-in-place during the user's check on 2026-10-16.
  - **Done:** "Name this import" when the import has no name.
- An unnamed import is shown by its date, with the time when several share a day.
- An import that adds nothing to learn (no new words on the pages, or every new word skipped) gets no entry anywhere, and Done says why ("Every word on these pages is already in your list."). The same goes for an import whose words were later all deleted or set to Ignored.
- **Schema change:** `sessions.import_id`; the migration turns old `last_import` sessions into `import` ones. `pnpm dev` migrates the real word list, so the migration is first tried on a copy of the dev database.
- **API:** `GET /imports`, `PATCH /imports/:id`, `POST /sessions { source: "import", importId }`, `GET /words` with `importId` and `sort`; `WordListItem` gains `addedAt`.
- **Tests first:**
  - `GET /imports`: only `done` imports with learning or learned words, newest first, `wordCount` counts those; left out: unfinished imports, one that saved no words, one whose words were all skipped, all deleted or all set to Ignored (and listed again once a word is back in Learning), another learner's;
  - `PATCH /imports/:id`: trims, clears on blank or `null`, 100-character limit, 404;
  - sessions: an `import` session takes only that import's learning + learned words, at most 20; `importId` missing, unknown, not `done`, or sent with another source; `no_words` for an import without learning or learned words; `import_id` is stored; the options count is the most recent past import's;
  - `GET /words`: `importId` filters words and `counts`, `sort=newest` order, `addedAt` present, combined with `q` and `status`;
  - web: import labels (name, date, year, time only when unnamed imports share a day) and the day headings (Today, Yesterday, a date).
- No AI change.

#### M10: Add a word by hand
**Status (2026-10-19):** built (9a86d7f) and tested by the user on the iPhone. Fixes from that check: the hand form counts only when complete and Ask AI shows only the matching entry (9c25d78); the "added" line on Add words shows only right after a save (b82ff6a).

**Known rough edge (2026-10-19, left for later):** ≈6,000 dictionary entries are only spelling variants (*das Groß*: "alternative spelling of Gros"); they show up as suggestions and cards with that gloss as their translation. Fix: have the loader treat alt-of senses like form-of ones (a pointer "*Groß* is another spelling of **Gros**"), then reload the dictionary once.

Settled with the user on 2026-10-16; the behaviour is in `docs/design.md` §6.7, §7 (forms table, search), §9.3, §10 screens 2, 3, 14 and 15, §11.5 and §11.6:
- **Entry:** the New import screen, "or type a word" next to the photo drop zone.
- **One word or a list:** the learner types one German word or several (one per line). Either way the words are confirmed **one at a time** ("2 of 5"). A single word is saved on its own (`import_id = null`, no group); a list is saved as **one import**, so it is among the past imports (M9) and Done offers Practice these now and Name this import.
- **What the dictionary supplies:** genders, plural, forms, pronunciation, English glosses. A word with several entries (*See*: der See "lake" / die See "sea"; *morgen* / der Morgen; three *Band*s) shows each as a card with its gloss, and the learner picks the one or ones they mean.
- **Translation, three ways:** pick one of the dictionary's glosses (first; they are long, e.g. "dining table, dinner table", so the pick can be edited), **Ask AI** for a short one like an import's ("table"), or type it by hand.
- A word already in the list, in any status, is not added twice; the screen says so and links to it.
- Enrichment adds the example sentence (and any forms the dictionary lacks) as for imported words (§6.6).
- **Typos and word forms without AI** (the user, 2026-10-16), all from the Wiktionary table:
  - **while typing** (the single-word field): a suggestion list under the field, words starting with the typed letters (*Regensch* → *der Regenschirm · umbrella*), and the closest similar words when there are few or none;
  - **"Did you mean…?"**: a word the dictionary doesn't know, typed alone or from a pasted list, gets the most similar dictionary words at the top of its confirm step (*Regenschrim*, *Rgenschirm* → *Regenschirm*). Similarity through PostgreSQL's `pg_trgm` (available in the postgres:17 image, a trusted extension);
  - **inflected forms**: the dictionary loader keeps Wiktionary's form-of entries as a form → base word table, so *ging* → *gehen* and *Tische* → *Tisch* are found too (re-run `import:wiktionary`, ≈15 s).
  - The phone's own autocorrect stays on in the field. The AI is needed only for words the dictionary doesn't have (long compounds, rare words): **Ask AI** then also gives the base word, part of speech and article, or the learner fills them in by hand.
- **Not in M10:** finding a German word by typing English (My words' search already finds the learner's own words by English).
- **Ask AI limit** (the user, 2026-10-16): calls are recorded in `ai_usage` and capped by a simple daily count, 200 by default (a `.env` setting, counted like the photo limit, §11.5): a safety net, not a budget. When reached, Ask AI says so; the dictionary glosses and typing still work. Pricing comes later (see Later: AI for subscribers).
- **Confirming a typed list:** each word is **Add** or **Remove**. Remove saves nothing (the word was typed on purpose, so it isn't kept as `ignored`; a later import may offer it).
- **Photo Review wording** (the user, 2026-10-16): Skip really means "keep in my list as Ignored, never practise, never offer again" (§6.5), so the labels change, not the behaviour: each word's toggle is **Practice** / **Ignore**, the pills **Practice all** / **Ignore all**, and the texts follow ("8 to practise", "1 ignored; they won't be suggested again.", Done's "N ignored…" when nothing was added). The API keeps `action: add | skip`.
- The new AI call needs the `claude-api` skill, its prompt and recorded fixtures, and `pnpm test:live`.
- **Schema changes:** `imports.source`, `dictionary_forms`, the `pg_trgm` extension with a trigram index on `dictionary_entries`. After the migration the dictionary is imported once more (≈15 s) to fill the forms table; try both on a copy of the dev database first.
- **Tests first:**
  - dictionary import: the forms table from the sample file (the sample gains form-of entries such as *ging*, *Tische*, *aufgestanden*), forms equal to their base word left out, loading twice is idempotent;
  - search: suggestions by prefix (exact first, then shorter, ignoring case), topped up with similar words, at most 8, `inMyWords`; lookup's order (exact → forms → similar) and the similarity threshold; one view per gender;
  - `POST /words`: a new word from an entry gets its plural, forms and pronunciation (*die Bank* "bank" → *Banken*, not *Bänke*); a hand word gets its dictionary check; a reused word gets a custom translation only when it differs; a word already in the list is left alone; repeats count once; a stale `entryId` counts as by hand; at most 5;
  - `POST /imports/typed`: one `done` import with `source = typed`, listed among past imports and practisable; nothing added → `importId: null` and no import; enrichment runs (replayed) and skips the dictionary step for words that have their facts;
  - Call 3: the four recorded fixtures (entry translation, misspelt noun, inflected verb, English → 422 `not_german`), an `ai_usage` row as `describe`, the daily limit (429);
  - web: a typed list's lines (trim, repeats, the 30 limit), shortened glosses, Confirm word's steps (choose, translation, add, remove, back), the Practice / Ignore wording on Review and Done.

#### M11: Import from PDF
**Status (2026-10-23):** built and tested by the user on the iPhone: PDF pages 18–20 of the book, ≈189 words found. The 3 pages were read ≈50 s after the first was sent (each extract call 22–34 s, two at a time); that time is the AI writing out 60–90 words per dense page, not the rendering (≈3 s a page). If 10-page imports feel slow, PDF pages could be sent three or four at a time.

- The learner picks a PDF and a page range (e.g. 42–45) each time, so a whole book can stay one file. The chosen pages go through the photo flow: extract → merge → compare → dictionary check → review → save → enrichment.
- **Decided (the user, 2026-10-19):**
  - **Pages become images in the browser** (pdf.js) and go through the photo upload unchanged: each page is shrunk like a photo and sent as one JPEG. Cheaper per page than sending PDF pages to Claude (which bills each page as text *and* image), only the chosen pages leave the phone, and the extraction, merge, Retry, daily limit and Review code stay as they are. A digital page rendered sharply reads better than a phone photo.
  - **At most 10 pages** per import.
  - **No file-size limit:** Safari loads the PDF into the phone's memory. The user's book turned out to be 90 MB (a 215-page scan with JPEG 2000 images and an OCR text layer, made with ABBYY FineReader 11), and the iPhone handled it (below).
  - **The daily limit counts a page like a photo** (one AI call each); the message says "Daily page limit reached".
  - **The book is remembered on the phone:** the PDF is kept in the browser's storage (IndexedDB), so the next import starts at "Book.pdf · pages 42–45" with **Choose another PDF**. It stays on that phone only; clearing Safari's data removes it, Safari may clear it after 7 days without a visit, and Safari and a Home Screen icon keep separate storage. Then the learner simply picks the PDF again; nothing extra is built for it (the user, 2026-10-23).
  - **Automatic name:** without a typed name the import is called "Pages 42–45"; it can be renamed as usual (Done, Settings).
- The behaviour is in `docs/design.md` §6.8 and §10 screens 2 and 16 (plus §4, §5 `imports.source = pdf`, §9 `POST /imports { source }`, §11.5, §12 Import).
- **Check first:** the pdf.js version must run on the user's iOS Safari (the user's iPhone runs **iOS 18.7.2**, 2026-10-19) (recent `pdfjs-dist` releases use new JavaScript features; its `legacy` build is the fallback) and its worker must load from Vite over plain HTTP. Try rendering a page of the real book on the iPhone before building the screens.
  - **Done 2026-10-23,** with a throwaway probe page on the user's iPhone and the real book: `pdfjs-dist` 6.4.299's **legacy build** works on Safari 18.7.2; the modern one fails (`Map.prototype.getOrInsertComputed` and `Math.sumPrecise` are missing). The worker loads from Vite over plain HTTP, and nothing in pdf.js needs a secure context (`crypto.randomUUID` only when present, with a `getRandomValues` fallback). The 90 MB book was stored in IndexedDB as a Blob and read back after a reload; it opened with 215 pages, and page 1 rendered at 1153×1600 px (a 454 KB JPEG).
  - **Scanned pages are slow:** pdf.js's JPEG 2000 decoder needs WebAssembly relaxed SIMD, which Safari 18 lacks, so it falls back to plain JavaScript: ≈3.2 s per page at 1600 px, ≈1.6 s per thumbnail. So thumbnails are drawn one at a time and stale ones cancelled, pages are rendered one at a time for the import (sent at most two at a time, like photos), and nothing on PDF pages waits for them.
  - **Page numbers:** the book has no page labels, and its printed numbers can't be derived from the PDF's (PDF page 20 is printed 102, but PDF page 120 is the workbook's "AB 114"). The PDF's own numbers are used, with the hint "Page numbers of the PDF file, not the printed ones" and the thumbnails to confirm.
  - **The worker is started by the app**, so a failure shows instead of pdf.js silently running on the page.
- **Schema change:** none beyond accepting `pdf` as an `imports.source` value (a text column; no migration unless a check constraint exists).
- **No AI change:** pages go through Call 1 like photos; no new fixtures needed (an extra recorded fixture from a rendered PDF page is welcome but optional).
- **Tests first:**
  - web: a page range's validation (inside the book, From ≤ To, at most 10), the page labels used when present, the automatic name ("Pages 42–45", "Page 42"), the range suggested after the last import (46–49 after 42–45, clamped to the book's end), the photo-state reducer with PDF tiles (no Retake; Retry renders again), the book store with a fake IndexedDB (remember, replace, forget a broken entry, work without storage);
  - server: `POST /imports` with `source: "pdf"` (stored, listed with it in `GET /imports`), an unknown source rejected.

#### M12: Accounts and deployment (Vercel + Neon)
- **Decided (the user, 2026-10-23; database changed 2026-10-24):** the app is deployed on **Vercel** (Hobby; the web app as static files, the API as one Vercel Function) with the database on **Neon** (Free, PostgreSQL 17), both in Frankfurt, right after M11, so it works away from home Wi-Fi and the word list has backups before it grows. The Mac keeps `pnpm dev` and its own databases for development.
- **Compared on 2026-10-24** (the providers' own pages; Supabase was the first choice):
  - **Neon over Supabase:** Neon Free never pauses (Supabase Free pauses after 7 days of low activity), has 1 GB per project (Supabase 500 MB) and can restore any moment of the last 6 hours plus one manual snapshot (Supabase Free has no backups). A 7-day restore on Neon's pay-as-you-go Launch plan comes to ≈$1–2 a month for this app (worked out from its prices), against $25 for Supabase Pro. The cost: Neon's compute sleeps after 5 minutes without queries (not switchable on Free), so the first request after a break is slower (measured below).
  - **Not Netlify:** on its Free and Personal plans functions run in Ohio (Frankfurt only on Pro, $20 a month), so every query would cross the Atlantic; a function stops after 60 s (an extract takes up to 40 s); no Fastify adapter. It does allow commercial use on Free.
  - **Not Coolify on a Hetzner server:** ≈€24 a month (CPX22, €19.99 + VAT, the cheapest server that meets Coolify's minimum and can be ordered) plus a domain for HTTPS, and the server's upkeep; Coolify has had 21 critical security advisories since 2025, one in October 2026.
  - **Not a home server** (a Raspberry Pi 4/5 reached through Tailscale): free on hardware the user owns and private to their devices, but only up while the home's power and internet are, backups still have to leave the house, and paying subscribers' data couldn't live there.
  - Login services of the database providers (Supabase Auth, Neon's Managed Better Auth) didn't decide it: Better Auth itself (open source, MIT, with Fastify and Drizzle support) runs inside our own server on any database (see Open).
- **Limits** (official pages, 2026-10-23/24):
  - **Vercel Hobby:** "restricted to non-commercial personal use only" (Pro, $20 a month, once the app takes payments). A function runs at most 300 s with 2 GB / 1 vCPU; request and response bodies at most 4.5 MB; one function region (`fra1` allowed). A month includes 4 hours of Active CPU (time spent waiting for Claude doesn't count), 1M invocations and 100 GB of transfer; over a limit, Hobby waits for the next 30 days. 100 deployments a day. Password Protection is Pro only ($20 per project a month); Vercel Authentication on all deployments is included. `TZ` is a reserved variable.
  - **Neon Free:** 1 GB per project, 100 CU-hours a month (≈400 hours of the smallest compute), 5 GB of transfer; over a limit the compute is suspended until next month and the data is kept. Pooled connections through PgBouncer in transaction mode (the `-pooler` host); migrations and `pg_dump` use the direct one.
- **Check first, done 2026-10-24** with a throwaway Vercel project and a throwaway Neon project in Frankfurt (Postgres 17.11), deployed from a clean copy of the repo outside git; only the dictionary, no word list, no Anthropic key; the probe's files were not kept:
  - **Vercel's own packer doesn't work:** it compiles each `.ts` file on its own and leaves the extensionless imports (`../server/src/vercel`), which Node's ES module loader can't find (`ERR_MODULE_NOT_FOUND`), before `core/` even comes up. It would need `.js` on every import in `server/` and `core/`.
  - **The esbuild bundle works:** the build command runs `vite build`, then a script that bundles the API with esbuild (0.28, a dev dependency of `server`) into one 3.6 MB `index.mjs` (`core/` and every library inside; only `pg-native` left out; a `createRequire` banner for the CommonJS libraries) and writes Vercel's Build Output API folder: `.vercel/output/static` from `web/dist`, `functions/api.func` (`runtime: nodejs24.x`, `launcherType: Nodejs`, `maxDuration: 300`, region `fra1`) and the routes `/api/*` → the function, then the files, then `index.html`. Vercel uses that folder on an ordinary deploy; the build takes ≈10 s.
  - **The handler:** a module next to `main.ts` that does what `main.ts` does without `listen()`: config from the environment, `createDb`, the learner's language, `createClaudeAi`, `buildApp`, `await app.ready()` once per instance, then each request goes to Fastify (`app.server.emit("request", req, res)`). Fastify sees the original path (`/api/stats`), so the routes stay as they are. An instance started in 0.11 s (0.66 s while Neon was asleep).
  - **Worked on the preview:** health, stats, dictionary suggest and lookup (with forms), past imports, `POST /imports`, our 404; a 2 MB multipart photo reached the AI step (which failed for lack of a key, as intended); the web app, a deep link (`/words`) through the `index.html` fallback, pdf.js's wasm and fonts with their content types, the manifest.
  - **Speed from Berlin:** 0.13–0.3 s per API request, each with a new HTTPS connection. After 7 idle minutes the first request took 1.5 s (a new function instance and Neon waking up), the next ones 0.14 s.
  - **Neon:** migrations from the Mac 3.4 s; `CREATE EXTENSION pg_trgm` works as `neondb_owner` (into `public`); `import:wiktionary` 29.5 s over the internet (11 s locally); the database is 88 MB, as on the Mac. pnpm 11 installs on Vercel through Corepack (`ENABLE_EXPERIMENTAL_COREPACK=1` and `packageManager`).
  - **Found on the way:**
    - Vercel runs **Node 24** (24.21; 26 isn't offered) in **UTC**, and `TZ` can't be set: the daily limits' "server's local midnight" (§11.5) would be 01:00 or 02:00 in Berlin unless the day is counted in a configured time zone. `engines: ">=24"` draws a warning (it would move to the next major by itself): pin `24.x`.
    - Fastify's request ids restart in every function instance (`req-b`), so the "request <id>" in a 500 message no longer finds its log line; Vercel's own request id (`x-vercel-id`) does.
    - A project's first deployment becomes **production**, and Vercel's default protection leaves the production `*.vercel.app` address public: the probe's pages (no data, no key) were reachable for ≈3 minutes until protection was set to all deployments. In the real app our own gate protects the API; Vercel Authentication on everything would also keep out an iPhone not logged in to Vercel.
    - Neon's connection strings carry `channel_binding=require`; node-postgres takes them, with a warning that `sslmode=require` is treated as `verify-full`.
- **Settled after the check** (the user, 2026-10-24 and 2026-10-25). The behaviour is in `docs/design.md` §17 (accounts) and §18 (deployment); what the research found about Better Auth, Google sign-in and the rest is in §16, and the code that was tried plus the commands for the later steps in `docs/m12-research.md`:
  - **Accounts now,** with Better Auth inside our own server. An account signs in with its email or username and a password, or with Google. Sign-up asks for both an email and a username.
  - **Invite-only sign-up** (`SIGNUP_MODE=invite`): only emails on an invite list can create an account. The list lives in the database and is edited with `invite:add`. Its purpose isn't AI cost but data protection, bots, and someone signing up with another person's email. It goes once the email service and a privacy page exist; then `open`.
  - **AI is switched on per account.** It is off for new accounts, which can type words and practise. The user's own account is the developer account, with AI on.
  - **Deleting an account,** with all the learner's data, from Settings → Account.
  - **Passwords are reset by script** (`user:set-password`) until the email service exists; there is no "Forgot password" link.
  - **Google:**
    - A new invited email can sign up with Google directly.
    - Google is added to an existing account from Settings → Account, while signed in. Better Auth links automatically only to a verified email, and there is no email verification yet.
  - **The same Anthropic key** as on the Mac, with €5 of prepaid credit and no auto top-up, so nothing can spend more than €5. When the credit is used up, the app says "AI is unavailable right now".
  - **Production starts fresh;** the Mac's word list stays on the Mac.
  - **Backups:**
    - A GitHub Action every night: `pg_dump` without the dictionary, encrypted with `age` (only the user holds the private key), uploaded to a Cloudflare R2 bucket and kept 30 days.
    - Plus Neon Free's 6 hours of history.
    - Nothing runs on the Mac.
    - R2 will probably ask for a payment method, even within its free tier.
  - **Deploys:** GitHub Actions on every push to `main`: the checks (with a PostgreSQL service), then the Neon migrations, then the Vercel deploy. No preview deployments; migrations only add.
  - **Plans:**
    - Vercel Hobby and Neon Free, both in Frankfurt. Neon's autoscaling is capped at 1 CU (set by the user on 2026-10-25).
    - Vercel Pro once the app takes payments.
    - The daily limits count their day in Europe/Berlin.
  - **The address:** `dingsda.vercel.app`, from the working name (Part 2 context, Name). `language-app`, `words-app`, `deutsch-words` and `wortschatz-app` were taken; `dingsda` was free on 2026-10-26, and the user created the Vercel project that day (`npx -y vercel@48.0.0 project add dingsda`, under the `lazy-pixel` scope): it holds the address with no deployment, and nothing is linked in the repo until M12.4. The Vercel CLI isn't installed on the Mac; it runs through `npx -y vercel@<version>`.
  - **Not in M12:** the email service, open sign-up and the privacy page; push notifications; changing a username; a second, independent backup copy; Neon's paid history.
- **Steps.** Each has tests first, the checks, its demo, a commit, and the user's review:

| Step | Content | Demo |
|---|---|---|
| M12.1 Sign-in | Better Auth (password, username), its tables and the new `users` columns, `invites`; the session hook on every route (`SINGLE_USER_ID` goes); the AI client's language per call; Sign in and Create account; Sign out (a first Account screen); `user:claim`, `invite:add` / `list` / `remove`. Tried first on a copy of the dev database (worktree pattern) | On the iPhone over the LAN: signed out, the app shows Sign in; signed in as yourself, your word list; an invited test email creates an empty account in another browser; an email not on the list is refused |
| M12.2 AI switch and account | `ai_enabled` on the server and in the screens; typed words without AI; the Account screen; deleting an account (cascades); `user:set-password`, `user:ai`; the used-up credit (503 `ai_unavailable`); the daily limits' day in `APP_TIME_ZONE` | The test account sees no photo import and no Ask AI, yours does; the test account is deleted, its data is gone and yours is untouched |
| M12.3 Google | The Google Cloud project and OAuth client (return address `http://localhost:5173` now, production added in M12.4), the provider, Continue with Google, Connect in Account. Tested in the Mac's own browser on `localhost` (Google refuses LAN addresses, so the iPhone over the LAN keeps the password) | On the Mac: Google sign-in for an invited test email creates its account; Google connected to your account; an email not on the list is refused |
| M12.4 Deployment | The build script and handler (from the check), `vercel.json`, the Vercel project under its name with its variables; Neon reset (password, migrations, dictionary) and `user:claim` there; the GitHub Actions checks and deploy; production's Google return address. **Check first:** Google sign-in inside the Home Screen app on the iPhone (if it doesn't come back into the app, the Home Screen app offers the password only) | **The M12 demo:** away from home Wi-Fi, the iPhone opens `https://dingsda.vercel.app`, signs in, imports a photo and practises its words; Google sign-in there, in Safari and in the Home Screen app |
| M12.5 Backups | The R2 bucket (30-day rule) and its token, the `age` key pair, the read-only `backup` role, `backup.yml`, `backup:restore` | The first night's backup in R2; a restore into a fresh local database matches Neon's row counts |

- **M12.1 built (2026-10-25)** on Better Auth 1.7.7, as designed; the behaviour moved from `docs/design.md` §17 into §4 Accounts, §5, §9.4, §10 (screens 17–19), §12–§14. Beyond the design:
  - **The rate limits count per device on the Mac:** Better Auth reads the client's address from headers only, so without one the whole home network would share one count. Vite's proxy now adds it (`xfwd`) and the server trusts the loopback hop.
  - **The server requires a username on sign-up** (400 `USERNAME_REQUIRED`) and sets `name` from it, rather than relying on the client.
  - **`invites.user_id` cascades** from `users`, so deleting an account (M12.2) removes its invite, as §17.7 asks.
  - **`demo:import` signs in first:** `--user <email|username>`, with the password asked for or piped in.
  - **Demoed on the iPhone on 2026-10-26:** user 1 claimed on the Mac's database, a test account made from an invite, Sign out. Until M12.2, `ai_enabled` is stored but not enforced, so an invited account can still use the AI routes on the developer's key: no one else is invited before M12.2.
  - **Left for M12.2 or later:** sign-in and sign-up answers carry the session token in their body (Better Auth's default; the web app ignores it); the mount could strip it.
- **M12.2 built (2026-10-26)**, as designed and with no new migration (the cascades of 0006 cover every table an account owns); the behaviour moved from `docs/design.md` §17 into §2, §4 Accounts (the AI switch, deleting an account), §5, §6.6–§6.7, §9, §9.4, §10, §11.1, §11.5, §12–§14. Beyond the design:
  - **Better Auth deletes an account without its password** when the sign-in is less than a day old, even an account that has one. A hook now asks such an account for its password (400 `PASSWORD_REQUIRED`), so a signed-in phone in someone else's hands can't delete it. `/delete-user` has the sign-in rate limit too.
  - **An invite for the account's email that was never linked to it** (added again later) is removed with the account too (`afterDelete`); the linked one goes with the cascade.
  - **Saving without AI copies the dictionary's facts** (enrichment's first step) and makes no AI call: also for a word entered by hand, and for an import begun before AI was switched off (`POST /imports/:id/save`, which isn't refused). `enriched_at` stays null, so a later account with AI fills the shared word in.
  - **The screens without AI go further than New import, Confirm word, Done and Home:** cards and Word detail show no "Details pending" / "Use Add details on Home" (`cardBack(word, { aiEnabled })`), saving says "Saving…" rather than "Adding details…", Done's second button is always **Type more words** and it doesn't announce example sentences, Home's empty-list hint speaks of typing, and an Import screen of an earlier import has no **Add more photos**. `/imports/new` and `/imports/new/pdf` redirect to Add words, whose back button then goes Home.
  - **Account reads the sign-in methods** (`GET /api/auth/list-accounts`) to know whether Delete account asks for a password, and shows the Password row only when there is one: ready for Google in M12.3.
  - **Shared UI:** Delete word's in-place confirmation became the `ConfirmDelete` component (with optional fields, used by Delete account), and Create account's muted line under the title became `ui.lead` (also Add words' note); `docs/design-system/` updated.
  - **The used-up credit's fixtures are written, not recorded** (it can't be provoked): `server/test/fixtures/ai/error-credit-balance-too-low.json` and `error-billing.json`, answered to the real SDK by a fake `fetch`, so the test also proves the SDK sends one request. The SDK would still retry a 400/402 if the API sent `x-should-retry: true`; it isn't expected to.
  - **Tests run user 1 with AI on** (the test database's reset sets it), as the developer account has it.
  - **Left for later:** Add details with the credit used up still answers 200 with the words pending (its toast says "Some words still have no details. Try again later." rather than "AI is unavailable right now"); a Google-only account whose sign-in is a day old is told to sign out and in again (M12.3 can offer Google there); the session token in sign-in bodies (unchanged).
  - **Tried on a copy of the dev database** (worktree on ports 3100/5180): the AI routes 403 for the test account and not for the developer's, `user:ai` and `user:set-password` on the next request, typed words without an `ai_usage` row, and Delete account from the iPhone-sized screen in headless Chrome, after which every cascaded table had 0 rows for that account and user 1's counts were unchanged.
- **M12.3 built (2026-10-26)**, as designed and with no new migration; the behaviour moved from `docs/design.md` §17 into §2, §4 Accounts (Google), §5, §9, §9.4, §10 (screens 17–19), §12–§14 and §16, and the button into the design system (`GoogleButton`, the `google-*` tokens). Beyond the design:
  - **The invite check runs only when an account is created** (`validateUserInfo`'s `create-user`). M12.1's ran on everything but `sign-in`, so Connect and the developer account's first Google sign-in (both `link-account` in Better Auth) would have come back `not_invited`; a test proves it.
  - **The developer account links Google by itself** on its first Google sign-in with its own Gmail (its email is verified since `user:claim`, and Google says Google's is), with no invite: accepted as §17.2 allowed. Password sign-ups still get `account_not_linked` and use Connect.
  - **"Is Google offered" is `GET /api/sign-in-options`** (`{ google }`, open like `/api/health`), asked by the web app together with the session when it starts. The buttons show only with the pair and on https or `localhost` (so not on `127.0.0.1`, a LAN address or `*.local`); Account shows a connected Google everywhere.
  - **Usernames from the email:** before a `+tag`, lower-case, accents dropped, `ß` → `ss`, other characters → `_`, `user` when nothing is left; a taken or too short name gets the first free number from 2 (`jo` → `jo2`). `name` and `display_username` are the same.
  - **Google's account chooser every time** (`prompt=select_account`), so the demo can switch from a refused Google account to the invited one; the Google-only account's **Sign in with Google** before deleting preselects its own (`loginHint`).
  - **`/sign-in/social` is limited to 10 a minute per address:** Better Auth's built-in rule for every `/sign-in` path (3 per 10 s) tripped over a few tries in a row on the Mac, whose own browser shares one count.
  - **Google's `?error=` is read once and taken out of the address** (keeping `next`), so a reload doesn't repeat it; cancelling on Google's page (`access_denied`) has its own line, every other code a generic one.
  - **The button uses DM Sans, not Google Sans** (Google's own buttons' font; the app fetches no font from another site); mark, colours, label and spacing follow Google's rules (§16).
  - **Google is faked at the network edge in tests:** Better Auth 1.7.7 checks no signature on the id token it gets from the token endpoint, and that `POST https://oauth2.googleapis.com/token` is its only request, through `globalThis.fetch`; the tests replace it and refuse any other address.
  - **Tried on a copy of the dev database** (worktree on ports 3100/5180, a dummy client id): Google's address through Vite's proxy (`redirect_uri` `http://localhost:5180/api/auth/callback/google`, following the host), a cancelled round trip back to `/signin?next=…&error=access_denied`, and the screens in headless Chrome (Sign in with each error, Create account, 127.0.0.1 without the button, Account with Connect, Connected and a Google-only account's day-old sign-in). The real round trip with Google is the demo, on the Mac with the user's client.
  - **Left for later:** disconnecting Google (there is no Disconnect); Google's access and id tokens are stored as Better Auth keeps them (unencrypted, unused; `account.encryptOAuthTokens` could be switched on); two Google sign-ups with the same local part at the same moment could pick the same username, and the second then gets "Couldn't sign in with Google. Try again." (a retry works). The first two were settled in M12.3b, below.
- **M12.3b (2026-10-26)**, a follow-up to M12.3 with no new table or column; the behaviour is in `docs/design.md` §4 Accounts (Google), §5, §9.4, §10 screen 19, §12, §13 and §16.
  - **The user's decisions:** Google's tokens are not kept (every write of a Google sign-in method leaves the token columns empty, and the stored ones are cleared; encryption was considered and rejected: nothing to leak, back up or decrypt). **Disconnect** on Account for an account with a password; a Google-only account's row just shows "Connected" (`allowUnlinkingAll` stays off). Implicit linking stays on, so after Disconnect the developer account's next Continue with Google connects Google again; password sign-ups still get `account_not_linked`.
  - **Built:** database hooks on `account` create and update that empty the five token columns (never the password row's); `account.storeAccountCookie: false`; `/get-access-token`, `/refresh-token` and `/account-info` switched off; the migration `0007_clear-oauth-tokens.sql` (custom, idempotent, harmless on an empty database; on a copy of the dev database it emptied user 1's Google row and left every other column of both rows as it was); `unlinkAccount` and its schemas in `core/`, `emailVerified` in the session's account; Account's Google row in three states (Connected with **Disconnect**, Connected only with a grey note, Connect), Disconnect's busy state, a grey line when done (for a verified email: "Continue with Google still signs in to this account and connects it again."), its errors in red.
  - **Beyond the design:**
    - **`/unlink-account` takes `{ accountId }`, the sign-in method's row id from `list-accounts`,** not `{ providerId: "google" }` (gone in Better Auth 1.7; `VALIDATION_ERROR`).
    - **Disconnect needs a sign-in made within the last day** (403 `SESSION_NOT_FRESH`): a phone signed in weeks ago is told to sign out and in again first.
    - **The password can't be removed through the API** (400 `CANNOT_UNLINK_PASSWORD`, our hook): Better Auth would allow it next to Google, and the account could then be deleted without a password from a sign-in under a day old, the hole M12.2's `PASSWORD_REQUIRED` closes.
    - **Until now `/get-access-token` handed a signed-in browser its Google access token,** and `/account-info` Google's profile from the stored id token.
    - **No confirmation before Disconnect:** Connect undoes it.
  - **Tried on a copy of the dev database** (worktree on ports 3100/5180, dummy Google client): the migration; `unlink-account` with curl (a password account's Google 200, a Google-only account 400 `FAILED_TO_UNLINK_LAST_ACCOUNT`, the password row 400 `CANNOT_UNLINK_PASSWORD`, no session 401, `{ providerId }` 400) and the switched-off endpoints (404); the screens in headless Chrome, light and dark.
  - **Left for later:** disconnecting from a sign-in older than a day without signing out (a password asked for in place would need an endpoint of our own); the iPhone over the LAN can disconnect but not connect again (Google isn't offered there).
- **M12.4 code built (2026-10-26),** the half of the step that can be proven on the Mac without an outside account; going live is the runbook in `docs/design.md` §18.8. The behaviour is in §4 Accounts, §12, §13, §14, §16, §17 and §18.2–§18.4. Decisions and deviations:
  - **Node 24 without `engines: "24.x"`:** it is pinned where it runs, the function by `.vc-config.json` (`nodejs24.x`) and the build by the runner's `actions/setup-node`. `engines.node` stays `>=24`: with `24.x`, pnpm 11 prints "Unsupported engine" on every command on the Mac's Node 26 (it doesn't fail: `engine-strict` is off and there is no `.npmrc`). The cost is one warning line in `vercel build`.
  - **The client-IP header is `x-vercel-forwarded-for`,** read alone in production (Vercel's docs quoted in §16). Whether Vercel also overwrites a forged one is checked going live (§18.8 step 6), with `x-real-ip` as the fallback.
  - **The CI deploy:** `vercel pull`, `vercel build --prod`, then `pnpm db:migrate`, then `vercel deploy --prebuilt --prod`, with Vercel CLI 63.1.2 installed on the runner. The migration moved after the build (the design had it first), so a failed build leaves Neon alone. `vercel build` ran offline on the Mac and keeps our `.vercel/output` (adding an error phase to `config.json`); `--prebuilt` needs nothing else (no `builds.json`).
  - **Production follows `BETTER_AUTH_URL` alone** (https, nothing after the host): the Vercel Function refuses to start without it, `DATABASE_URL` or `BETTER_AUTH_SECRET`, and the Mac's server refuses to start with it. `NODE_ENV` isn't needed on Vercel.
  - **One setup** (`server/src/setup.ts`, `createServer(config, platform)`) for `main.ts` and `vercel.ts`; `attachDatabasePool` comes from `@vercel/functions/db-connections` (3.9.11; 3.10 was under two weeks old), which keeps the package's OIDC code out of the bundle. esbuild is 0.28.2.
  - **`@opentelemetry/api` stays out of the bundle** with `pg-native`: Better Auth only tries it. The build refuses any other import that isn't Node's own.
  - **The bundle test is `pnpm test:bundle`** (the build, then Vitest on the test database, ≈6 s), not part of `pnpm test`; CI runs both. The function runs under plain Node through `serve:vercel` with production's variables only.
  - **Found and fixed: a browser's sign-in by username wasn't origin-checked before it had a cookie** (since M12.1, the Mac too). Better Auth guards `/sign-in/email` and `/sign-up/email` with `formCsrfMiddleware`, but not the username plugin's endpoint; our `hooks.before` now runs it there. Hard to exploit through a browser, but production is on the internet.
  - **Measured:** the bundle 5.2 MB (the probe's 3.6 MB had no Better Auth), built in 0.4 s (≈2 s with the web build); the function starts in ≈0.15 s from the bundle on the Mac.
  - **Rehearsed** on a fresh local database standing in for Neon, with §18.8's commands: migrations 1.3 s (`pg_trgm` created), the dictionary 15 s, the reset SQL and the migrations again, `invite:add`, `user:claim` (a piped throwaway password). The built function, with production's variables: health, 401 without a session, sign-in by username (`__Secure-better-auth.session_token; … Secure`, 0.11 s), stats, get-session, a dictionary suggestion, 403 from another origin, a forged `x-forwarded-for` and `x-real-ip` ignored (the rate limits counted `x-vercel-forwarded-for`'s address), its own 404, and `x-vercel-id` as the log's request id.
  - **Left for going live** (§18.8): the Neon reset and its strings; migrations, the dictionary and `user:claim` on Neon; `vercel link`, production's variables and the protection check; Google's production return address; the first deployment from the Mac and its checks (the forged-address check, the M12 demo, Google in the Home Screen app); the GitHub secrets, the push, the CI run and the failing-check trial on a branch.

- **Tests first:**
  - **M12.1:**
    - **Auth setup:** Better Auth's schema check passes on the migrated test database (otherwise every auth request fails); the migration adds the columns and tables and leaves user 1's data alone.
    - **Sign-up:**
      - An invited email gets an account: username stored lower-case and as typed in `display_username`, `ai_enabled` false, languages `en` / `de`. It is signed in, and the invite is marked used.
      - An email not on the list gets 403 `not_invited` and no account; with `SIGNUP_MODE=open` there is no check.
      - A taken username or email, the username rules (length, characters), and the password length are refused.
    - **Sign-in:** by email and by username, in any case. A wrong password gets 401, with the same answer as an unknown name. Sign-out ends the session.
    - **Every route** except `/api/health` and `/api/auth/*` answers 401 `unauthorized` without a session (one table-driven test over all routes). The existing route tests run as a signed-in learner, through a test helper, and another learner's ids still answer 404.
    - **Protection:** a POST from an untrusted origin gets 403; with rate limiting on in that test, the 6th sign-in attempt within a minute gets 429.
    - **Scripts:** `user:claim` gives user 1 its email, username, password, `email_verified` and AI, after which it can sign in; `invite:add` trims and lower-cases, and adding the same email again is harmless; `invite:remove`.
    - **AI language:** the AI calls get the learner's language from the session, not from startup.
    - **core:** the auth calls and their schemas (ids as strings); Better Auth's error body becomes an `ApiClientError`; 401 becomes `unauthorized`.
    - **web:** the sign-in field picks email or username by the `@`; a signed-out page goes to Sign in and comes back to `next`; Create account's field rules; the wording for each error code.
  - **M12.2:**
    - Every AI route answers 403 `ai_not_enabled` without AI, and is unchanged with it.
    - Typed words without AI are saved with no AI call; they show the shared word's example when there is one; `detailsPending` is 0.
    - **Deleting an account:**
      - removes its imports, words in the list, sessions, answers, AI usage, sign-ins, sign-in methods and invite;
      - leaves shared words and other learners untouched;
      - refuses a wrong password, and a Google-only account whose sign-in is more than a day old.
    - `user:set-password` (the new password works, old sessions end); `user:ai`.
    - **The used-up credit,** both forms built from a recorded response (400 with "credit balance is too low", and 402 `billing_error`): 503 `ai_unavailable`, not retried, recorded in `ai_usage`.
    - **The daily limits' day** in `APP_TIME_ZONE`, with the server in UTC: calls at 23:30 and 00:30 Berlin time.
    - **web:** the screens without AI (New import, Confirm word, Done, Home), the Account screen's states, the delete confirmation.
  - **M12.3,** with Google's endpoints faked:
    - an invited email signs up with Google: email verified, username made from the email, unique;
    - an email not on the list comes back with `error=not_invited`;
    - an existing password account with the same email gets `account_not_linked`;
    - Connect, while signed in, links Google;
    - the wording for the callback's errors on Sign in.
  - **M12.3b,** with Google's endpoints faked: no token stored after a Google sign-up, a second sign-in, Connect and the implicit link, and sign-in still works; the migration clears them and leaves password rows alone, harmless on an empty table; Disconnect for a password account, refused for a Google-only one and without a session, and Continue with Google afterwards (verified email linked again, unverified `account_not_linked`); the switched-off endpoints; the Google row's states and Disconnect's wording.
  - **M12.4:**
    - The build script writes `.vercel/output` with the static files, the function and the routes, and no import of a workspace package is left in the bundle.
    - The bundled handler answers `/api/health`, refuses an unsigned request and serves a signed-in one against the test database (run in CI).
    - A 500's message carries `x-vercel-id` when present.
    - The CI workflow is green on a clean push, and a failing check stops the deploy (tried once on a branch).
  - **M12.5:** the restore drill (the demo); `backup:restore` refuses a database that isn't empty.

#### M13: Themes and own groups
- **Themes:** a built-in list (about 20–30: weather, home, food, family, travel, body, clothes…), chosen with the user at the start of the milestone. The AI picks a word's themes from this list only, during extraction (call 1), so they appear on the Review screen, where the learner corrects them. They can also be changed later on the word's screens.
- The words already in the list get themes once, from a backfill run (a small AI call, like the pronunciation backfill).
- **Own groups:** the learner creates, renames, deletes and fills them by hand (e.g. "Lesson 4", "Hard ones"); the AI never uses them. A word can be in several themes and groups.
- **Adding words to a group:** the learner selects several words (in My words) and creates a group from them or adds them to one (the user, 2026-10-16). A single word typed by hand (M10) belongs to no group until then.
- **Open:** whether the AI's themes live on the shared `words` row with the learner's corrections per learner, or per learner only; how many themes per word; whether a word's own screens can also change its groups.

### Phase 2: practice

#### M14: Filters and practice builder
- One set of filters, freely combined, used by both My words and Practice: theme, own group, part of speech, gender (der / die / das), plural-only nouns (*die Eltern*), import, date added; My words keeps its status tabs.
- **Practice setup:** the three current sources stay as presets, so a session still starts in two taps (§1); a custom choice builds a session from any combination of filters and shows how many words match while it changes.
- M9 built the import choice as single menus (My words' view menu, Practice's Import card); this milestone turns them into the combinable filters.
- **Open:** plural-only nouns need a flag (their dictionary entries have no gender, §6.3); choosing the session size (now 20); saving a custom combination.

#### M15: Card modes
- **English → German** (today's card); **German → English** (the German word with its IPA and speaker button on the front, the translation on the back); **articles** (*Tisch* → der / die / das, answered by tapping one of three buttons and graded by the app); **plurals** (*der Tisch* → *die Tische*); **verb forms** (*gehen* → *ging · ist gegangen*).
- A mode only takes the words it fits: articles and plurals need nouns with an article or a plural, verb forms need verbs with forms. The mode is chosen in Practice setup next to the words.
- **Open:** progress per mode or shared (is a word learned once it is known English → German, or separately per mode?), to be settled before M16; how an app-graded mode fits the swipe flow.

#### M16: Spaced repetition
- The app schedules each word for the day it is due, from its answers. Practice gets a **Due today** preset; Home shows how many are due.
- **Open:** the algorithm (FSRS, as in current Anki, or the simpler SM-2); per word or per word and mode (follows from M15); whether it replaces "3 right in a row → learned" (§8.5); seeding the schedule from the answers recorded since M7; how the self-graded swipes map to the algorithm's grades.

#### M17: Progress over time
- A daily goal, a streak of days on which it was met, and a history (cards answered and words learned per day and week). The base for gamification (Later).
- **Open:** what the goal counts (cards answered, due words cleared, minutes); whose midnight counts (the phone's time zone, not the server's); whether Basics practice counts.

### Phase 3: basics

#### M18: Basics and the alphabet
- **Basics** is a new section reached from Home: topics that are the same for every learner, each with an explanation page and a practice of its own. Topics are never mixed in one session. The structure is built once, so the grammar topics of §15 can reuse it later.
- **Alphabet:** a reference page with every letter, Ä Ö Ü ß and the combinations ch, sch, ei, ie, eu / äu, sp / st, each with its transcription (IPA) and a recording. Letter practice as two-sided flip cards like the word cards, or as one-sided cards shown one by one (letter, transcription and sound on one face). Self-graded, no microphone.
- **Open:** where the content lives (written once and checked by hand: data in `core/`, or the database); where the recordings come from (Commons recordings of the letter names, example words with dictionary recordings such as *ich* and *Buch* for ch, or text-to-speech from M19); whether letter answers are recorded as progress.

#### M19: Text-to-speech
- German audio generated once per text, stored, and played like the Wiktionary recordings. Numbers and time need it: no recordings exist for "siebenundzwanzig" or "Viertel vor vier". Example sentences and words without a recording can use it too.
- §15 has the research: Azure Neural TTS first (its free tier covers this; a slower version through SSML), Google Chirp 3 HD or ElevenLabs as alternatives.
- **Open:** where the audio files are stored (object storage, since the deployed server has no disk of its own, M12); generated on demand or in advance.

#### M20: Numbers
- An explanation page (how German numbers are built: einundzwanzig, hundert, tausend…), then practice in three separate modes: flip cards (27 → siebenundzwanzig), typed answers (see 27, type the German; the app checks it) and listening (hear the number, type the digits).
- The numbers are generated by the app (a pure number → words function in `core/`), not imported.
- **Open:** the ranges (to 20, to 100, to 1000, years such as neunzehnhundertneunundneunzig, ordinals); how strict the typed check is (ß / ss, umlauts typed as ae / oe / ue, spaces, capitals).

#### M21: Time
- The same structure as Numbers, as a separate topic: an explanation (official 24-hour time, "fünfzehn Uhr fünfundvierzig"; everyday time, "Viertel vor vier", "halb vier", vor / nach), then practice in which the prompt is words, sound or digits and the learner answers.
- A time has several right answers; a typed answer is accepted when it matches any of them (generated in `core/`).
- **Open:** regional forms (*viertel vier*, *dreiviertel vier*) accepted or not; which minutes are asked (five-minute steps first).

### Later

In this order, after M21:
- **Open sign-up** (the user, 2026-10-25): the email service (needs its own domain; verification, password reset), a privacy page (and whether an Impressum is needed), then `SIGNUP_MODE=open` (`docs/design.md` §4 Accounts).
- **Push notifications** built on practice behaviour (the user, 2026-10-25): Home Screen app, HTTPS, a service worker, the learner's consent. Starts with HTTPS on the LAN (mkcert, `docs/design.md` §18.7), so the iPhone is a secure context during development.
- **Gamification:** points for practice and something to spend them on; builds on M17.
- **AI for subscribers** (the user, 2026-10-16): the AI features become paid, for subscribers only (which ones exactly, e.g. whether photo import and enrichment too, is open); a subscription turns the account's AI switch on (`docs/design.md` §4 Accounts, the AI switch). Vercel Pro from then on (Hobby is non-commercial). Price them from real `ai_usage` numbers per learner. The model decides most of it: 50 Ask AI calls a day for 30 days cost ≈ 15¢ on Haiku 5.5 but ≈ $15 on Opus 5.5, and a photo page ≈ 0.2–0.4¢ vs 5–8¢ (§11.4).
- **New example sentence** (the user, 2026-10-25): **New example** on Word detail's Example card, for AI accounts: one small AI call for that word (≈0.01¢ on Haiku), given the current sentence so it changes, counted under a daily limit like Ask AI. The sentence is stored on the learner's own `user_words` row, like their own translation, and shown instead of the shared one, so other learners' cards don't change; **Use the original** goes back. Accounts without AI could type their own example in Edit word.
- **Someday:** export of the word list (CSV, Anki), and the items of §15 not chosen yet.

## Verification (every milestone)
1. `pnpm test`, `pnpm typecheck` and `pnpm check` pass. `pnpm test` never calls Claude.
2. Run the milestone's demo; the iPhone demos are on the same Wi-Fi at `http://<Mac IP>:5173`.
3. From M2 on: `pnpm test:live` before committing any change under `server/src/ai` (about 25¢).
4. Commit, then stop for the user's review.
