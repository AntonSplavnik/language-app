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

The prototype (M0–M8) and its redesign (`docs/redesign/`) are built. On 2026-10-14 the user listed the features to add next and agreed the order below. Each milestone is described here only as far as it has been decided. A milestone starts by writing its section of `docs/design.md`, settling the open questions listed with it together with the user; then it follows the usual workflow (CLAUDE.md): test-first, the demo, the user's check on the iPhone, a commit.

Milestones that change a prompt or an AI call (M10, M11, M12) load the `claude-api` skill first, re-record the affected fixtures and run `pnpm test:live`.

| # | Milestone | Demo |
|---|---|---|
| M9 | Past imports, date added | In Practice, pick an old import and practise only its words; filter My words to it; name an import on Done and rename it in Settings |
| M10 | Add a word by hand | Type *Regenschirm*, confirm the filled details, find it in My words; type three words as a list, confirm them one by one, practise them as an import |
| M11 | Import from PDF | Pages 42–45 of a book PDF → review → save |
| M12 | Themes and own groups | Correct a theme in review; make a group "Hard ones"; the existing words have themes |
| M13 | Filters and practice builder | Practise "verbs from Weather"; filter My words to *die* nouns |
| M14 | Card modes | An article session and a German → English session |
| M15 | Spaced repetition | Home shows the words due today; a "Due today" session |
| M16 | Progress over time | Daily goal, streak and history after a few days of practice |
| M17 | Basics and the alphabet | The alphabet page with sounds; a letter card session |
| M18 | Text-to-speech | A generated recording plays on the iPhone |
| M19 | Numbers | The explanation, then a listen-and-type session |
| M20 | Time | The explanation, then a typed session that accepts both "Viertel vor vier" and "fünfzehn Uhr fünfundvierzig" |

### Phase 1: words

#### M9: Past imports and date added
Settled with the user on 2026-10-15; the behaviour is in `docs/design.md` §5, §8.1, §9, §9.2 and §10 (screens 1, 3, 4, 7 and 10–13).
- **Past imports are reached where they are used** (no Imports screen on Home or in My words):
  - **Practice setup:** the `last_import` source becomes `import`, a card with a menu of the past imports (newest first, so the latest is the default and starting still takes two taps). Up to 20 words, shuffled, as before.
  - **My words:** a view menu under the search: All words · A–Z, All words · Newest first (grouped by day), or one import.
  - **Settings** (new, a gear on Home) → **Imports** → one import → **Rename** (a sheet like Edit word). Settings is a menu, so later settings (M16's daily goal) join it, and later actions on an import join the import's page. Changed from rename-in-place during the user's check on 2026-10-16.
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
- The learner picks a PDF and a page range (e.g. 42–45) each time, so a whole book can stay one file. The chosen pages go through the photo flow: extract → merge → compare → dictionary check → review → save → enrichment.
- **Decided (the user, 2026-10-19):**
  - **Pages become images in the browser** (pdf.js) and go through the photo upload unchanged: each page is shrunk like a photo and sent as one JPEG. Cheaper per page than sending PDF pages to Claude (which bills each page as text *and* image), only the chosen pages leave the phone, and the extraction, merge, Retry, daily limit and Review code stay as they are. A digital page rendered sharply reads better than a phone photo.
  - **At most 10 pages** per import.
  - **No file-size limit:** the user's book PDF is under 50 MB; Safari loads it into the phone's memory, so a much bigger file is checked on the phone first.
  - **The daily limit counts a page like a photo** (one AI call each); the message says "Daily page limit reached".
  - **The book is remembered on the phone:** the PDF is kept in the browser's storage (IndexedDB, under 50 MB), so the next import starts at "Book.pdf · pages 42–45" with **Choose another PDF**. It stays on that phone only; clearing Safari's data removes it.
  - **Automatic name:** without a typed name the import is called "Pages 42–45"; it can be renamed as usual (Done, Settings).
- The behaviour is in `docs/design.md` §6.8 and §10 screens 2 and 16 (plus §4, §5 `imports.source = pdf`, §9 `POST /imports { source }`, §11.5, §12 Import).
- **Check first:** the pdf.js version must run on the user's iOS Safari (recent `pdfjs-dist` releases use new JavaScript features; its `legacy` build is the fallback) and its worker must load from Vite over plain HTTP. Try rendering a page of the real book on the iPhone before building the screens.
- **Schema change:** none beyond accepting `pdf` as an `imports.source` value (a text column; no migration unless a check constraint exists).
- **No AI change:** pages go through Call 1 like photos; no new fixtures needed (an extra recorded fixture from a rendered PDF page is welcome but optional).
- **Tests first:**
  - web: a page range's validation (inside the book, From ≤ To, at most 10), the page labels used when present, the automatic name ("Pages 42–45", "Page 42"), the range suggested after the last import (46–49 after 42–45, clamped to the book's end), the photo-state reducer with PDF tiles (no Retake; Retry renders again), the book store with a fake IndexedDB (remember, replace, forget a broken entry, work without storage);
  - server: `POST /imports` with `source: "pdf"` (stored, listed with it in `GET /imports`), an unknown source rejected.


