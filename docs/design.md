# Language App — Prototype Design

**Date:** 2026-10-11
**Status:** Draft for review

## 1. Purpose

A companion app for learning German from any book. After each study session the learner photographs the pages they worked through; the app extracts the new words, checks them against the words the learner already has, lets the learner confirm them, and turns them into flashcard practice.

**Goal of the prototype:** solve the author's own problem — remember the vocabulary from their German book. If it works well, it may later become a product, so the data model and code structure must not block multiple users, more languages, or a phone app.

**Success criteria for the prototype**
- Photographing a textbook page on an iPhone and getting a correct, reviewable list of new words takes under a minute.
- Words already known or skipped are never offered again.
- Grammar facts on cards (article, plural, verb forms) are correct or visibly flagged.
- A flashcard session can be started in two taps and practised with swipe gestures on the iPhone.

## 2. Scope

### In the prototype
- Photo import → AI extraction → comparison with the learner's words → Wiktionary check → review → save → AI enrichment
- Shared word dictionary + per-learner word list with statuses (`learning` / `learned` / `ignored`)
- Flashcard practice (one mode) with three session sources
- Per-word progress tracking
- "My words" list with edit, status change and delete
- AI usage/cost tracking and a daily photo limit
- One user, no login; English as the learner language; German as the target language

### Not in the prototype (see §15 Later)
Grammar topics, levels and placement test, other practice modes (fill-in-the-blank, listening, speaking), spaced repetition, pictures on cards, Korean, accounts, phone app, starter word lists.

## 3. Key decisions

| Topic | Decision |
|---|---|
| Starting vocabulary | Empty. The word list grows only from the learner's own imports. Pre-made lists (e.g. Goethe A1–B1) may become an optional import later. |
| Word capture | Photo(s) → AI → compared with existing words → learner confirms → saved |
| Skipped words | Saved with status `ignored`, so they never reappear as "new" |
| Grammar facts | Checked against German Wiktionary (kaikki.org extract). Dictionary first, AI fills gaps. |
| Example sentences | Written by AI once, when the word is added; stored permanently |
| Card front | English translation + part of speech |
| Card back | German word with article, plural / verb forms, example sentence + translation |
| Grading | Learner self-grades by swipe; time to flip and time to answer are recorded |
| Learned rule | 3 "knew it" in a row → `learned` |
| Platform | Web app (React), structured so a React Native app can reuse server and core later |
| AI model | Claude Opus 5.5 at `low` effort, configurable per call |

## 4. Architecture

```
┌─────────────────────┐   HTTP / JSON    ┌──────────────────────┐
│  web/  (React+Vite) │ ───────────────► │  server/  (Fastify)  │
│  screens, gestures, │   /api/*         │  routes, rules,      │
│  photo picking      │                  │  AI + dictionary     │
└─────────┬───────────┘                  └───┬──────────┬───────┘
          │ uses                             │ uses     │
          ▼                                  ▼          ▼
     ┌──────────────────────────────┐   PostgreSQL   Claude API
     │ core/  shared TypeScript     │
     │ types, Zod schemas, API      │
     │ client, learning rules       │
     └──────────────────────────────┘
```

### Units

- **`core/`** — pure TypeScript, no browser or Node-specific APIs, so a future React Native app can use it unchanged.
  - Types and **Zod schemas** for every API request/response and for both AI call outputs.
  - **API client** used by the web app.
  - **Learning rules**: applying a card result to a word's progress (`applyResult(progress, result) → progress`).
- **`server/`** — the only unit that talks to the database and to Claude. Holds the API key.
  - `routes/` — HTTP endpoints (§9).
  - `db/` — Drizzle schema and migrations.
  - `ai/` — Claude client behind an interface (`extractWords(photo)`, `enrichWords(words)`), so tests can substitute recorded responses.
  - `dictionary/` — Wiktionary lookups; `scripts/import-wiktionary.ts` loads the reference table.
  - `imports/` — import flow: merge, compare, dictionary check, save, enrich.
  - `practice/` — session word selection and result recording.
