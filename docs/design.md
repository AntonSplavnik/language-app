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
| `id`, `session_id`, `user_word_id` | `UNIQUE (session_id, user_word_id)`: one answer per card per session, so a retried request is never counted twice |
| `result` | `knew` / `didnt_know` / `skipped` |
| `flipped` | Whether the card was turned over before answering |
| `flip_ms` | Time from card shown to first flip; `null` if not flipped |
| `answer_ms` | Time from card shown to swipe |
| `created_at` | |

### `dictionary_entries` — read-only reference, loaded from Wiktionary
| Field | Notes |
|---|---|
| `id` | |
| `lemma`, `pos` | Indexed together, also as `(lower(lemma), pos)` for the case-insensitive lookup |
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
| `duration_ms` | Wall-clock time of the attempt, including SDK retries; tracks the "under a minute" goal |
| `created_at` | |

One row per API attempt: a retry after invalid output and a failed call each get their own row. When a refusal fallback ran, `model` is the model that answered and the token counts cover every model that ran (`usage.iterations`).

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
- **Dictionary check** (new candidates only): look up `dictionary_entries` by `lemma` + `pos` (exact match first, then case-insensitive). Words other than nouns that are not found under their own part of speech fall back to any non-noun entry with the same lemma, because sources label small words differently (Claude calls *nicht* a particle, Wiktionary an adverb). Nouns never fall back. Genders are merged across all entries found (*der See* and *die See*).
  - Found and `article` is one of `genders` (or the word is not a noun) → `match`
  - Found noun whose dictionary entries carry no gender (plural-only nouns such as *Eltern*) → `match`: nothing contradicts it
  - Found and the noun's `article` is not in `genders`, or the AI gave no article → `mismatch`, with the dictionary genders attached
  - Not found → `not_found`

### 6.4 Review
- New candidates are listed, all set to **Add** by default. Tapping a row toggles Add / Skip. "Add all" / "Skip all" buttons.
- `in_my_words` candidates are shown only as a count ("31 already in your words") that expands to a read-only list.
- `mismatch` rows show a warning: "AI: *die* Tisch · Dictionary: *der* Tisch". One tap applies the dictionary article (a choice is shown if there are several). If not applied, the AI article is kept.
- `not_found` rows show a small grey "not in dictionary" label.
- **Save** sends the decisions.