#### M12: Themes and own groups
- **Themes:** a built-in list (about 20–30: weather, home, food, family, travel, body, clothes…), chosen with the user at the start of the milestone. The AI picks a word's themes from this list only, during extraction (call 1), so they appear on the Review screen, where the learner corrects them. They can also be changed later on the word's screens.
- The words already in the list get themes once, from a backfill run (a small AI call, like the pronunciation backfill).
- **Own groups:** the learner creates, renames, deletes and fills them by hand (e.g. "Lesson 4", "Hard ones"); the AI never uses them. A word can be in several themes and groups.
- **Adding words to a group:** the learner selects several words (in My words) and creates a group from them or adds them to one (the user, 2026-10-16). A single word typed by hand (M10) belongs to no group until then.
- **Open:** whether the AI's themes live on the shared `words` row with the learner's corrections per learner, or per learner only; how many themes per word; whether a word's own screens can also change its groups.

### Phase 2: practice

#### M13: Filters and practice builder
- One set of filters, freely combined, used by both My words and Practice: theme, own group, part of speech, gender (der / die / das), plural-only nouns (*die Eltern*), import, date added; My words keeps its status tabs.
- **Practice setup:** the three current sources stay as presets, so a session still starts in two taps (§1); a custom choice builds a session from any combination of filters and shows how many words match while it changes.
- M9 built the import choice as single menus (My words' view menu, Practice's Import card); this milestone turns them into the combinable filters.
- **Open:** plural-only nouns need a flag (their dictionary entries have no gender, §6.3); choosing the session size (now 20); saving a custom combination.