- **`web/`** — screens and interaction only: photo picking and shrinking, review list, card flip/swipe animation, keyboard shortcuts. All data access goes through the `core/` API client. Device features sit behind small wrappers (`pickPhotos()`, `shrinkImage()`), so a phone app only needs to replace those.

### Technology

| Part | Choice |
|---|---|
| Language | TypeScript everywhere |
| Repo | One repo, pnpm workspaces: `core/`, `server/`, `web/` |
| Runtime | Node.js 24 or newer (developed on 26) |
| Web | React + Vite, React Router, CSS Modules, `@use-gesture/react` for swipes |
| Server | Fastify, `@fastify/multipart` for photo upload |
| Database | PostgreSQL 17 in Docker, Drizzle ORM + drizzle-kit migrations |
| Validation | Zod (shared in `core/`) |
| AI | Anthropic TypeScript SDK (`@anthropic-ai/sdk`), structured outputs |
| Tests | Vitest |

### Single user
A single user row is created by the first migration. The server uses its fixed id for every request. Every learner-owned table has `user_id`, so adding accounts later does not change the schema.

## 5. Data model

```
users ──< user_words >── words ──< word_translations
  │           │            │
  ├──< imports┘            └ (checked against) dictionary_entries
  ├──< sessions ──< card_results >── user_words
  └──< ai_usage
```

### `users`
| Field | Notes |
|---|---|
| `id` | |
| `name` | |
| `learner_language` | `en` (later `ko`) |
| `target_language` | `de` |
| `created_at` | |

### `words` — shared dictionary of word facts (no personal data)
| Field | Notes |
|---|---|
| `id` | |
| `language` | `de` |
| `lemma` | Base form, e.g. `Tisch`, `gehen`, `aufstehen`. Reflexive verbs are stored without `sich`. |
| `pos` | `noun` / `verb` / `adjective` / `adverb` / `pronoun` / `preposition` / `conjunction` / `determiner` / `numeral` / `particle` / `interjection` / `other` |
| `article` | `der` / `die` / `das` for nouns, `null` otherwise |
| `plural` | Nouns only, nullable |
| `forms` | JSON, depends on pos. Verbs: `{ praeteritum, partizip2, auxiliary }` |
| `forms_source` | `dictionary` / `ai` / `null` (not enriched yet) |
| `example_de` | AI-written example sentence |
| `check_status` | `match` / `mismatch_fixed` / `mismatch_kept` / `not_in_dictionary` |
| `enriched_at` | `null` until enrichment has run |
| `created_at` | |

**Identity:** `UNIQUE NULLS NOT DISTINCT (language, lemma, pos, article)` — so *der See* and *die See* are separate rows, and non-nouns (article `null`) are still unique.

### `word_translations` — one row per learner language
| Field | Notes |
|---|---|
| `word_id`, `language` | Primary key |
| `translation` | Short translation, e.g. `table` (from extraction) |
| `example_translation` | Translation of `example_de` (from enrichment) |

### `user_words` — the learner's relationship to a word
| Field | Notes |
|---|---|
| `id` | |
| `user_id`, `word_id` | `UNIQUE (user_id, word_id)` |
| `status` | `learning` / `learned` / `ignored` |
| `import_id` | Import the word came from (nullable for future manual adds) |
| `added_at` | |
| `custom_translation` | Learner's own translation; **takes priority over** `word_translations.translation` everywhere it is shown |
| `note` | Free text |
| `times_seen`, `times_correct`, `correct_streak` | Progress counters |
| `last_result` | `knew` / `didnt_know` / `null` |
| `last_practiced_at` | |

### `imports`
| Field | Notes |
|---|---|
| `id`, `user_id` | |
| `name` | Optional, e.g. "Lesson 4" |
| `status` | `collecting` (photos being added) / `reviewing` / `done` |
| `photo_count` | |
| `candidates` | JSON list of merged extraction results (see §6.3), so a reload never loses the review |
| `created_at`, `completed_at` | |