### 6.5 Save
For each decided candidate (candidates without a decision are not saved and will be offered again by a later import):
1. Find or create the `words` row by identity (using the dictionary article if the learner applied the fix). A new row gets `check_status` (`match` / `mismatch_fixed` / `mismatch_kept` / `not_in_dictionary`) and a `word_translations` row with the extracted translation; an existing row is reused unchanged (only a missing translation for the learner's language is added). If the fixed identity is already in the learner's list, the candidate is a no-op.
2. Create the `user_words` row: **Add** → `learning`, **Skip** → `ignored`, with `import_id`. When an article fix makes two candidates the same word, **Add** wins.
3. Mark the import `done`.

The whole save is one transaction that locks the import row. Every decision is validated first, so a rejected request changes nothing: an unknown `key` is `unknown_candidate`; an `article` other than the candidate's own is accepted only for a `mismatch` and only if it is one of the dictionary genders (`invalid_article`). Words are created in a fixed order so that two imports saving the same word at the same time create it once and cannot deadlock.

Photo uploads run the AI call outside any transaction, then lock the import row to merge, so photos uploaded at the same time don't overwrite each other's candidates.

Saving happens before enrichment, so the words exist (and are practisable with the extracted data) even if enrichment fails.

### 6.6 Enrichment
For each added word whose `words.enriched_at` is `null` (`server/src/words/enrich.ts`):
1. **Dictionary first:** if `dictionary_entries` has plural (nouns) or verb forms, copy them to `words`, `forms_source = dictionary`. A noun's plural comes from an entry with the word's own gender (*der Band* → *Bände*, *die Band* → *Bands*). The copy happens before the AI call, so a word keeps its dictionary forms even if the AI fails.
2. **AI fills the gaps:** AI call 2 receives the words in batches of up to 30, three batches at a time. It always writes the example sentence and its translation, and writes plural / verb forms only for words where the dictionary had none (`forms_source = ai`). Each result is matched to its word by `ref`, and only used if its `lemma` is that word's lemma.
3. Set `enriched_at`. Updates only touch rows where `enriched_at` is still `null`, so two runs never write the same word twice.

A failed batch (AI busy, refused, invalid output) leaves its words pending; the other batches still count, and saving never fails because of enrichment. Save answers after enrichment, so the Review screen shows "Adding details…" meanwhile; the server finishes enrichment even if the phone drops the connection, and the phone then finds the import done and shows the Done screen.

A word already enriched by a previous import (any user) needs no AI call — this is the benefit of the shared `words` table.

**Measured (2026-10-11, Haiku 5.5 `medium`):** backfilling the 94 words saved before enrichment existed took 4 calls in 10 s for ≈0.5¢; 30 noun plurals and 16 verb forms came from the dictionary, 1 plural and 2 verb forms from the AI. A typical save (15–40 added words, one or two parallel batches) adds roughly 5–10 s. With Opus 5.5 an 11-word batch took 10 s, so a full 30-word batch would add more; if saves grow slow, switch to answering at once and enriching in the background.

## 7. Wiktionary dictionary

- **Source:** German entries from English Wiktionary, as the JSONL download from kaikki.org (`kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl`, 1.08 GB, 371k lines; downloaded 2026-10-11, file dated 2026-10-03). kaikki marks this file **deprecated, to be removed**; the importer also accepts the raw wiktextract dump for all languages (`.jsonl.gz`), keeping only `lang_code = de`, as the replacement. The downloaded file lives in `data/kaikki/` (git-ignored).
- **Import:** `pnpm --filter server import:wiktionary <file>` streams the file and writes `dictionary_entries` (98,308 entries in ≈11 s on the development Mac). Mapping (`server/src/dictionary/kaikki.ts`):
  - **Part of speech:** `noun`, `verb`, `adj`→adjective, `adv`→adverb, `pron`→pronoun, `prep`/`postp`→preposition, `conj`→conjunction, `det`/`article`→determiner, `num`→numeral, `particle`, `intj`→interjection, `contraction`→other. Everything else is skipped: proper names (`name`), phrases, proverbs, affixes, symbols.
  - **Form-of entries:** senses that only point to an inflected form ("nominative plural of Tisch") are dropped, and an entry with no other senses is skipped (≈268k entries). Derived words that Wiktionary also files as form-of are kept: female equivalents (*Freundin*), agent nouns (*Lehrer*), diminutives, gerunds and verbal nouns.
  - **`genders`:** from the gender tags (masculine/feminine/neuter) of the kept senses. A noun with several genders appears as several entries (*das/der/die Band*), each with its own plural.
  - **`plurals`:** forms tagged exactly `plural` (qualified variants such as "Handies, now nonstandard" are left out).
  - **`forms`** (verbs): Präteritum from the form tagged `past`, Partizip II from `participle past`, auxiliary from `auxiliary`. When Wiktionary lists both *haben* and *sein* (529 verbs, e.g. *fahren*, *aufstehen*), `forms` stays empty so enrichment picks the usual one; a card shows one auxiliary.
  - **`glosses_en`:** the most specific gloss of each kept sense, up to five.
  - A test loads a 50-entry sample cut from the real file (`server/test/fixtures/kaikki-sample.jsonl`, made with `server/scripts/make-kaikki-sample.ts`).
- **Check from the command line:** `pnpm --filter server dict:lookup <lemma> <pos> [article]` prints the entries and the check result.
- **Re-running** the import replaces the table (truncate + insert in one transaction).
- **Licence:** CC BY-SA. The app footer shows "Grammar data from Wiktionary (CC BY-SA)". Commercial use needs a licence review.
- **Known limits:** long compound nouns are often missing (→ `not_found`, AI data used); glosses are English only; plurals belong to the entry, not the meaning (*der Stock* lists *Stöcke*, the plural for "stick", also for the "floor" meaning); plural-only nouns have no gender.
- **Measured coverage (2026-10-11):** of the 218 words extracted from three real book pages, 205 were found and none had a different article. The 13 not found were textbook compounds (*Kinderbibliothek*, *Terminvereinbarung*), *TV* and *möchten* (filed as a form of *mögen*).

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
| GET | `/stats` | Home counters (learning, learned), `detailsPending` (the learner's non-ignored words without details) and unfinished imports |
| POST | `/imports` | Create import `{ name? }` → 201 + import |
| POST | `/imports/:id/photos` | Upload one JPEG (multipart field `photo`, at most 10 MB) → extract, merge, compare, check → `{ pageQuality, wordsFound, import }`. Only while the import is `collecting` |
| GET | `/imports/:id` | Import with candidates; `existing` is recomputed on every read |
| POST | `/imports/:id/review` | Move import to `reviewing` (no more photos) |
| POST | `/imports/:id/save` | Decisions `[{ key, action: add \| skip, article? }]` → save, then enrich → `{ added, skipped, detailsPending }`. Allowed once, from `collecting` or `reviewing` |
| POST | `/words/enrich-pending` | Retry enrichment for the learner's `learning` / `learned` words with `enriched_at = null` → `{ enriched, pending }` |
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

1. **Home** — New import, Practice, My words; counters (learning / learned); banner for each import not yet `done` that has at least one photo ("Finish reviewing Lesson 4"); "N words without details yet" + **Add details** when enrichment is pending; Wiktionary credit in the footer.
2. **Import** — add photos (thumbnails, remove), optional name, per-photo state (preparing / reading / done with word count / failed + Retry / poor quality + Retake), **Review words** when at least one photo is done.
   - The import is created when the first photo is sent, so leaving the screen early leaves nothing behind; the name is typed before that and cannot be changed later. The URL moves from `/imports/new` to `/imports/:id` without losing the photos in memory.
   - Photos are shrunk one at a time (phone memory) and sent at most two at a time. "Uploading" and "reading" are shown as one state, *Reading*: `fetch` reports no upload progress, and a shrunk photo is only ≈0.5 MB.
   - A photo can be removed before it is sent or after it failed; once read, its words stay in the import (they can be skipped in review). **Retry** appears only for failures worth retrying with the same photo (AI busy, invalid output, network); otherwise the message says what to do (e.g. "photograph it in two parts").
   - **Review words** is enabled only when nothing is still being prepared or read, because starting review closes the import to photos. Photos read in an earlier visit count (“2 photos read earlier; their words are kept”).
3. **Review** — §6.4. **Save N words** → "Adding details…" → **Done**: "17 words added" with **Practice these now** (starts a `last_import` session).
   - Decisions are kept on the device (`localStorage`, per import) until saved, so a reload keeps them; another device starts from "all Add". Opening Review for an import that is still collecting starts the review.
   - Until M7: no **Practice these now**; Done offers **Import more pages** and **Home**. Home shows Practice and My words once those screens exist (M7, M8).
4. **Practice setup** — three sources with counts, **Start**.
5. **Flashcards** — progress "5 / 20", card, swipe hints, buttons below the card.
6. **Summary** — §8.6.
7. **My words** — tabs Learning / Learned / Ignored, search box, list.
8. **Word detail** — all word data, source of forms (dictionary / AI), progress (seen, correct, streak, last practised); edit custom translation and note; change status; delete.

## 11. AI calls

### 11.1 Common settings
- **SDK:** `@anthropic-ai/sdk`, beta client (`client.beta.messages.create`, needed for `fallbacks`). Structured outputs: the Zod schemas from `core/` converted with the SDK's `betaZodOutputFormat` into `output_config.format`. The SDK turns enum values into schema descriptions rather than hard constraints, so every response is validated again with Zod before use. `thinking` is never sent (Opus 5.5 always thinks adaptively; disabling it is a 400).
- **Model:** `claude-opus-5-5` by default, configured separately per call (`AI_MODEL_EXTRACT`, `AI_MODEL_ENRICH`).
- **Effort:** `low` (`AI_EFFORT`). Opus 5.5 defaults to `medium`, so it is set explicitly.
- **Refusal fallback:** server-side fallback enabled (`fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta) for models that support it (Opus 5.5, Opus 5, Fable 5.1, Sonnet 5.5). Haiku 5.5 has no server-side fallback and must not be sent the parameter, so a Haiku refusal is final. `stop_reason` is checked before reading content.
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

**Prompt rules** (full text in `server/src/ai/prompts.ts`):
- Return every German word on the page once, in base form: verbs → infinitive; nouns → nominative singular; adjectives/adverbs → uninflected form. Function words (articles, pronouns, prepositions…) are included with their part of speech.
- `lemma` is always the word alone; a noun's article goes only in `article` (the first test run returned "der Tisch" as the lemma until this was stated).
- Recombine separable verbs (*Ich stehe um 7 auf* → `aufstehen`).
- Reflexive verbs without `sich`.
- Skip proper names, numbers written as digits (times, dates, prices, phone numbers, addresses), abbreviations whose full word is also on the page, and page furniture (page numbers, lesson and exercise labels, running headers and footers).
- Only printed text counts: handwriting (the learner's own answers and notes) is skipped.
- `translation` is a short English equivalent (one to four words) for the sense used on the page; verbs as infinitives ("to go").
- `pageQuality = poor` if most of the page could not be read (blurry, dark, cut off, or no German text); the words that could be read are still returned.

### 11.3 Call 2 — Enrich
**Input:** up to 30 words `{ ref, lemma, pos, article, translation, needsForms }`, sent as JSON. `ref` is the word's position in the batch; the output repeats it so each result is matched to its word by number, not by spelling.

**Output schema:**
```json
{ "words": [ { "ref": 0, "lemma": "Tisch",
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

**Measured (2026-10-11, Opus 5.5, effort `low`, three real book pages shrunk to 1600 px):** extract took 13–25 s and 5–8 cents per page (≈3,700 input tokens; 1,700–3,300 output tokens for 52–101 words). A blurred page returned `poor` in 2.6 s for 1.5 cents. Enriching 11 words took 10 s and 2.7 cents.

**Model comparison (same day, same pages).** Exercise page p. 64 is the dense one that separates the models:

| Model, effort | Words on p. 64 | Quality notes | Time | Cost per page |
|---|---|---|---|---|
| Opus 5.5 `low` | 101 | Follows all rules; reference | 25 s | 8.1¢ |
| Sonnet 5.5 `low` | 106 | Joins separable verbs correctly; keeps place names (*Schweiz*) and a handwritten word; changes *Kinderärztin* to *Kinderarzt* | 18 s | 4.2¢ |
| Sonnet 5.5 `medium` | 101 | Like `low`, plus one plural as lemma (*Kinder*) | 17 s | 4.1¢ |
| Haiku 5.5 `low` | 70 | Misses real vocabulary (*Uhr, Person, schreiben*), leaves separable verbs split, keeps place names, an abbreviation and a handwritten word | 8 s | 0.15¢ |
| Haiku 5.5 `medium` | 96 | Follows the skip rules; misses a few long compounds; splits two separable verbs (*kreuzen* for *ankreuzen*) | 30 s | 0.43¢ |
| Haiku 5.5 `high` | 94 | No better than `medium` | 40 s | 0.56¢ |

On the vocabulary-list page all models matched Opus closely (Sonnet 53, Haiku 50 vs 52 words), and no noun article differed from Opus on any page. Enrichment of the 11-word batch gave identical plurals and verb forms on all three models (Opus 10 s / 2.7¢, Sonnet `low` 6 s / 1.3¢, Haiku `medium` 5 s / 0.07¢).

Error kinds differ: Sonnet's mistakes are mostly extra words the learner can skip, while Haiku's split separable verbs produce a wrong lemma. For development the `.env` uses Haiku 5.5 at `medium`; the code defaults stay Opus 5.5 at `low`.

### 11.5 Daily limit
`DAILY_PHOTO_LIMIT` (default 50) extract calls per user per day, counted from `ai_usage`. Every extract attempt counts, including failed ones and the retry after invalid output; the day starts at the server's local midnight. Beyond it, photo upload returns an error: "Daily photo limit reached".

## 12. Errors

### Import
| Problem | Behaviour |
|---|---|
| File the browser cannot decode | Error on that photo only: "Couldn't open this image" |
| `pageQuality = poor` | Photo marked poor: "Couldn't read much from this page" + **Retake**; its words are still added to candidates |
| One photo fails | Other photos continue; failed photo shows **Retry** |
| Claude 429 / 5xx / unreachable after SDK retries | "AI is busy, try again" + **Retry** |
| Other Claude API errors (bad request, invalid API key) | Not retried; surfaces as an unexpected server error |
| `stop_reason = refusal` (after fallback) | Treated as a failed photo |
| Output fails Zod validation | One automatic retry, then failed photo |
| `stop_reason = max_tokens` | Failed photo: "Page too long — photograph it in two parts" |
| Enrichment fails | Words stay saved; cards show "Details pending"; Done screen and Home show "N words without details" + **Add details** (`/words/enrich-pending`) |
| Learner leaves during review | Import stays `reviewing`; Home shows a banner to finish it |
| Same word saved twice concurrently | Unique constraints + upsert; no duplicates |
| Daily limit reached | Upload refused with a clear message |

### Practice
| Problem | Behaviour |
|---|---|
| Result request fails | Queued in memory, retried when back online |
| Learner leaves mid-session | Answered cards are saved; session stays unfinished |
| Source has no words | Option disabled |

### Error codes
| HTTP | `code` | When |
|---|---|---|
| 400 | `invalid_request` | Body or parameters fail validation, or no photo was sent |
| 400 | `invalid_image` | The upload is not a JPEG |
| 400 | `unknown_candidate`, `invalid_article` | Save decisions don't fit the import (§6.5) |
| 404 | `import_not_found`, `not_found` | |
| 409 | `import_closed` | Photo for an import that is no longer collecting; save of an import that is done |
| 413 | `file_too_large` | Photo over 10 MB |
| 422 | `ai_refused`, `ai_invalid_output`, `page_too_long` | The photo failed (§12 Import) |
| 429 | `daily_limit` | §11.5 |
| 503 | `ai_busy` | Claude rate-limited, overloaded or unreachable after the SDK's retries |
| 500 | `internal` | Anything unexpected; the message includes the request id |

### General
Every error response has the body `{ "error": { "code": "...", "message": "..." } }` (`ApiError` in `core/`). Unexpected server errors return it with a message; the web app shows it in a toast. Server logs include the request id.

## 13. Testing

| Layer | What | How | Cost |
|---|---|---|---|
| Unit | Learning rules, candidate merging, dictionary match logic, session ordering | Vitest in `core/` and `server/` | Free |
| Server | Import flow (extract → merge → compare → dictionary → save → enrich), ignored words never re-offered, session selection per source, result recording, daily limit, error paths (429, refusal, invalid output, max_tokens) | Vitest + real PostgreSQL test database (Docker), AI client replaced by **recorded real Claude responses** (fixtures) | Free |
| Dictionary import | Mapping from kaikki JSONL to `dictionary_entries` | Vitest on a small sample file with expected rows | Free |
| Live | 2 real photos and one small enrich batch through the real Claude API; asserts schema validity, a sensible word count, articles only on nouns, and every call under a minute | `pnpm test:live`, run on demand (after AI changes, before milestones, when switching models) | ~15¢ per run |
| AI quality (optional) | 20–30 photos of real book pages with hand-checked word lists; reports word recall, lemma accuracy, article accuracy, dictionary mismatches | Script, run on demand to compare models | ~$2–3 per run on Opus |
| Manual | Layout, gestures, photo flow on the real device | iPhone on the local network | — |

Fixtures are created by running a few real photos through Claude once and saving the raw responses (`pnpm --filter server ai:try extract <photo> --save <name>`, `… enrich <words.json> --save <name>`; stored in `server/test/fixtures/ai/` with the prompt hash and timing). Cases that cannot or should not be provoked for real (refusal, `max_tokens`, invalid output, fallback, 429/5xx/connection errors) are built in the tests from a recorded response. Implementation follows test-first development.

## 14. Development setup

- `docker compose up -d` starts PostgreSQL (dev and test databases).
- `pnpm dev` starts the server (port 3000) and Vite (port 5173, `--host`). Vite proxies `/api` to the server, so the browser needs only one address.
- **iPhone:** same Wi-Fi, open `http://<Mac IP>:5173`. Photo picking works over HTTP. (Microphone access needs HTTPS — not needed for the prototype.)
- Configuration via `.env` (template: `.env.example`): `DATABASE_URL`, `TEST_DATABASE_URL`, `ANTHROPIC_API_KEY`, `AI_MODEL_EXTRACT`, `AI_MODEL_ENRICH`, `AI_EFFORT`, `DAILY_PHOTO_LIMIT`, `SERVER_PORT` (default 3000), `WEB_PORT` (default 5173).
- No login: anyone on the home network can open the app. Acceptable for the prototype.
- The server starts without `ANTHROPIC_API_KEY`; only the AI calls fail until it is set. The AI writes translations in the single user's `learner_language`, read at startup.

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
- **Cheaper models:** compare Opus 5.5 with Haiku 5.5 (`medium` effort, see §11.4 for the first measurements) using the AI quality test; the Wiktionary check guards a smaller model's grammar facts.
- **Text-to-speech (listening):** Azure Neural TTS, audio generated once per word/sentence and stored; slow version via SSML speaking rate. Free tier covers an A1–A2 deck. Alternatives: Google Chirp 3 HD, ElevenLabs (premium).
- **Speech (speaking):** Azure Pronunciation Assessment with the expected phrase as reference (de-DE and ko-KR supported, per-word and per-phoneme scores; phoneme labels are en-US only). Plain transcription (Whisper etc.) is unsuitable because it hides learner errors. Needs HTTPS for the microphone and possibly server-side audio conversion (ffmpeg) for iPhone recordings. Alternative to test: SpeechSuper.

## 16. Research notes (2026-10-11)

- **Vision/extraction model:** Claude Opus 5.5 ranked first in Roboflow's real-world OCR evaluation (updated 2026-10-08); `low` effort scored close to `high` at lower cost and latency. GPT-6.1 Sol and Gemini 3.8 Flash were strong alternatives but did not beat it. A separate OCR service plus a cheaper LLM is not worth it: transcription is already 93–97 % accurate, and the real risk (gender, plurals, lemmas) is not solved by OCR. No benchmark measures German article/plural accuracy — hence the Wiktionary check and the AI quality test.
- **Speech:** see §15. Browser Web Speech APIs are too inconsistent across devices for German.
