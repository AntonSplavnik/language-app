# Language App — Prototype Design

**Date:** 2026-10-11, last updated 2026-10-17
**Status:** Describes the built prototype (milestones M0–M8, `docs/plan.md`) and the Part 2 milestones built since (M9: past imports); kept in sync with the code

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
- Word pronunciation from Wiktionary: IPA, and recordings from Wikimedia Commons played on tap
- Per-word progress tracking
- "My words" list with edit, status change and delete
- AI usage tracking (tokens and time per call, from which the cost is worked out) and a daily photo limit
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
| Card back | German word with article, plural / verb forms, example sentence + translation; a speaker button when the word has a recording |
| Pronunciation | IPA and native-speaker recordings from Wiktionary (Wikimedia Commons), copied with the dictionary forms. Played only on tap, streamed from Commons, never stored. No text-to-speech fallback (§15) |
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
  - **Learning rules**: applying a card result to a word's progress (`applyResult(progress, result, now) → progress`).
  - **Card formatting** (`card.ts`): what the front and back of a card show, and which translation to show (`displayTranslation`: the learner's own wins).
- **`server/`** — the only unit that talks to the database and to Claude. Holds the API key. Each feature folder has its own `routes.ts` with its HTTP endpoints (§9); `app.ts` wires them together.
  - `db/` — Drizzle schema and migrations.
  - `ai/` — the Claude client (`AiClient`: `extractWords(jpeg, ctx)`, `enrichWords(words, ctx)`) on a swappable message transport, so tests replay recorded responses; the prompts; `ai_usage` rows.
  - `dictionary/` — Wiktionary lookups and the check rules; `scripts/import-wiktionary.ts` loads the reference table.
  - `imports/` — import flow: merge, compare, dictionary check, save.
  - `words/` — enrichment (`enrich.ts`), pronunciation from the dictionary and its backfill (`pronunciation.ts`), the learner's word list: list, detail, edit, delete (`service.ts`), and the query every word view is built on (`views.ts`).
  - `practice/` — session word selection and result recording.
  - `routes/stats.ts` — Home's counters; `http/errors.ts` — error responses (§12); `config.ts` — `.env` validation.
- **`web/`** — screens and interaction only: photo picking and shrinking, review list, card flip/swipe animation, keyboard shortcuts. All data access goes through the `core/` API client. Device features sit behind small wrappers (`pickPhotos()`, `shrinkImage()`, `playAudio()`), so a phone app only needs to replace those.

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
| Lint / format | Biome |

### Single user
A single user row is created by a seed migration (`0001_seed-single-user.sql`). The server uses its fixed id (`SINGLE_USER_ID`) for every request. Every learner-owned table has `user_id`, so adding accounts later does not change the schema.

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
| `forms_source` | `dictionary` / `ai`; `null` until enrichment has filled forms, and for parts of speech without forms |
| `example_de` | AI-written example sentence |
| `ipa` | Pronunciation from Wiktionary, e.g. `/tɪʃ/`; nullable (§6.6) |
| `audio_file` | Wikimedia Commons file name of the recording, e.g. `De-Tisch2.ogg`, whose file page carries its licence and author; nullable |
| `audio_url` | The recording as MP3 on `upload.wikimedia.org`, streamed by the browser when played; nullable |
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

Deleting a `user_words` row (§9.1) deletes its `card_results` (`ON DELETE CASCADE`); the shared `words` row and its translations stay.

### `imports`
| Field | Notes |
|---|---|
| `id`, `user_id` | |
| `name` | Optional, e.g. "Lesson 4"; typed before the first photo, given on the Done screen or changed later in Settings (§10). Without one, screens show the import's date (§10, import labels) |
| `status` | `collecting` (photos being added) / `reviewing` / `done` |
| `photo_count` | |
| `candidates` | JSON list of merged extraction results (see §6.3), so a reload never loses the review |
| `created_at`, `completed_at` | |

### `sessions`
| Field | Notes |
|---|---|
| `id`, `user_id` | |
| `source` | `import` / `last_7_days` / `not_learned` |
| `import_id` | The import practised, for source `import`; `null` otherwise (`ON DELETE SET NULL`). The migration that adds it turns the earlier `last_import` sessions into `import` ones, with the import that was the most recent `done` one when each started |
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
| `ipa`, `audio_file`, `audio_url` | The entry's pronunciation (§7), same meaning as in `words`; nullable |

### `ai_usage`
| Field | Notes |
|---|---|
| `id`, `user_id`, `import_id` | |
| `call_type` | `extract` / `enrich` |
| `model` | |
| `input_tokens`, `output_tokens` | From the API response `usage`; input includes cache-creation and cache-read tokens |
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
5. Server checks each candidate the photo added against dictionary_entries
6. Review screen: Add / Skip per word, one-tap fixes for dictionary mismatches
7. Save: words + user_words created (added → learning, skipped → ignored)
8. AI call 2 (enrich) for added words that are not yet enriched
```

### 6.2 Photos
- Picked with `<input type="file" accept="image/*" multiple>`, which on iPhone offers camera or photo library and works over plain HTTP.
- Shrunk in the browser with `createImageBitmap` (an `<img>` when that fails) + canvas → JPEG (quality 0.85, longest side 1600px). HEIC is decoded by Safari; if the browser cannot decode a file, the learner gets an error for that file only.
- Photos are uploaded one per request, extracted, and **not stored** on the server. The browser keeps them in memory until the import moves to review, so a failed photo can be retried without picking it again.

### 6.3 Candidates
Each candidate in `imports.candidates`:
```
{ key, lemma, pos, article, translation, photoIndex,
  existing: "none" | "in_my_words",
  dictionary: { status: "match" | "mismatch" | "not_found", genders?: [...] } }
```
- `key` is `lemma|pos|article` (empty article for non-nouns). Lemmas are trimmed (empty ones dropped), and an article on a word that is not a noun is dropped.
- **Duplicates** within an import are merged by `(lemma, pos, article)`; the first translation wins.
- **Comparison:** a candidate is `in_my_words` if the learner has a `user_words` row (any status, including `ignored`) for a `words` row with the same identity. A word the learner deleted from their list (§10, Edit word) has no such row, so a later import offers it as new again.
- **Dictionary check** (each candidate when a photo first adds it to the import): look up `dictionary_entries` by `lemma` + `pos` (exact match first, then case-insensitive). Words other than nouns that are not found under their own part of speech fall back to any non-noun entry with the same lemma, because sources label small words differently (Claude calls *nicht* a particle, Wiktionary an adverb). Nouns never fall back. Genders are merged across all entries found (*der See* and *die See*).
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

The whole save is one transaction that locks the import row. Every decision is validated first, so a rejected request changes nothing: an unknown `key` is `unknown_candidate`; two decisions for one key are `invalid_request`; an `article` other than the candidate's own is accepted only for a `mismatch` and only if it is one of the dictionary genders (`invalid_article`). Words are created in a fixed order so that two imports saving the same word at the same time create it once and cannot deadlock.

Photo uploads run the AI call outside any transaction, then lock the import row to merge, so photos uploaded at the same time don't overwrite each other's candidates.

Saving happens before enrichment, so the words exist (and are practisable with the extracted data) even if enrichment fails.

### 6.6 Enrichment
For each added word whose `words.enriched_at` is `null` (`server/src/words/enrich.ts`):
1. **Dictionary first:** if `dictionary_entries` has plural (nouns) or verb forms, copy them to `words`, `forms_source = dictionary`; copy the pronunciation (`ipa`, `audio_file`, `audio_url`) too. Both come from the entries that describe the word: for a noun those with its own gender (*der Band* → *Bände* /bant/, *die Band* → *Bands* /bɛnt/) or, when none has it, those without a gender (plural-only nouns such as *Eltern*); for other words every entry found (§6.3, including the non-noun fallback: *nicht* as a particle gets the adverb's recording). The pronunciation is the one of the first such entry with a recording, otherwise of the first with IPA. The copy happens before the AI call, so a word keeps its dictionary facts even if the AI fails. The AI never writes a pronunciation: a word without one in the dictionary has none.
2. **AI fills the gaps:** AI call 2 receives the words in batches of up to 30, three batches at a time. It always writes the example sentence and its translation, and writes plural / verb forms only for words where the dictionary had none (`forms_source = ai`). Each result is matched to its word by `ref`, and only used if its `lemma` is that word's lemma.
3. Set `enriched_at`. Updates only touch rows where `enriched_at` is still `null`, so two runs never write the same word twice.

A failed batch (AI busy, refused, invalid output) leaves its words pending; the other batches still count, and saving never fails because of enrichment. Save answers after enrichment, so the Review screen shows "Adding details…" meanwhile; the server finishes enrichment even if the phone drops the connection, and the phone then finds the import done and shows the Done screen.

A word already enriched by a previous import (any user) needs no AI call — this is the benefit of the shared `words` table.

**Pronunciation backfill:** enriched words never pass through enrichment again, so words saved before pronunciation existed get it from `pnpm --filter server backfill:pronunciation` (`backfillPronunciation()` in `server/src/words/pronunciation.ts`): every German word with neither `ipa` nor `audio_url` gets the dictionary pronunciation, chosen as above. Run it after re-importing the dictionary (it refuses while the dictionary has no recordings); it prints how many words it updated and is safe to run again, since a word that has a pronunciation is never touched. Measured on the author's list before running it: 141 of 149 practisable words have a recording in the dictionary, 134 an IPA.

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
  - **Pronunciation** (from the entry's `sounds`; each sound is checked on its own, so a malformed one never drops the entry): **`ipa`** is the entry's first IPA tagged `Germany`, otherwise its first IPA (*November* lists the Austrian /noˈfɛmbɐ/ first). The recording is the entry's best one: tagged `Germany` (almost all are "Germany, Berlin"), then untagged, then any (Austria, Bavaria…). **`audio_file`** is its Commons file name and **`audio_url`** its `mp3_url`, the MP3 transcode on `upload.wikimedia.org` (iPhone Safari cannot play Ogg); recordings hosted anywhere else are ignored. Wiktionary repeats the sounds on every entry of a word, but homographs with different sounds have their own (*der Band* /bant/, *die Band* /bɛnt/).
  - A test loads a 53-entry sample cut from the real file (`server/test/fixtures/kaikki-sample.jsonl`, made with `server/scripts/make-kaikki-sample.ts`), with the IPA and recordings of each entry.
- **Check from the command line:** `pnpm --filter server dict:lookup <lemma> <pos> [article]` prints the entries and the check result.
- **Re-running** the import replaces the table (truncate + insert in one transaction).
- **Licence:** CC BY-SA. Home's footer shows "Grammar data from Wiktionary (CC BY-SA), recordings from Wikimedia Commons". Commercial use needs a licence review.
- **Recordings:** the audio files live on Wikimedia Commons, each with its own free licence and author, shown on the file's page (a sample of ten German recordings: all CC BY-SA 2.5–4.0 or CC BY 2.0). The app stores only the file name and URL; the browser streams the MP3 from `upload.wikimedia.org` when the learner taps a speaker button (https audio plays on the plain-HTTP page). The recordings are credited together in Home's footer ("recordings from Wikimedia Commons", §10), not per word; `audio_file` still names each file, so its page with the licence and author can be found.
- **Known limits:** long compound nouns are often missing (→ `not_found`, AI data used); glosses are English only; plurals belong to the entry, not the meaning (*der Stock* lists *Stöcke*, the plural for "stick", also for the "floor" meaning); plural-only nouns have no gender.
- **Measured coverage (2026-10-11):** of the 218 words extracted from three real book pages, 205 were found and none had a different article. The 13 not found were textbook compounds (*Kinderbibliothek*, *Terminvereinbarung*), *TV* and *möchten* (filed as a form of *mögen*).
- **Pronunciation coverage (2026-10-12, same file):** of the 98,308 entries imported, 71,908 (73 %) have a recording and 60,481 (62 %) an IPA. Every recording in the file has an MP3 link; 19,532 file names contain spaces (Commons pages write them as `_`).

## 8. Practice

### 8.1 Session sources
Before starting, the learner chooses one source. Each option shows how many words it contains (all of them, e.g. "20 of 94 words"); options with no words are disabled, and the first option with words is preselected so a session starts in two taps (Home → Practice → Start). A session takes **up to 20 words** and never includes `ignored` words. An import's words are the `user_words` rows it created (`import_id`), so a word that import found already in the list is not part of it.

| Source | Words | Order |
|---|---|---|
| `import` | `learning` + `learned` words from one past import (§9.2), chosen in a menu (§10 Practice setup) that starts on the most recent one | Shuffled |
| `last_7_days` | `learning` + `learned` words with `added_at` in the last 7 days | Shuffled |
| `not_learned` | `learning` words | First words with `last_result = didnt_know` (most recently practised first), then the rest by `added_at` newest first |

An import with more than 20 such words gives a different shuffled 20 each session. The Done screen's **Practice these now** starts an `import` session for the import just saved.

### 8.2 Card
A large card (a surface with a hairline border, 32 px corners, a soft shadow; up to 520 px tall), its content centred. No language labels: the client doesn't know the learner's language.
- **Front:** translation (`custom_translation` if set, otherwise `word_translations.translation`), large in the display font, with the part of speech below it as a grey pill, e.g. "table" over "noun". "Tap to flip", with a small turn icon, at the bottom of the card.
- **Back:**
  - nouns: "der Tisch", "pl. die Tische", the article in its gender's colour (as in My words and on Word detail, §10)
  - verbs: "gehen", "ging · ist gegangen"
  - other: the lemma
  - the headword large (48 px, the display font), the forms under it in grey; then a short divider and the example sentence, with the word itself bold, underlined and (for a noun) in its gender's colour exactly as on Word detail's Example card (§10 screen 8), and its translation in grey; the learner's note if present, on a grey ground
  - if not enriched yet: whatever is available, plus a "Details pending" pill
  - a **speaker button** after the headword when the word has a recording (`audio_url`): a 48 px lime circle, as on Word detail. Nothing plays by itself: a tap plays the recording (tapping again starts it over), its waves pulse while it plays, and "Couldn't play the recording" appears as a toast if it fails. One sound plays at a time; moving to the next card stops it. The front never has one: hearing the word would give the answer away. Words without a recording show no button.
- **Flip:** tap (or Space) turns the card with a 3D flip animation; tapping again turns it back. A tap on the speaker button plays and does not flip; a swipe may still start on it, and then nothing plays. The face turned away is `inert`, so its button can't be tapped or focused. Space on the focused speaker button plays rather than flips.

### 8.3 Gestures and keys
| Action | Touch | Keyboard | Button |
|---|---|---|---|
| Flip | Tap | Space | — |
| Knew it | Swipe right | → | Knew it |
| Didn't know | Swipe left | ← | Didn't know |
| Skip | Swipe up | ↑ | Skip |

The card follows the finger, tilts, and slides out in the swipe direction; a short swipe snaps back. A swipe counts when the card moved more than 100 px, or was flicked faster than 0.5 px/ms after at least 24 px; the larger of the two movements decides the direction, and swiping down does nothing. While dragging, a tilted stamp (Knew in lime, Didn't know in red, Skip in grey) fades in and the card's edge takes the same colour as the swipe gets closer to counting; once the card has moved far enough to count, the matching button below grows slightly.

**iOS Safari:** a sideways swipe anywhere on a page means "go back" in Safari, which clashed with the right swipe. The flashcard screen cancels native touch movement (`touchmove` with `preventDefault`; the screen doesn't scroll), which stops it. A swipe that starts at the very screen edge is a system gesture no page can cancel, so the card keeps 32 px from each edge. Added to the Home Screen, the app runs full screen without Safari's navigation gestures (§14). Answering is allowed with or without flipping; `flipped` means the card was turned over at any point before the answer, and `flip_ms` is the time to the first flip.

### 8.4 Recording
Each answer is sent immediately (`POST /api/sessions/:id/results`). If the request fails, answers are queued in memory, in order, and retried every 5 s and as soon as the browser reports it is online again. An answer the server rejects for good (4xx, e.g. the word was deleted meanwhile) is dropped with a message. After the last card, the session is finished only once every answer has been sent (tried again every 3 s); while offline the screen says the answers are kept. Leaving mid-session loses only answers that never reached the server, because the queue lives in memory. The session's cards and the current position are kept in the tab (`sessionStorage`), so a reload continues at the same card. Each card can be answered once per session (`UNIQUE (session_id, user_word_id)`): a retried request returns `recorded: false` and changes nothing.

### 8.5 Learning rules (`core/`)
| Result | Effect on `user_words` |
|---|---|
| `knew` | `times_seen +1`, `times_correct +1`, `correct_streak +1`; if `correct_streak ≥ 3` → `status = learned` |
| `didnt_know` | `times_seen +1`, `correct_streak = 0`; if `learned` → `status = learning` |
| `skipped` | No change |

`knew` and `didnt_know` also set `last_result` and `last_practiced_at`.

### 8.6 Summary
After the last card, under the large title "Session done": a results card with "14 of 20 knew" (the knew count large, in the accent; the 20 counts every card answered, skipped ones included; a session without cards shows only the counts), a bar split into knew / didn't know / skipped shares (lime, red, grey; an answer nobody gave has no share) and the three counts, each with its coloured dot. Then "Words you missed" with their number, the missed words in the order they were answered (the headword as on the card back, the article in its gender's colour, with the translation at the right), as rows on the page like My words; and the buttons **Home** and **New session** side by side. A reloaded Summary no longer has the counts and says "Session finished. Your answers are saved." The session gets `finished_at` the first time it is finished; finishing again returns the same summary.

## 9. API

All routes under `/api`, JSON unless noted. Request and response shapes are Zod schemas in `core/`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{ status: "ok" }` |
| GET | `/stats` | Home counters (learning, learned), `detailsPending` (the learner's non-ignored words without details) and unfinished imports |
| GET | `/imports` | Past imports → `{ imports }`, see §9.2 |
| POST | `/imports` | Create import `{ name? }` (trimmed, at most 100 characters) → 201 + import |
| PATCH | `/imports/:id` | Rename `{ name }` → `{ id, name }`, see §9.2 |
| POST | `/imports/:id/photos` | Upload one JPEG (multipart field `photo`, at most 10 MB) → extract, merge, compare, check → `{ pageQuality, wordsFound, import }`. Only while the import is `collecting` |
| GET | `/imports/:id` | Import with candidates; `existing` is recomputed on every read |
| POST | `/imports/:id/review` | Move import to `reviewing` (no more photos) → import; 409 `import_closed` once it is done |
| POST | `/imports/:id/save` | `{ decisions: [{ key, action: add \| skip, article? }] }` → save, then enrich → `{ added, skipped, detailsPending }`. Allowed once, from `collecting` or `reviewing` |
| POST | `/words/enrich-pending` | Retry enrichment for the learner's `learning` / `learned` words with `enriched_at = null` → `{ enriched, pending }` |
| GET | `/words?status=&q=&importId=&sort=` | The learner's words → `{ words, counts }`, see below |
| GET | `/words/:userWordId` | → `WordDetail`, see below |
| PATCH | `/words/:userWordId` | `{ status?, customTranslation?, note? }` → `WordDetail`, see below |
| DELETE | `/words/:userWordId` | → `{ deleted: true }`, see below |
| GET | `/sessions/options` | `{ options: [{ source, count }] }`, in display order; `import`'s count is that of the most recent past import (§8.1), 0 when there is none |
| POST | `/sessions` | `{ source, importId? }` → `{ id, source, cards }`; `importId` is required for `import` and not allowed otherwise (400 `invalid_request`); 404 `import_not_found` for an import that isn't `done` or isn't the learner's; 400 `no_words` for a source without words (also a `done` import without `learning` or `learned` words) |
| POST | `/sessions/:id/results` | `{ userWordId, result, flipped, flipMs, answerMs }` → `{ recorded }` |
| POST | `/sessions/:id/finish` | → `{ knew, didntKnow, skipped, missed }` |

Errors are listed in §12. Ids of another learner's rows answer like unknown ids (404).

### 9.1 Word endpoints
A `WordView` is what a card shows (§8.2): `userWordId`, `lemma`, `pos`, `article`, `plural`, `forms`, `translation`, `customTranslation`, `exampleDe`, `exampleTranslation`, `note`, `enriched`, `ipa`, `audioFile`, `audioUrl`.

- **`GET /words?status=&q=&importId=&sort=`** — `status` (`learning` / `learned` / `ignored`) filters; absent means all. `q` is a case-insensitive substring of the German lemma, the stored translation or the learner's custom translation; `%` and `_` match themselves, a blank `q` is no search. `importId` keeps only the words that import created (any status, so its skipped words are in the Ignored tab); an id that isn't one of the learner's imports simply matches nothing. `sort` is `az` (the default: by lemma, ignoring case) or `newest` (`added_at` newest first, then the newest row first). Each word is a `WordView` plus `status`, `timesSeen`, `correctStreak` (for the progress mark) and `addedAt` (for the day headings). `counts` gives the words per status that match `q` and `importId`, whatever `status` asked for, so the tabs can show where the matches are. No paging: the prototype's list has a few hundred words.
- **`GET /words/:userWordId`** — `WordDetail`: a `WordView` plus `status`, `formsSource`, `checkStatus`, `timesSeen`, `timesCorrect`, `correctStreak`, `lastResult`, `lastPracticedAt`, `addedAt`. 404 `word_not_found`.
- **`PATCH /words/:userWordId`** — fields left out stay as they are. Texts are trimmed; an empty or blank text, or `null`, clears the field (stored as `NULL`). At most 200 characters for the translation and 2000 for the note (400 `invalid_request`). Changing the status to `learning` resets `correct_streak` to 0, so the next correct answer does not mark the word learned again at once; `times_seen` and `times_correct` stay. Answers with the updated `WordDetail`; 404 `word_not_found`.
- **`DELETE /words/:userWordId`** — deletes the `user_words` row and its `card_results`. The shared `words` row and its translations stay, so a later import offers the word again as new, and adding it again reuses its details without an AI call. 404 `word_not_found`.

### 9.2 Past imports
- **`GET /imports`** — the learner's **past imports**: `done` imports with at least one `learning` or `learned` word, newest first (`completed_at`, then id). Each is an `ImportSummary`: `id`, `name`, `completedAt`, and `wordCount`, its `learning` + `learned` words (what a session from it can draw on, at least 1). An import that added nothing to learn never gets an entry: one whose pages had no new words, one whose new words were all skipped, and one whose words were later all deleted or set to Ignored. The import row itself stays (it is `done`, and its skipped words keep their `import_id`); it is only left out of the list, and comes back if one of its words is moved back to Learning. Unfinished imports stay Home's banners (§10 screen 1).
- **`PATCH /imports/:id`** — `{ name }`, trimmed, at most 100 characters (400 `invalid_request`); an empty or blank name, or `null`, clears it. Allowed in any status. Answers `{ id, name }`; 404 `import_not_found`.

## 10. Screens

```
Home ─┬─► Import ──► Review ──► Done ─► (Practice these now)
      ├─► Practice setup ──► Flashcards ──► Summary
      ├─► My words ──► Word detail ──► Edit word
      └─► Settings ──► Imports ──► Import ──► Rename import
```

Mobile-first layout, usable on desktop; light and dark follow the system. How screens look (colour, type, cards, buttons, headers, the sticky action bar, toasts) is the design system in `docs/design-system/`, starting from its `README.md`. This section says what each screen shows and does.

**Import labels.** Wherever a past import is listed (Practice setup, My words, Settings) it is shown by its name, or without one by the day it was completed ("13 Oct", with the year when it isn't this year). When several unnamed imports share a day, each of them also shows its time ("11 Oct, 14:32"). Dates and times are the phone's.

1. **Home** — top to bottom:
   - the title, "German words", with a round **Settings** button (a gear) at the right end of its line;
   - once there are learning or learned words, the **deck card**: how many words are not ignored ("149 words", large), the share of them learned as text ("12% learned", rounded down, so it says 100% only when every word is learned) and as a bar, and the Learning and Learned counts. (Ignored words are not counted here.);
   - only when there is unfinished work, as cards: a banner for each import not yet `done` that has at least one photo ("Continue importing Lesson 4" while collecting, "Finish reviewing Lesson 4" once reviewing; an unnamed import shows its date), and "N words without details yet" + **Add details** when enrichment is pending;
   - **Practice**, the main button (a big lime button with a play circle), once there are learning or learned words, with what it draws from on a second line ("136 words to practise"; "Review learned words" when every word is learned);
   - two tiles side by side: **My words** with the counts ("136 learning · 0 learned"); the whole tile opens the Learning tab of My words, and it is Home's only way there; and **New import** ("Add more words"), an outlined tile. While there are no words yet, New import is the main button instead (big and lime, a plus in the circle), with the hint "Photograph the pages you studied to collect their new words." below it, and the My words tile under that;
   - the credit in the footer: grammar data from Wiktionary (CC BY-SA), recordings from Wikimedia Commons.
2. **Import** — add photos (thumbnails, remove), optional name, per-photo state (preparing / reading / done with word count / failed + Retry / poor quality + Retake), **Review words** when at least one photo is done.
   - The title is the import's name, large ("New import" before the import exists, "Import" when it has no name). Before the first photo: the **Name (optional)** field and a large dashed drop zone, "Take or choose photos" over "Photograph the pages you studied", with a lime camera square. Then the photos as tiles, two per row: the thumbnail (dimmed while it is read), a small round remove button (a cross) where removing is allowed, and its state with an icon: a check and "13 words" in the accent, a spinner and *Preparing* / *Reading*, "Couldn't read much from this page" in warning colour, the error in red, or "Waiting…"; **Retry** and **Retake** are full-width buttons under it. **Add more photos** is the grid's last cell, dashed like the drop zone. The number of words found so far is a pill after **Review words**; the hint under it ("Wait until every photo is read") stays.
   - The import is created when the first photo is sent, so leaving the screen early leaves nothing behind; the name is typed before that and can't be changed on this screen (it can on Done and in Settings). The URL moves from `/imports/new` to `/imports/:id` without losing the photos in memory.
   - Photos are shrunk one at a time (phone memory) and sent at most two at a time. "Uploading" and "reading" are shown as one state, *Reading*: `fetch` reports no upload progress, and a shrunk photo is only ≈0.5 MB.
   - A photo can be removed before it is sent or after it failed; once read, its words stay in the import (they can be skipped in review). **Retry** appears only for failures worth retrying with the same photo (AI busy, invalid output, network, an unexpected server error); otherwise the message says what to do (e.g. "photograph it in two parts").
   - **Review words** is enabled only when nothing is still being prepared or read, because starting review closes the import to photos. Photos read in an earlier visit count (“2 photos read earlier; their words are kept”).
3. **Review** — §6.4. **Save N words** → "Adding details…" → **Done**: "17 words added" with **Practice these now** (starts an `import` session from this import, §8.1). With nothing set to Add the button reads **Skip all N words** (or **Finish** when there are no new words) and shows "Saving…".
   - Decisions are kept on the device (`localStorage`, per import) until saved, so a reload keeps them; another device starts from "all Add". Opening Review for an import that is still collecting starts the review.
   - Under the large title (the import's name, else "Review words"): "**9** new words · **8** to add" with **Add all** and **Skip all** as pills at the right. "4 already in your words" is a quieter card that opens (its chevron turns) to list those headwords, articles in their gender colours. Every new word is a card, and the whole card is one Add/Skip toggle: the headword (article coloured) over "translation · part of speech", a "not in dictionary" pill under them when Wiktionary doesn't have the word, and the state at the right, a lime **Add** pill with a check or a grey **Skip** pill; a skipped card is dimmed and its headword struck through. An article mismatch is a warning-coloured strip across the card's bottom ("AI: der Sofa · Dictionary: das Sofa", a warning icon, one **Use das** button per dictionary article, filled in the warning colour); once applied the strip turns teal, "Dictionary article applied" with **Undo**. "Every word on these pages is already in your list." when there is nothing new.
   - Done offers **Practice these now** (when words were added), **Import more pages** and **Home**. A reloaded Done screen no longer has the counts and just says "Import saved". On Home, **Practice** is the main button once there are words and **New import** the second (screen 1).
   - Done has no back button; "Done" is a small grey label at the top, and the result is the big text: a lime circle with a check inside two thin rings, "8 words added" (or "Import saved") large, then "1 skipped; they won't be suggested again." and, with a small sparkle in teal, "Example sentences and forms are ready." (when they are), or the "N words without details yet" card with **Add details**. In the action bar, one above the other: **Practice these now** (the big lime button, with a play triangle), **Import more pages** and a quiet grey **Home**.
   - **Nothing added:** when the save added no words, the big text is "No words added", with "Every word on these pages is already in your list." under it when the pages had no new words, or "N skipped; they won't be suggested again." when every new word was skipped. Such an import gets no entry among the past imports (§9.2), so Done offers neither **Practice these now** nor naming.
   - **Naming:** when the import is among the past imports (`GET /imports`) and has no name, a card under the result offers one: the small uppercase label **Name this import** (as on Edit word), a text field with the placeholder "e.g. Lesson 4" (16 px, so iOS Safari doesn't zoom) and a **Save** pill beside it, enabled once something other than spaces is typed; Enter saves too. Once saved the card becomes one line with a check, "Saved as “Lesson 4”". Done reads the past imports to find this one and its name, so a reloaded Done screen offers it too; an import that already has a name, isn't listed, or a read that fails, shows no card. If saving fails, a toast says so and the typed name stays.
4. **Practice setup** — three sources with counts, **Start**. The large title "Practice" with "What to practise" under it; each source a card with an icon (a camera for Import, a calendar for Last 7 days, a target for Not learned yet), its name and description, and its count at the right in two lines ("20" over "of 149 words"; "No words" alone). The chosen card has an accent edge and a lime icon square; a source without words is faded and can't be chosen. Real radio buttons underneath, so the keyboard and screen readers work as with any radio group. **Start**, with a play triangle, in the action bar.
   - The **Import** card has, in place of a description, a menu of the past imports (`GET /imports`): a native select (16 px or more, the phone's own picker), newest first, each by its label (import labels above). Every import in it has words to practise (§9.2). The menu starts on the most recent; choosing an import in it also chooses the Import card, and the count at the right is that import's. Without past imports the card is faded with "No words" and has no menu; the description "The words of one import" takes its place.
5. **Flashcards** — card, swipe hints, buttons below the card. The header has a round close button (a cross; End practice, back to Home) and, filling the row, "Practice" with the position at the right ("**5** / 20") over a thin progress bar filled by the cards answered so far. The card is described in §8.2, the stamps while dragging in §8.3; under it "Tap to flip · swipe → knew · ← didn't know · ↑ skip". The three buttons below are tall, an icon over a short label: **Didn't know** (a cross on a soft red ground), **Skip** (an up arrow, outlined) and **Knew it** (a check on lime). After the last card the screen says "Saving your answers…" with a spinner (or that there is no connection), and offers **Try again** if finishing failed.
6. **Summary** — §8.6.
7. **My words** (`/words?status=learning&q=…`) — the title "My words", large, under the round back button, with the number of words (all tabs; not shown while searching) at the right of the header; a search box; the view menu; the tabs Learning / Learned / Ignored with their counts, as a segmented control whose current tab is a high-contrast pill; the list.
   - The tab, the search and the view live in the URL (`status`, `q`, `sort=newest`, `import=5`; replacing the history entry, not adding one), so a reload or Back from a word returns to the same list. Learning is the default tab.
   - **View menu**, under the search box: a native select shown as a pill ("All words · A–Z" with a chevron; 16 px, the phone's own picker). It offers **All words · A–Z** (the default), **All words · Newest first**, then, under the heading "Imports", every past import (`GET /imports`) by its label, newest first. Choosing an import shows only the words it created, A–Z with letter sections; the header's number, the tabs, their counts and the search all apply within it. An import in the URL that is no longer in the menu (its words were all deleted) falls back to All words · A–Z. Until the imports have loaded, an import in the URL shows in the pill as "One import".
   - **Newest first** splits the list by the day the words were added instead of by letter: "Today", "Yesterday", then the date ("13 Oct", with the year when it isn't this year), by the phone's time.
   - The search runs 250 ms after typing stops, or at once on Enter (which also closes the keyboard). It searches every tab: when the current tab has no match, the empty state links to the tabs that have ("2 in Ignored ›"); the same happens when the current tab has nothing from the chosen import ("No learned words from this import." over "9 in Learning ›"). The field uses a 16 px font so iOS Safari doesn't zoom in.
   - A row shows the headword (article + lemma, as on the card back, the article in its gender's colour as on Word detail), the translation (the learner's own if set) and a short progress mark: a "new" pill for a learning word never practised, otherwise `LEARNED_STREAK` dots with one filled per right answer in a row towards learned (a screen reader says "1 of 3 right in a row"); nothing for learned or ignored words. Rows sit on the page without a box, a hairline between them; the whole row opens Word detail (no chevron).
   - Without a search the A–Z list is split into letter sections (A, B, …). Accents are folded, so *Ärger* sits under A, and words that don't start with a letter go under "#". A section starts only where the letter changes from the word before, so the server's order is never changed. Search results are one list, without headings, in either order.
   - Empty tabs say what belongs there, under a book icon and a bold first line (Learned: "No learned words yet." and "A word counts as learned after 3 right answers in a row."); the Learning tab offers **New import**.
8. **Word detail** (`/words/:id`) — a page of cards: the word and its meaning, the example, the note, and the progress, each card only when it has something to show. The header has just the round back button and, at its right end, a round **Edit** button (a pencil; opens Edit word). Then:
   - the top card. For a noun with an article, a small chip in its gender's colour over the word: "der · masculine", "die · feminine", "das · neuter" (der blue, die red, das teal — teal, not green, so it can't be taken for the lime accent; the text has at least 4.5:1 on its chip in both colour schemes). The headword as on the card back is the screen's title, large (44 px, the display font), with a noun's article in its gender's colour (as in the My words list). A long word wraps (hyphenated where the browser can). When the word has a recording, the speaker button (as on the card back, §8.2, but 56 px) sits at the right end of the word's first line and never shrinks, so it stays on screen. The recording has no credit of its own here: recordings are credited in Home's footer (screen 1, §7);
   - under the word, one muted line: the IPA, the part of speech and the forms in the card's wording ("/tɪʃ/ · noun · pl. die Tische", "verb · ging · ist gegangen"; no IPA when Wiktionary has none). When the forms don't fit on that line they go on a line of their own;
   - below a hairline, **Meaning**: the translation the cards show, large (28 px) and only once; when the learner has their own, a small line under it gives the stored one (originally “table”);
   - at most one small line on where the grammar came from, only when it is unusual: "Wiktionary gives a different article; the AI's was kept" (`mismatch_kept`, in warning colour), "Article corrected to match Wiktionary" (`mismatch_fixed`), "Not in Wiktionary, so the grammar comes from the AI" (`not_in_dictionary`), or "Forms from AI" for a word found in Wiktionary whose shown forms came from the AI. A word found in Wiktionary with its forms from there shows nothing;
   - **Example** card: the sentence with the word itself in bold and underlined, in its gender's colour for a noun, and its translation. A word of the sentence is bold when it equals, ignoring case, the lemma, the plural, the Präteritum, the Partizip II or the verb's stem (the lemma without -en, else without -n: *geh*, *wander*), or starts with one of these (3 letters or more) followed by at most 3 letters: *Anrufe*, *Anrufs*, *gehst*, *gingen* and *Häuser* (through the plural) are bold, *Anrufbeantworter* is not, and "an" bolds only "an". A form of several words ("fing an", "zum Beispiel") only matches as a whole phrase, so the split present tense of a separable verb ("Bitte kreuzen Sie … an") is not bolded (`highlightWord` in `core/`). A word without details yet shows "Example and forms not added yet. Use Add details on Home." in this card instead;
   - **Note** card: the learner's note, read-only with its line breaks, when there is one;
   - the progress card. For a learning word only, the streak towards learned: "Streak" with "1/3" at the right, and `LEARNED_STREAK` segments across the card, one filled per right answer in a row; a word never practised shows the empty segments and "0/3". Then one muted line, "Seen 4 times · Last: didn't know, yesterday · Added 3 Oct" or "Seen 0 times · Added yesterday", with the status at its right (under it when there is no room): a native select (Learning / Learned / Ignored; 16 px or more, so iOS Safari doesn't zoom) that saves when changed, with a toast ("Moved to Learned"); it shows a spinner while saving, and the saved status again if saving fails. Moving a word back to Learning resets its streak (§9.1);
   - Back returns to the list the word was opened from (tab and search). A word that no longer exists says "This word is not in your list any more".
9. **Edit word** (`/words/:id/edit`) — the learner's own texts and deleting the word. A screen of its own, not a modal: on the iPhone a swipe back over a modal would leave the word, and bottom sheets fight Safari's keyboard. It looks like an iOS sheet: **Cancel** at the left of the header, the headword as the title (the article in its gender's colour), **Save** at the right (enabled only when a text really changed, compared trimmed as stored), no back chevron. Cancel and Save are pills; Save is lime when there is something to save and grey otherwise.
   - **Your translation** (the stored one as placeholder, "Shown on cards instead of “table”. Leave empty to use it."; Enter saves) and **Note** (shown on the card back), each on a card of its own: a small uppercase label, the field sunk into the card, the help text under it.
   - **Save** stores the changes, shows "Saved" and returns to Word detail, which loads the word again. **Cancel**, like the browser's Back, drops the typed texts without asking. Neither adds a history entry: opened from Word detail, they go back to it; opened directly (a typed URL), the detail replaces the edit screen. Either way the detail's Back still goes to the list it was opened from.
   - **Delete word** (soft red, with a bin icon), at the bottom of the screen, asks in place, not with a browser dialog, in a red-tinted card with a bin icon, the question in bold over the rest, and **Keep** / **Delete** side by side: "Delete “der Tisch” from your words? Its progress and note are lost, and a later import may offer it again as a new word. To stop practising it for good, set its status to Ignored instead." After deleting, a toast "“der Tisch” deleted" and the list; Back must not lead to the deleted word. When the history is list → detail → edit, the app goes back two entries, to that list; otherwise the list replaces the edit screen.
   - A word that no longer exists says "This word is not in your list any more", as on Word detail.
10. **Settings** (`/settings`) — a menu: the round back button, the large title "Settings", then one card with a row per section: its name, a short status at the right in grey and a chevron; the whole row opens the section. Other sections (such as the daily goal, plan M16) will join this card. For now one row:
    - **Imports**, with the number of past imports at the right ("5"; nothing while there are none), opens Imports.
11. **Imports** (`/settings/imports`) — the round back button (to Settings), the large title "Imports", and the past imports (`GET /imports`), newest first, as rows on the page like My words' rows, a hairline between them, each with a chevron: the label (import labels above) in bold, and under it in grey the day when the import has a name, and its words ("13 Oct · 9 words", "54 words"). The whole row opens the import. Without any: "Your imports will appear here."
12. **Import** (`/settings/imports/:id`) — the round back button (to Imports), the import's label as the large title, and one muted line under it: its words and the day it was added ("9 words · added 13 Oct"). Then a card of actions, for now one row: **Rename** with a chevron, which opens Rename import. Later actions on an import (deleting it, for example) join this card. The page finds the import among the past imports; one that isn't there (any more) says "This import is not in your list any more" with a link to Imports.
13. **Rename import** (`/settings/imports/:id/rename`) — like Edit word (screen 9): **Cancel** at the left of the header, "Rename" as the title, **Save** at the right, lime and enabled only when the trimmed text differs from the name. One card: the small uppercase label **Name**, the field with the current name (the day as placeholder; 16 px) and the help text "Leave empty to show the date instead." Enter saves; an emptied field clears the name. **Save** stores it, shows a toast "Renamed" and returns to the import's page, which shows the new title. **Cancel**, like the browser's Back, drops the typed text. Neither adds a history entry, as on Edit word: opened from the import's page they go back to it; opened directly, the import's page replaces this screen. If saving fails, a toast says so and the typed name stays. An import that is no longer listed says so, as on its page.

## 11. AI calls

### 11.1 Common settings
- **SDK:** `@anthropic-ai/sdk`, beta client (`client.beta.messages.create`, needed for `fallbacks`). Structured outputs: the Zod schemas from `core/` are converted to JSON Schema with the SDK's `betaZodOutputFormat` and sent as `output_config.format`; responses are parsed by our own code, not `messages.parse()`. The SDK turns enum values into schema descriptions rather than hard constraints, so every response is validated again with Zod before use. `thinking` is never sent (Opus 5.5 always thinks adaptively; disabling it is a 400).
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

Error kinds differ: Sonnet's mistakes are mostly extra words the learner can skip, while Haiku's split separable verbs produce a wrong lemma. The author's development `.env` uses Haiku 5.5 at `medium`; the code defaults and `.env.example` stay Opus 5.5 at `low`.

### 11.5 Daily limit
`DAILY_PHOTO_LIMIT` (default 50) extract calls per user per day, counted from `ai_usage` and checked before each upload. Every extract attempt counts, including failed ones and the retry after invalid output; the day starts at the server's local midnight. Beyond it, photo upload returns an error: "Daily photo limit reached".

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
| `stop_reason = max_tokens` (or `model_context_window_exceeded`) | Failed photo: "Page too long — photograph it in two parts" |
| Enrichment fails | Words stay saved; cards show "Details pending"; Done screen and Home show "N words without details" + **Add details** (`/words/enrich-pending`) |
| Learner leaves during review | Import stays `reviewing`; Home shows a banner to finish it |
| Same word saved twice concurrently | Unique constraints + upsert; no duplicates |
| Daily limit reached | Upload refused with a clear message |
| Naming or renaming an import fails (Done, Settings) | Toast; the typed name stays |

### Practice
| Problem | Behaviour |
|---|---|
| Result request fails | Queued in memory, retried when back online |
| Learner leaves mid-session | Answers that reached the server are saved; session stays unfinished |
| Source has no words | Option disabled |
| A word in the session was deleted meanwhile | Its answer gets 404 `word_not_found` and is dropped with a message (§8.4) |
| A recording can't be loaded or played (offline, file gone, browser refused) | Toast "Couldn't play the recording"; the card and the session are unaffected |

### My words
| Problem | Behaviour |
|---|---|
| Word detail or Edit word opened for a word that was deleted | "This word is not in your list any more" + link to My words |
| Loading the list or a word fails | Inline message with **Try again** |
| Loading the view menu's imports fails | Toast; the list still loads as asked, and the menu offers only the two All words views (plus "One import" for an import in the URL) |
| Saving a change or deleting fails | Toast; typed texts stay, a status change is undone on screen |
| A recording can't be played | Toast "Couldn't play the recording" |

### Error codes
| HTTP | `code` | When |
|---|---|---|
| 400 | `invalid_request` | Body, query or parameters fail validation, no photo was sent, or two save decisions for one key. Fastify's own client errors (malformed JSON, wrong content type) keep their 4xx status |
| 400 | `invalid_image` | The upload is not a JPEG |
| 400 | `unknown_candidate`, `invalid_article` | Save decisions don't fit the import (§6.5) |
| 400 | `no_words` | Practice source without words |
| 404 | `import_not_found`, `session_not_found`, `word_not_found`, `not_found` | Unknown id, or one of another learner; `not_found`: no such route |
| 409 | `import_closed` | Photo for an import that is no longer collecting; review or save of an import that is done |
| 413 | `file_too_large` | Photo over 10 MB |
| 422 | `ai_refused`, `ai_invalid_output`, `page_too_long` | The photo failed (§12 Import) |
| 429 | `daily_limit` | §11.5 |
| 503 | `ai_busy` | Claude rate-limited, overloaded or unreachable after the SDK's retries |
| 500 | `internal` | Anything unexpected; the message includes the request id |

### General
Every error response has the body `{ "error": { "code": "...", "message": "..." } }` (`ApiError` in `core/`). An unexpected server error answers 500 `internal` with "Something went wrong (request <id>)"; the details stay in the server log under that request id. The API client turns every failed call into an `ApiClientError` with the server's code, or `network` (no response), `http_error` (an error without that body) or `invalid_response` (a body that fails its schema). The web app shows the message in a toast, or inline with **Try again** where the screen has nothing else to show.

## 13. Testing

| Layer | What | How | Cost |
|---|---|---|---|
| Unit | Learning rules, card formatting, API client, candidate merging, dictionary match logic, swipe thresholds, result queue, audio player (fake `<audio>` elements), photo / review / word-form helpers, the bold word in an example sentence, Word detail's labels, Edit word's and Rename import's history steps, import labels and finding an import among the past imports, My words' day headings | Vitest in `core/`, `server/` and `web/` | Free |
| Server | Import flow (extract → merge → compare → dictionary → save → enrich), ignored words never re-offered, session selection and order per source, result recording, word list search / import filter / sort / edit / delete, past imports and renaming, the migration that turns `last_import` sessions into `import` ones, daily limit, error paths (429, refusal, invalid output, max_tokens, JSON 500) | Vitest + real PostgreSQL test database (Docker), the AI transport replaying **recorded real Claude responses** (fixtures; enrichment tests vary one recorded response) | Free |
| Dictionary import | Mapping from kaikki JSONL to `dictionary_entries`, including the choice of IPA and recording; the pronunciation backfill | Vitest on a small sample file with expected rows | Free |
| Live | Up to 2 real photos (from the git-ignored `server/test/live/photos/`) and a 3-word enrich batch through the real Claude API, with the models set in `.env`; asserts schema validity, a sensible word count, articles only on nouns, and every call under a minute | `pnpm test:live`, run on demand (after AI changes, before milestones, when switching models) | ~15¢ per run on Opus 5.5, ~1¢ on Haiku 5.5 |
| AI quality (optional, not built yet) | 20–30 photos of real book pages with hand-checked word lists; reports word recall, lemma accuracy, article accuracy, dictionary mismatches | Script, run on demand to compare models; needs the hand-checked pages first | ~$2–3 per run on Opus |
| Manual | Layout, gestures, photo flow on the real device | iPhone on the local network | — |

Fixtures are created by running a few real photos through Claude once and saving the raw responses (`pnpm --filter server ai:try extract <photo> --save <name>`, `… enrich <words.json> --save <name>`; stored in `server/test/fixtures/ai/` with the prompt hash and timing). Cases that cannot or should not be provoked for real (refusal, `max_tokens`, invalid output, fallback, 429/5xx/connection errors) are built in the tests from a recorded response. Implementation follows test-first development.

## 14. Development setup

- `docker compose up -d` starts PostgreSQL (dev and test databases).
- `pnpm dev` migrates the dev database, then starts the server (127.0.0.1:3000) and Vite (all interfaces, port 5173, `strictPort`). Vite proxies `/api` to the server, so the browser needs only one address.
- The dictionary is loaded once with `pnpm --filter server import:wiktionary <file>` (§7); without it every word is `not_found`. A database with words saved before pronunciation existed then needs `pnpm --filter server backfill:pronunciation` once (§6.6).
- Checks: `pnpm test` (never calls Claude), `pnpm typecheck`, `pnpm check` (Biome; `pnpm format` fixes formatting). `ai:try` and `pnpm test:live` shrink photos with macOS `sips`.
- **iPhone:** same Wi-Fi, open `http://<Mac IP>:5173`. Optionally Share → **Add to Home Screen** (`web/public/manifest.webmanifest`, Apple web-app meta tags): it then opens full screen as "Words", without Safari's swipe gestures. The Mac still has to run `pnpm dev`. Photo picking works over HTTP. (Microphone access needs HTTPS — not needed for the prototype.)
- Configuration via `.env` (template: `.env.example`): `DATABASE_URL`, `TEST_DATABASE_URL`, `ANTHROPIC_API_KEY`, `AI_MODEL_EXTRACT`, `AI_MODEL_ENRICH`, `AI_EFFORT`, `DAILY_PHOTO_LIMIT`, `SERVER_PORT` (default 3000), `WEB_PORT` (default 5173).
- No login: anyone on the home network can open the app. Acceptable for the prototype.
- The server starts without `ANTHROPIC_API_KEY`; only the AI calls fail until it is set. The AI writes translations in the single user's `learner_language`, read at startup.

## 15. Later

Recorded here so decisions already made are not lost.

**Planned** (`docs/plan.md`, Part 2; each feature moves into the sections above when it is built):
- Adding a word by hand (M10); importing pages of a PDF (M11)
- Themes tagged by the AI from a built-in list and corrected by the learner; the learner's own groups (M12)
- Combinable filters in My words and Practice: theme, group, part of speech, gender, plural-only nouns, import, date added (M13)
- Practice modes German → English, articles, plurals, verb forms (M14)
- Spaced repetition (M15); progress over time: daily goal, streak, history (M16)
- Basics: the alphabet (M17), numbers (M19) and time (M20), each an explanation and its own practice; text-to-speech (M18)
- After M20: CI/CD and deployment with a login, backups, gamification

**Not planned yet:**
- **Grammar:** fixed topic list per level, tagging imports with topics, grammar exercises. Basics (M17) builds the topic structure they can reuse.
- **Levels:** learner picks A1.1 … B1+, placement test checks it.
- **Practice modes:** fill-in-the-blank, listening to words and sentences, speaking, mixed; "practise missed words again".
- **My words at scale:** paging, sorting by progress, undo for delete.
- **Export** of the word list (CSV, Anki).
- **Pictures** on card fronts.
- **Example sentences from Tatoeba** as a second source.
- **Starter word lists** (e.g. Goethe A1–B1) as an optional import into a learner's list.
- **Korean** as learner language (new `word_translations` rows; Korean UI text).
- **Accounts** and multi-user (a login comes with the first deployment, see Planned); review of shared `words` rows with `mismatch_kept` before reusing them for other users.
- **Phone app** in React Native reusing `server/` and `core/`.
- **Cheaper models:** compare Opus 5.5 with Haiku 5.5 (`medium` effort, see §11.4 for the first measurements) using the AI quality test; the Wiktionary check guards a smaller model's grammar facts.
- **Text-to-speech (listening; planned for numbers and time in M18, research kept here):** Azure Neural TTS, audio generated once per word/sentence and stored; slow version via SSML speaking rate. Free tier covers an A1–A2 deck. Alternatives: Google Chirp 3 HD, ElevenLabs (premium). Words already have Wiktionary recordings (§7, §8.2); TTS remains for example sentences and for the words without a recording (≈ a quarter of the dictionary, mostly long compounds and rare words).
- **Speech (speaking):** the learner says the German word or sentence and the app checks whether word form, grammar and word order are right; pronunciation is out of scope. Speech-to-text turns the answer into text, then Claude checks it like a typed answer, ignoring what speech cannot carry (capitals, punctuation, spelling-only pairs such as *das/dass*). Transcriber: **ElevenLabs Scribe v2** (`scribe_v2`, `language_code=de`, verbatim, $0.22 per audio hour), which kept the most learner mistakes in a test (§16). Every transcriber silently fixes some mistakes, mostly endings that sound close to the right form (*sprecht* → "spricht", *arbeite* → "arbeiten"), so:
  - the answer screen shows "I heard: …" before the verdict;
  - when the transcript equals the expected answer but a word's confidence (`exp(logprob)`) is below about 0.95, the app asks the learner to say it again instead of marking it correct (threshold from a small sample; recheck on more recordings);
  - the expected answer is never sent as a prompt or keyterm, since that pulls the transcript towards it (the card's lemma alone as a keyterm is untested);
  - word-form answers (article, plural, verb forms) stay typed: single words without a sentence were the weakest case.

  Needs HTTPS for the microphone. Not chosen: AssemblyAI Universal-3.5 Pro (kept fewer mistakes, and its prompt takes only a description of the audio, not instructions); pronunciation-assessment services (Azure, SpeechSuper), which score sounds, not grammar. To test: the cheaper models on OpenRouter (Parakeet, Voxtral, Qwen3-ASR, Whisper; one key, but OpenRouter ignores `prompt`).

## 16. Research notes

- **Vision/extraction model (2026-10-11):** Claude Opus 5.5 ranked first in Roboflow's real-world OCR evaluation (updated 2026-10-08); `low` effort scored close to `high` at lower cost and latency. GPT-6.1 Sol and Gemini 3.8 Flash were strong alternatives but did not beat it. A separate OCR service plus a cheaper LLM is not worth it: transcription is already 93–97 % accurate, and the real risk (gender, plurals, lemmas) is not solved by OCR. No benchmark measures German article/plural accuracy — hence the Wiktionary check and the AI quality test.
- **Speech (2026-10-11):** see §15. Browser Web Speech APIs are too inconsistent across devices for German.
- **Speech-to-text for speaking (2026-10-15):** accuracy benchmarks don't measure whether a learner's mistakes survive. The German leaders on the Open ASR Leaderboard (March 2026) are Scribe v2 (2.27 % word error rate) and AssemblyAI Universal-3 Pro (2.34 %). Whisper-Large "corrected" about a quarter of young learners' grammar mistakes in an English study (ACL 2024), so the candidates were tested on the author's own iPhone recordings (Voice Memos): 45 lines, 30 with one deliberate A1–A2 mistake and 15 correct, each sent as its own clip.

  | | Mistakes kept (of 30) | Fixed silently | Garbled | Correct lines right (of 15) |
  |---|---|---|---|---|
  | ElevenLabs Scribe v2 | 21 | 7 | 2 | 15 |
  | AssemblyAI Universal-3.5 Pro | 14 | 12 | 4 | 14 |
  | the same with a prompt describing a learner making mistakes | 16 | 11 | 3 | 14 |

  - **Fixed by all three:** *sprecht*, *ein* (accusative), *gearbeiten*, *arbeite*, *bei meine*, *geschreibt*. The author checked that the recordings say the wrong forms.
  - **Kept by all three:** word order, wrong auxiliary, separable verbs, *nicht* for *kein*, wrong article, wrong plural.
  - **Mistakes turned into another correct sentence:** AssemblyAI wrote "Er ging" for *Er gehen* and "Wer spielt …?" for *Wir spielt*.
  - **Confidence:** Scribe's confidence on the deciding word was 1.00 on all 8 correct lines that have a wrong twin, and 0.53, 0.69 and 0.80 on 3 of its 7 silent fixes (the other four 0.98–1.00).
  - **Single words:** short answers without a sentence were the weakest case for every model (*das Löffel* → "Das Rüffel").

  Prices (2026-10-15): Scribe v2 $0.22 per audio hour direct, $0.11 on OpenRouter; Universal-3.5 Pro $0.21 (+$0.05 with a prompt) direct, $0.30 on OpenRouter. The whole test cost about $0.05. OpenAI's `whisper-1` and `gpt-4o-transcribe` shut down on 2027-02-26; `gpt-transcribe` was not tested. The recordings and transcripts are in `data/stt-test/work/` (not in git). The reading script, the answer key and the method, enough to rebuild the test, are in `docs/speech-to-text-test/`.