### `sessions`
| Field | Notes |
|---|---|
| `id`, `user_id` | |
| `source` | `last_import` / `last_7_days` / `not_learned` |
| `started_at`, `finished_at` | `finished_at` stays `null` if the learner leaves early |

### `card_results`
| Field | Notes |
|---|---|
| `id`, `session_id`, `user_word_id` | |
| `result` | `knew` / `didnt_know` / `skipped` |
| `flipped` | Whether the card was turned over before answering |
| `flip_ms` | Time from card shown to first flip; `null` if not flipped |
| `answer_ms` | Time from card shown to swipe |
| `created_at` | |

### `dictionary_entries` — read-only reference, loaded from Wiktionary
| Field | Notes |
|---|---|
| `lemma`, `pos` | Indexed together |
| `genders` | Array, e.g. `[der]`, `[der, das]` |
| `plurals` | Array |
| `forms` | JSON, same shape as `words.forms` |
| `glosses_en` | Array of short English glosses |

### `ai_usage`
| Field | Notes |
|---|---|
| `id`, `user_id`, `import_id` | |
| `call_type` | `extract` / `enrich` |
| `model` | |
| `input_tokens`, `output_tokens` | From the API response `usage` |
| `stop_reason` | |
| `ok` | Whether the result was usable |
| `created_at` | |

## 6. Import flow

### 6.1 Overview
```
1. Learner picks 1..n photos  → each shrunk in the browser to JPEG, longest side 1600px
2. Each photo sent separately → AI call 1 (extract) → words + page quality
3. Server merges into the import's candidate list, removing duplicates
4. Server compares candidates with the learner's user_words (any status)
5. Server checks each new candidate against dictionary_entries
6. Review screen: Add / Skip per word, one-tap fixes for dictionary mismatches
7. Save: words + user_words created (added → learning, skipped → ignored)
8. AI call 2 (enrich) for added words that are not yet enriched
```

### 6.2 Photos
- Picked with `<input type="file" accept="image/*" multiple>`, which on iPhone offers camera or photo library and works over plain HTTP.
- Shrunk in the browser with `createImageBitmap` + canvas → JPEG (quality 0.85, longest side 1600px). HEIC is decoded by Safari; if the browser cannot decode a file, the learner gets an error for that file only.
- Photos are uploaded one per request, extracted, and **not stored** on the server. The browser keeps them in memory until the import moves to review, so a failed photo can be retried without picking it again.

### 6.3 Candidates
Each candidate in `imports.candidates`:
```
{ key, lemma, pos, article, translation, photoIndex,
  existing: "none" | "in_my_words",
  dictionary: { status: "match" | "mismatch" | "not_found", genders?: [...] } }
```
- `key` is `lemma|pos|article` (empty article for non-nouns).
- **Duplicates** within an import are merged by `(lemma, pos, article)`; the first translation wins.
- **Comparison:** a candidate is `in_my_words` if the learner has a `user_words` row (any status, including `ignored`) for a `words` row with the same identity.
- **Dictionary check** (new candidates only): look up `dictionary_entries` by `lemma` + `pos` (exact match first, then case-insensitive).
  - Found and `article` is one of `genders` (or the word is not a noun) → `match`
  - Found and the noun's `article` is not in `genders` → `mismatch`, with the dictionary genders attached
  - Not found → `not_found`

### 6.4 Review
- New candidates are listed, all set to **Add** by default. Tapping a row toggles Add / Skip. "Add all" / "Skip all" buttons.
- `in_my_words` candidates are shown only as a count ("31 already in your words") that expands to a read-only list.
- `mismatch` rows show a warning: "AI: *die* Tisch · Dictionary: *der* Tisch". One tap applies the dictionary article (a choice is shown if there are several). If not applied, the AI article is kept.
- `not_found` rows show a small grey "not in dictionary" label.
- **Save** sends the decisions.