#### M14: Card modes
- **English → German** (today's card); **German → English** (the German word with its IPA and speaker button on the front, the translation on the back); **articles** (*Tisch* → der / die / das, answered by tapping one of three buttons and graded by the app); **plurals** (*der Tisch* → *die Tische*); **verb forms** (*gehen* → *ging · ist gegangen*).
- A mode only takes the words it fits: articles and plurals need nouns with an article or a plural, verb forms need verbs with forms. The mode is chosen in Practice setup next to the words.
- **Open:** progress per mode or shared (is a word learned once it is known English → German, or separately per mode?), to be settled before M15; how an app-graded mode fits the swipe flow.

#### M15: Spaced repetition
- The app schedules each word for the day it is due, from its answers. Practice gets a **Due today** preset; Home shows how many are due.
- **Open:** the algorithm (FSRS, as in current Anki, or the simpler SM-2); per word or per word and mode (follows from M14); whether it replaces "3 right in a row → learned" (§8.5); seeding the schedule from the answers recorded since M7; how the self-graded swipes map to the algorithm's grades.

#### M16: Progress over time
- A daily goal, a streak of days on which it was met, and a history (cards answered and words learned per day and week). The base for gamification (Later).
- **Open:** what the goal counts (cards answered, due words cleared, minutes); whose midnight counts (the phone's time zone, not the server's); whether Basics practice counts.

### Phase 3: basics

#### M17: Basics and the alphabet
- **Basics** is a new section reached from Home: topics that are the same for every learner, each with an explanation page and a practice of its own. Topics are never mixed in one session. The structure is built once, so the grammar topics of §15 can reuse it later.
- **Alphabet:** a reference page with every letter, Ä Ö Ü ß and the combinations ch, sch, ei, ie, eu / äu, sp / st, each with its transcription (IPA) and a recording. Letter practice as two-sided flip cards like the word cards, or as one-sided cards shown one by one (letter, transcription and sound on one face). Self-graded, no microphone.
- **Open:** where the content lives (written once and checked by hand: data in `core/`, or the database); where the recordings come from (Commons recordings of the letter names, example words with dictionary recordings such as *ich* and *Buch* for ch, or text-to-speech from M18); whether letter answers are recorded as progress.

#### M18: Text-to-speech
- German audio generated once per text, stored, and played like the Wiktionary recordings. Numbers and time need it: no recordings exist for "siebenundzwanzig" or "Viertel vor vier". Example sentences and words without a recording can use it too.
- §15 has the research: Azure Neural TTS first (its free tier covers this; a slower version through SSML), Google Chirp 3 HD or ElevenLabs as alternatives.
- **Open:** where the audio files are stored (server disk now, object storage once deployed; the choice must not block deployment); generated on demand or in advance.

#### M19: Numbers
- An explanation page (how German numbers are built: einundzwanzig, hundert, tausend…), then practice in three separate modes: flip cards (27 → siebenundzwanzig), typed answers (see 27, type the German; the app checks it) and listening (hear the number, type the digits).
- The numbers are generated by the app (a pure number → words function in `core/`), not imported.
- **Open:** the ranges (to 20, to 100, to 1000, years such as neunzehnhundertneunundneunzig, ordinals); how strict the typed check is (ß / ss, umlauts typed as ae / oe / ue, spaces, capitals).

#### M20: Time
- The same structure as Numbers, as a separate topic: an explanation (official 24-hour time, "fünfzehn Uhr fünfundvierzig"; everyday time, "Viertel vor vier", "halb vier", vor / nach), then practice in which the prompt is words, sound or digits and the learner answers.
- A time has several right answers; a typed answer is accepted when it matches any of them (generated in `core/`).
- **Open:** regional forms (*viertel vier*, *dreiviertel vier*) accepted or not; which minutes are asked (five-minute steps first).

### Later

In this order, after M20:
- **CI/CD and deployment:** the checks (test, typecheck, lint, with a PostgreSQL service) on every push, then an automatic deploy when they pass. Until then the checks run locally before every commit, as CLAUDE.md requires. HTTPS on the deployed app also makes the browser APIs that CLAUDE.md rules out available (microphone, `crypto.randomUUID()`…).
- **Login:** a deployed app is on the internet, and without a login anyone could use it and run up the Claude bill. Needed with the first deploy (accounts, §15).
- **Backups:** the host's automatic database backups or a scheduled `pg_dump` kept off the server, and a restore that has been tried. Until deployment the dev database holds practice data only.
- **Gamification:** points for practice and something to spend them on; builds on M16.
- **AI for subscribers** (the user, 2026-10-16): the AI features become paid, for subscribers only (which ones exactly, e.g. whether photo import and enrichment too, is open); comes with the login. Price them from real `ai_usage` numbers per learner. The model decides most of it: 50 Ask AI calls a day for 30 days cost ≈ 15¢ on Haiku 5.5 but ≈ $15 on Opus 5.5, and a photo page ≈ 0.2–0.4¢ vs 5–8¢ (§11.4).
- **Someday:** export of the word list (CSV, Anki), and the items of §15 not chosen yet.

## Verification (every milestone)
1. `pnpm test`, `pnpm typecheck` and `pnpm check` pass. `pnpm test` never calls Claude.
2. Run the milestone's demo; the iPhone demos are on the same Wi-Fi at `http://<Mac IP>:5173`.
3. From M2 on: `pnpm test:live` before committing any change under `server/src/ai` (about 25¢).
4. Commit, then stop for the user's review.
