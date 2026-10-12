# Language App

A companion app for learning German vocabulary from a book. After a study session you photograph the pages you worked through. The app finds the new German words, checks them against the words you already have and against Wiktionary, lets you confirm them, and turns them into flashcards you practise on your iPhone.

It is a working prototype for one learner: a web app served from your Mac on the home network, with no login.

## How it works

1. **Photograph.** Pick one or more photos. The browser shrinks each one to a JPEG (longest side 1600 px) before upload. Photos are not stored on the server.
2. **Extract.** Claude reads the page and returns every German word in its base form, with part of speech, article and a short English translation. Proper names, numbers written as digits, page furniture and handwriting are skipped.
3. **Compare.** Duplicates across photos are merged. Words already in your list, including ones you skipped before, are set aside and never offered as new again.
4. **Check.** Each new word is looked up in a local copy of Wiktionary (from kaikki.org). A noun whose article differs from the dictionary is flagged.
5. **Review.** You mark each word Add or Skip, and can apply the dictionary's article with one tap.
6. **Save.** Added words go into your list as "learning", skipped ones as "ignored".
7. **Enrich.** Each saved word gets an example sentence with a translation, plus its plural (nouns) or Präteritum, Partizip II and auxiliary (verbs). Forms come from the dictionary first; the AI fills the gaps. The pronunciation (IPA and a native speaker's recording) comes from the dictionary only.
8. **Practise.** A card shows the English translation and part of speech; flip it for the German word with article, forms and example, and tap the speaker to hear it. Swipe right if you knew it, left if you didn't, up to skip. Three "knew it" in a row marks a word learned; a miss moves it back to learning.

## Features

- **Import:** several photos per import, an optional name ("Lesson 4"), a status per photo, **Retry** for failed photos and **Retake** for pages that could not be read. Unfinished imports appear as a banner on Home.
- **Review:** Add / Skip per word, Add all / Skip all, one-tap article fixes from the dictionary, and a collapsed list of words already in your list. Decisions survive a reload.
- **Enrichment:** runs right after saving ("Adding details…"). If the AI fails, the words are still saved and Home offers **Add details** to try again.
- **Practice:** three sources (Last import, Last 7 days, Not learned yet), up to 20 words per session, started in two taps. 3D card flip, swipes, buttons, and Space / arrow keys on a desktop. A summary lists the words you missed.
- **Pronunciation:** the back of a card has a speaker button that plays a native speaker's recording of the word from Wikimedia Commons (via Wiktionary). It plays only when tapped, never on the front, and is streamed when played, not stored. About three quarters of the dictionary's words have a recording; words without one show no button.
- **Offline answers:** an answer that fails to send waits in a queue and is retried every 5 s and when the connection comes back. A reload continues at the same card.
- **My words:** Learning / Learned / Ignored tabs with counts, search in German and English, and a progress mark per word ("new", "1/3").
- **Word detail:** listen to the word (speaker button next to it) and see its IPA (e.g. /tɪʃ/), change the status, add your own translation and a note (shown on the card), see where the forms came from and what the dictionary check found, delete the word.
- **Home Screen app:** add it to the iPhone Home Screen to run full screen. Light and dark mode follow the system.

## Tech stack and layout

TypeScript everywhere, in a pnpm workspace. There is no build step: packages import each other's `src/` directly.

- **`core/`:** Zod schemas for every API request and response and for both AI outputs, the API client, the learning rules and card formatting. No Node or browser-only APIs, so a future React Native app can use it unchanged.
- **`server/`:** Fastify API on PostgreSQL 17 (Drizzle ORM, drizzle-kit migrations). The only part that talks to the database and to Claude (`@anthropic-ai/sdk`). Also holds the Wiktionary importer and dev scripts in `server/scripts/`.
- **`web/`:** React + Vite, React Router, CSS Modules, `@use-gesture/react` for swipes. Mobile-first screens; all data goes through the `core` API client.
- **`docs/`:** the spec and the build plan.

Tests use Vitest; lint and formatting use Biome.

## Getting started

### Prerequisites

- Node.js 24 or newer (developed on 26)
- pnpm 11.18.0 (pinned in `packageManager`)
- Docker, for PostgreSQL
- An Anthropic API key, for reading photos
- macOS for the photo dev scripts: `ai:try`, `demo:import` and `pnpm test:live` shrink photos with `sips`. The app itself only needs a browser.

### Set up

```sh
cp .env.example .env     # then set ANTHROPIC_API_KEY
docker compose up -d     # PostgreSQL 17 with the databases language_app and language_app_test
pnpm install
pnpm db:migrate          # create the tables in the dev database
```

The `.env` values that matter:

- `ANTHROPIC_API_KEY`: needed for imports. The server starts without it; only the AI calls fail.
- `AI_MODEL_EXTRACT`, `AI_MODEL_ENRICH`, `AI_EFFORT`: the Claude model for each AI call, and one effort level for both. Defaults: `claude-opus-5-5` at `low`. See [AI models and cost](#ai-models-and-cost).
- `DAILY_PHOTO_LIMIT`: photo reads per day (default 50).
- `SERVER_PORT` (default 3000) and `WEB_PORT` (default 5173). Vite will not start if its port is taken, so change `WEB_PORT` if 5173 is in use.
- `DATABASE_URL` and `TEST_DATABASE_URL` already match `docker-compose.yml`.

### Load the dictionary

The article check and the dictionary forms need the German Wiktionary extract from kaikki.org (1.08 GB). Without it every word is "not in dictionary" and all grammar comes from the AI.

```sh
mkdir -p data/kaikki
curl -o data/kaikki/kaikki.org-dictionary-German.jsonl \
  https://kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl
pnpm --filter server import:wiktionary data/kaikki/kaikki.org-dictionary-German.jsonl
```

The import writes about 98,000 entries in roughly 11 s. Running it again replaces the table.

Words saved before pronunciation existed get theirs once the dictionary has been re-imported with the command above:

```sh
pnpm db:migrate                                   # adds the pronunciation columns
pnpm --filter server import:wiktionary data/kaikki/kaikki.org-dictionary-German.jsonl
pnpm --filter server backfill:pronunciation       # fills IPA and recordings; safe to run again
```

kaikki.org marks this file as deprecated. If it disappears, the importer also accepts the raw all-languages dump (`raw-wiktextract-data.jsonl.gz`, listed on [kaikki.org's raw data page](https://kaikki.org/dictionary/rawdata.html)) and keeps only the German entries.

### Run

```sh
pnpm dev
```

This migrates the dev database, then starts the server on `127.0.0.1:3000` and Vite on port 5173 on all network interfaces. Vite proxies `/api` to the server. Open `http://localhost:5173`.

## Using it on the iPhone

1. Connect the iPhone to the same Wi-Fi as the Mac.
2. Open `http://<Mac IP>:5173` in Safari (`ipconfig getifaddr en0` prints the Mac's address on most Macs). Plain HTTP is fine; picking photos works without HTTPS.
3. Optional: Share → **Add to Home Screen**. The app then opens full screen as "Words", without Safari's swipe gestures getting in the way of the flashcards.

The Mac has to keep running `pnpm dev`. There is no login, so anyone on your network can open the app.

## AI models and cost

There are two Claude calls: **extract** reads one photo, and **enrich** writes example sentences and missing forms for up to 30 words at a time.

- **Default** (code and `.env.example`): Claude Opus 5.5 at effort `low`.
- **Cheaper, for development:** Claude Haiku 5.5 at effort `medium`. It splits some separable verbs, which gives a wrong lemma (*kreuzen* for *ankreuzen*), and misses a few long compounds.

```sh
AI_MODEL_EXTRACT=claude-haiku-5-5
AI_MODEL_ENRICH=claude-haiku-5-5
AI_EFFORT=medium
```

Measured on 2026-10-11 on the densest test page (an exercise page), photo shrunk to 1600 px:

| Model, effort | Words found | Time | Cost per page |
|---|---|---|---|
| Opus 5.5, `low` | 101 | 25 s | 8.1¢ |
| Sonnet 5.5, `low` | 106 | 18 s | 4.2¢ |
| Haiku 5.5, `medium` | 96 | 30 s | 0.43¢ |

Across three real pages, Opus took 13–25 s and 5–8¢ per page. Sonnet's mistakes are mostly extra words you can skip in review. Enriching 11 words cost 2.7¢ on Opus, 1.3¢ on Sonnet and 0.07¢ on Haiku. The full comparison is in [docs/design.md §11.4](docs/design.md#114-cost).

Every call writes a row to the `ai_usage` table (model, tokens, time), so real costs can be worked out from it. `DAILY_PHOTO_LIMIT` (default 50) caps photo reads per day; every attempt counts, failed ones included.

## Development

The server tests and scripts need the Docker database running.

```sh
pnpm test          # all unit and server tests; never calls Claude
pnpm test:live     # real Claude calls (~15¢ per run on Opus 5.5, ~1¢ on Haiku 5.5)
pnpm typecheck     # TypeScript in core, server and web
pnpm check         # Biome lint and format check
pnpm format        # fix formatting with Biome
pnpm db:generate   # generate a migration after changing server/src/db/schema.ts
pnpm db:migrate    # apply migrations to the dev database (pnpm dev does this too)
```

Server scripts. Paths are relative to the directory you run them from.

```sh
pnpm --filter server ai:try extract <photo> [--save <name>]      # one real extract call: words, tokens, time, cost
pnpm --filter server ai:try enrich <words.json> [--save <name>]  # the same for enrich
pnpm --filter server dict:lookup See noun die                    # what the dictionary check sees for a word
pnpm --filter server backfill:pronunciation                     # pronunciation for words saved before it existed
pnpm --filter server demo:import <photo> [--save]                # the whole import flow against a running pnpm dev
```

- `pnpm test` never calls Claude. Server tests replay real Claude responses recorded in `server/test/fixtures/ai/` (with `ai:try … --save <name>`). Error cases such as refusals, `max_tokens` and 429/5xx are built from those recordings.
- Server tests use a separate database, `language_app_test`, rebuilt from the migrations at the start of each run.
- Run `pnpm test:live` after changes under `server/src/ai/`. It uses the models set in `.env` and up to two photos from `server/test/live/photos/` (git-ignored).
- The rules for working on the repo (spec first, test-first milestones, every API shape a Zod schema in `core/`) are in [CLAUDE.md](CLAUDE.md).

## Data and licences

- **Wiktionary data** comes via kaikki.org and is licensed CC BY-SA. The app credits it in the footer of the Home screen. Commercial use would need a licence review. The small committed sample `server/test/fixtures/kaikki-sample.jsonl` is the same data.
- **Recordings** are audio files on Wikimedia Commons, linked from Wiktionary. Each file has its own free licence and author (those checked were CC BY-SA or CC BY), shown on its Commons page. The app stores only the file name and URL and streams the MP3 from `upload.wikimedia.org` when you tap play. The app credits the recordings in the footer of the Home screen ("recordings from Wikimedia Commons"), not per word.
- **Textbook photos are never committed.** `server/test/live/photos/` and `data/` (the dictionary download and any local photos) are git-ignored, and the server does not store uploaded photos.
- **AI fixtures:** `server/test/fixtures/ai/` holds Claude responses recorded from a few real textbook pages, so they contain the word lists read from those pages. That is fine in this private repo; review them before making the repo public.

## Docs and status

- [docs/design.md](docs/design.md): the spec, kept in sync with the code. Read the relevant section before changing behaviour.
- [docs/plan.md](docs/plan.md): the build plan, milestones M0–M8.
- [CLAUDE.md](CLAUDE.md): commands and repo rules.

**Status:** working prototype for one learner. Milestones M0–M8 are done.

### Possible next steps

From [docs/design.md §15](docs/design.md#15-later):

- Spaced repetition ("smart review").
- Listening and speaking practice: text-to-speech for example sentences and for words without a recording, and pronunciation assessment (needs HTTPS for the microphone).
- An AI quality test on 20–30 hand-checked pages, to decide whether a cheaper model such as Haiku 5.5 is good enough.
- Accounts for several learners, and a React Native phone app reusing `core/` and `server/`.
- Grammar topics, levels, more practice modes, starter word lists, and Korean as a learner language.