### 6.5 Save
For each decided candidate:
1. Find or create the `words` row by identity (using the dictionary article if the learner applied the fix). A new row gets `check_status` (`match` / `mismatch_fixed` / `mismatch_kept` / `not_in_dictionary`) and a `word_translations` row with the extracted translation; an existing row is reused unchanged. If the fixed identity is already in the learner's list, the candidate is a no-op.
2. Create the `user_words` row: **Add** → `learning`, **Skip** → `ignored`, with `import_id`.
3. Mark the import `done`.

Saving happens before enrichment, so the words exist (and are practisable with the extracted data) even if enrichment fails.

### 6.6 Enrichment
For each added word whose `words.enriched_at` is `null`:
1. **Dictionary first:** if `dictionary_entries` has plural (nouns) or verb forms, copy them to `words`, `forms_source = dictionary`.
2. **AI fills the gaps:** AI call 2 receives the words in batches of up to 30. It always writes the example sentence and its translation, and writes plural / verb forms only for words where the dictionary had none (`forms_source = ai`).
3. Set `enriched_at`.

A word already enriched by a previous import (any user) needs no AI call — this is the benefit of the shared `words` table.

## 7. Wiktionary dictionary

- **Source:** German entries from English Wiktionary, as the JSONL download from kaikki.org (`kaikki.org/dictionary/German`), refreshed monthly by kaikki.
- **Import:** `pnpm --filter server import:wiktionary <file>` streams the file and writes `dictionary_entries`:
  - keeps entries whose part of speech maps to our `pos` list, skips entries whose senses are all "form of" another word;
  - derives `genders` from the entry's gender tags / head template, `plurals` from forms tagged plural (nominative), verb forms from forms tagged preterite, past participle and auxiliary, and `glosses_en` from the first sense glosses.
  - The exact field mapping is fixed against the real file during implementation and covered by a test on a small sample file.
- **Re-running** the import replaces the table (truncate + insert in one transaction).
- **Licence:** CC BY-SA. The app footer shows "Grammar data from Wiktionary (CC BY-SA)". Commercial use needs a licence review.
- **Known limits:** long compound nouns are often missing (→ `not_found`, AI data used); glosses are English only.

## 8. Practice

### 8.1 Session sources
Before starting, the learner chooses one source. Each option shows how many words it contains; options with no words are disabled. A session takes **up to 20 words** and never includes `ignored` words.

| Source | Words | Order |
|---|---|---|
| `last_import` | `learning` + `learned` words from the most recent `done` import | Shuffled |
| `last_7_days` | `learning` + `learned` words with `added_at` in the last 7 days | Shuffled |
| `not_learned` | `learning` words | First words with `last_result = didnt_know` (most recently practised first), then the rest by `added_at` newest first |

### 8.2 Card
- **Front:** translation (`custom_translation` if set, otherwise `word_translations.translation`) and part of speech, e.g. "table (noun)".
- **Back:**
  - nouns: "der Tisch", "pl. die Tische"
  - verbs: "gehen", "ging · ist gegangen"
  - other: the lemma
  - example sentence and its translation; the learner's note if present
  - if not enriched yet: whatever is available, plus "Details pending"
- **Flip:** tap (or Space) turns the card with a 3D flip animation; tapping again turns it back.

### 8.3 Gestures and keys
| Action | Touch | Keyboard | Button |
|---|---|---|---|
| Flip | Tap | Space | — |
| Knew it | Swipe right | → | ✓ |
| Didn't know | Swipe left | ← | ✗ |
| Skip | Swipe up | ↑ | Skip |

The card follows the finger, tilts, and slides out in the swipe direction; a short swipe snaps back. Answering is allowed with or without flipping.

### 8.4 Recording
Each answer is sent immediately (`POST /api/sessions/:id/results`). If the request fails, answers are queued in memory and retried when the network is back. Leaving mid-session loses nothing already answered.

### 8.5 Learning rules (`core/`)
| Result | Effect on `user_words` |
|---|---|
| `knew` | `times_seen +1`, `times_correct +1`, `correct_streak +1`; if `correct_streak ≥ 3` → `status = learned` |
| `didnt_know` | `times_seen +1`, `correct_streak = 0`; if `learned` → `status = learning` |
| `skipped` | No change |

`knew` and `didnt_know` also set `last_result` and `last_practiced_at`.

### 8.6 Summary
After the last card: counts of knew / didn't know / skipped, the list of missed words, and buttons **New session** and **Home**. The session gets `finished_at`.

## 9. API

All routes under `/api`, JSON unless noted. Request and response shapes are Zod schemas in `core/`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/stats` | Home counters (learning, learned) and unfinished imports |
| POST | `/imports` | Create import `{ name? }` |
| POST | `/imports/:id/photos` | Upload one JPEG (multipart) → extract, merge, compare, check → updated candidates + `pageQuality` |
| GET | `/imports/:id` | Import with candidates |
| POST | `/imports/:id/review` | Move import to `reviewing` (no more photos) |
| POST | `/imports/:id/save` | Decisions `[{ key, action: add \| skip, article? }]` → save, then enrich → `{ added, skipped, detailsPending }` |
| POST | `/words/enrich-pending` | Retry enrichment for the learner's words with `enriched_at = null` |
| GET | `/words?status=&q=` | Word list, filter by status, search German or English |
| GET | `/words/:userWordId` | Word detail with progress |
| PATCH | `/words/:userWordId` | `{ status?, customTranslation?, note? }` |
| DELETE | `/words/:userWordId` | Remove from the learner's list (shared `words` row stays) |
| GET | `/sessions/options` | Word count per source |
| POST | `/sessions` | `{ source }` → session + cards |
| POST | `/sessions/:id/results` | `{ userWordId, result, flipped, flipMs, answerMs }` |
| POST | `/sessions/:id/finish` | → summary |

## 10. Screens

```
Home ─┬─► Import ──► Review ──► Done ─► (Practice these now)
      ├─► Practice setup ──► Flashcards ──► Summary
      └─► My words ──► Word detail
```

Mobile-first layout, usable on desktop.

1. **Home** — New import, Practice, My words; counters (learning / learned); banner for each import not yet `done` ("Finish reviewing Lesson 4"); Wiktionary credit in the footer.
2. **Import** — add photos (thumbnails, remove), optional name, per-photo state (uploading / reading / done / failed + Retry / poor quality + Retake), **Review words** when at least one photo is done.
3. **Review** — §6.4. **Save N words** → "Adding details…" → **Done**: "17 words added" with **Practice these now** (starts a `last_import` session).
4. **Practice setup** — three sources with counts, **Start**.
5. **Flashcards** — progress "5 / 20", card, swipe hints, buttons below the card.
6. **Summary** — §8.6.
7. **My words** — tabs Learning / Learned / Ignored, search box, list.
8. **Word detail** — all word data, source of forms (dictionary / AI), progress (seen, correct, streak, last practised); edit custom translation and note; change status; delete.

## 11. AI calls

### 11.1 Common settings
- **SDK:** `@anthropic-ai/sdk`, structured outputs with the Zod schemas from `core/` (`output_config.format`). Every response is validated again with Zod before use.
- **Model:** `claude-opus-5-5` by default, configured separately per call (`AI_MODEL_EXTRACT`, `AI_MODEL_ENRICH`).
- **Effort:** `low` (`AI_EFFORT`). Opus 5.5 defaults to `medium`, so it is set explicitly.
- **Refusal fallback:** server-side fallback enabled (`fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta). `stop_reason` is checked before reading content.
- **`max_tokens`:** 16000.
- **Retries:** SDK default (2) for 429 / 5xx / connection errors.
- **Usage:** every call writes an `ai_usage` row.

### 11.2 Call 1 — Extract
**Input:** one JPEG photo, learner language (`en`).

**Output schema:**
```json
{ "pageQuality": "ok" | "poor",
  "words": [ { "lemma": "Tisch", "pos": "noun", "article": "der", "translation": "table" } ] }
```

**Prompt rules:**
- Return every German word on the page once, in base form: verbs → infinitive; nouns → nominative singular with article; adjectives/adverbs → uninflected form.
- Recombine separable verbs (*Ich stehe um 7 auf* → `aufstehen`).
- Reflexive verbs without `sich`.
- Skip proper names, numbers, and page furniture (page numbers, exercise labels, headers).
- `translation` is a short English equivalent for the sense used on the page.
- `pageQuality = poor` if the page is blurry, dark, cut off, or has no German text.

### 11.3 Call 2 — Enrich
**Input:** up to 30 words `{ lemma, pos, article, translation, needsForms }`.

**Output schema:**
```json
{ "words": [ { "lemma": "Tisch", "pos": "noun", "article": "der",
               "exampleDe": "Der Tisch steht in der Küche.",
               "exampleTranslation": "The table is in the kitchen.",
               "plural": "Tische",
               "forms": null } ] }
```

**Prompt rules:**
- One natural example sentence per word at A1–A2 level, using the word in the given sense, with an English translation.
- `plural` (nouns) and `forms` (verbs: Präteritum 3rd person singular, Partizip II, auxiliary `haben`/`sein`) only when `needsForms` is true; otherwise `null`.

### 11.4 Cost
Rough estimate per typical page (~80 words found, ~15 kept) on Opus 5.5: ~8 cents (Sonnet 5.5 ~4 cents, Haiku 5.5 ~0.2 cents). Real numbers come from `ai_usage`.

### 11.5 Daily limit
`DAILY_PHOTO_LIMIT` (default 50) extract calls per user per day, counted from `ai_usage`. Beyond it, photo upload returns an error: "Daily photo limit reached".

## 12. Errors

### Import
| Problem | Behaviour |
|---|---|
| File the browser cannot decode | Error on that photo only: "Couldn't open this image" |
| `pageQuality = poor` | Photo marked poor: "Couldn't read much from this page" + **Retake**; its words are still added to candidates |
| One photo fails | Other photos continue; failed photo shows **Retry** |
| Claude 429 / 5xx after SDK retries | "AI is busy, try again" + **Retry** |
| `stop_reason = refusal` (after fallback) | Treated as a failed photo |
| Output fails Zod validation | One automatic retry, then failed photo |
| `stop_reason = max_tokens` | Failed photo: "Page too long — photograph it in two parts" |
| Enrichment fails | Words stay saved; cards show "Details pending"; Done screen shows "N words without details" + **Retry** (`/words/enrich-pending`) |
| Learner leaves during review | Import stays `reviewing`; Home shows a banner to finish it |
| Same word saved twice concurrently | Unique constraints + upsert; no duplicates |
| Daily limit reached | Upload refused with a clear message |

### Practice
| Problem | Behaviour |
|---|---|
| Result request fails | Queued in memory, retried when back online |
| Learner leaves mid-session | Answered cards are saved; session stays unfinished |
| Source has no words | Option disabled |

### General
Unexpected server errors return a JSON error with a message; the web app shows it in a toast. Server logs include the request id.

## 13. Testing

| Layer | What | How | Cost |
|---|---|---|---|
| Unit | Learning rules, candidate merging, dictionary match logic, session ordering | Vitest in `core/` and `server/` | Free |
| Server | Import flow (extract → merge → compare → dictionary → save → enrich), ignored words never re-offered, session selection per source, result recording, daily limit, error paths (429, refusal, invalid output, max_tokens) | Vitest + real PostgreSQL test database (Docker), AI client replaced by **recorded real Claude responses** (fixtures) | Free |
| Dictionary import | Mapping from kaikki JSONL to `dictionary_entries` | Vitest on a small sample file with expected rows | Free |
| Live | 2–3 real photos through the real Claude API end to end; asserts schema validity and a sensible word count | `pnpm test:live`, run on demand (after AI changes, before milestones, when switching models) | ~25¢ per run |
| AI quality (optional) | 20–30 photos of real book pages with hand-checked word lists; reports word recall, lemma accuracy, article accuracy, dictionary mismatches | Script, run on demand to compare models | ~$2–3 per run on Opus |
| Manual | Layout, gestures, photo flow on the real device | iPhone on the local network | — |

Fixtures are created by running a few real photos through Claude once and saving the responses. Implementation follows test-first development.

## 14. Development setup

- `docker compose up -d` starts PostgreSQL (dev and test databases).
- `pnpm dev` starts the server (port 3000) and Vite (port 5173, `--host`). Vite proxies `/api` to the server, so the browser needs only one address.
- **iPhone:** same Wi-Fi, open `http://<Mac IP>:5173`. Photo picking works over HTTP. (Microphone access needs HTTPS — not needed for the prototype.)
- Configuration via `.env` (template: `.env.example`): `DATABASE_URL`, `TEST_DATABASE_URL`, `ANTHROPIC_API_KEY`, `AI_MODEL_EXTRACT`, `AI_MODEL_ENRICH`, `AI_EFFORT`, `DAILY_PHOTO_LIMIT`, `SERVER_PORT` (default 3000), `WEB_PORT` (default 5173).
- No login: anyone on the home network can open the app. Acceptable for the prototype.

## 15. Later

Recorded here so decisions already made are not lost.

- **Grammar:** fixed topic list per level, tagging imports with topics, grammar exercises.
- **Levels:** learner picks A1.1 … B1+, placement test checks it.
- **Practice modes:** fill-in-the-blank, listening, speaking, mixed; choosing specific topics or combinations; "practise missed words again".
- **Spaced repetition** ("smart review").
- **Pictures** on card fronts.
- **Example sentences from Tatoeba** as a second source.
- **Starter word lists** (e.g. Goethe A1–B1) as an optional import into a learner's list.
- **Korean** as learner language (new `word_translations` rows; Korean UI text).
- **Accounts** and multi-user; review of shared `words` rows with `mismatch_kept` before reusing them for other users.
- **Phone app** in React Native reusing `server/` and `core/`.
- **Cheaper models:** compare Opus 5.5 with Haiku 5.5 (high effort) using the AI quality test; the Wiktionary check guards a smaller model's grammar facts.
- **Text-to-speech (listening):** Azure Neural TTS, audio generated once per word/sentence and stored; slow version via SSML speaking rate. Free tier covers an A1–A2 deck. Alternatives: Google Chirp 3 HD, ElevenLabs (premium).
- **Speech (speaking):** Azure Pronunciation Assessment with the expected phrase as reference (de-DE and ko-KR supported, per-word and per-phoneme scores; phoneme labels are en-US only). Plain transcription (Whisper etc.) is unsuitable because it hides learner errors. Needs HTTPS for the microphone and possibly server-side audio conversion (ffmpeg) for iPhone recordings. Alternative to test: SpeechSuper.

## 16. Research notes (2026-10-11)

- **Vision/extraction model:** Claude Opus 5.5 ranked first in Roboflow's real-world OCR evaluation (updated 2026-10-08); `low` effort scored close to `high` at lower cost and latency. GPT-6.1 Sol and Gemini 3.8 Flash were strong alternatives but did not beat it. A separate OCR service plus a cheaper LLM is not worth it: transcription is already 93–97 % accurate, and the real risk (gender, plurals, lemmas) is not solved by OCR. No benchmark measures German article/plural accuracy — hence the Wiktionary check and the AI quality test.
- **Speech:** see §15. Browser Web Speech APIs are too inconsistent across devices for German.
