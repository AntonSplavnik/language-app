# Language App

A companion app for learning German vocabulary from a book. After a study session you photograph the pages you worked through. The app finds the new German words, checks them against the words you already have and against Wiktionary, lets you confirm them, and turns them into flashcards you practise on your iPhone.

It is a web app with accounts, working name **Dingsda**. It runs in production at `https://dingsda.vercel.app` (Vercel + Neon, see [Production](#production)), and on your Mac for development. Sign-up is open to anyone while testing (`SIGNUP_MODE=open`), otherwise by invite; an account signs in with a password or with Google, and the AI features are switched on per account.

## How it works

1. **Photograph.** Pick one or more photos. The browser shrinks each one to a JPEG (longest side 1600 px) before upload. Photos are not stored on the server. Pages of a PDF go the same way, rendered in the browser; words can also be typed by hand (see Features).
2. **Extract.** Claude reads the page and returns every German word in its base form, with part of speech, article and a short English translation. Proper names, numbers written as digits, page furniture and handwriting are skipped.
3. **Compare.** Duplicates across photos are merged. Words already in your list, including ones you skipped before, are set aside and never offered as new again.
4. **Check.** Each new word is looked up in a local copy of Wiktionary (from kaikki.org). A noun whose article differs from the dictionary is flagged.
5. **Review.** You mark each word Practice or Ignore, and can apply the dictionary's article with one tap.
6. **Save.** Words set to Practice go into your list as "learning", ignored ones as "ignored".
7. **Enrich.** Each saved word gets an example sentence with a translation, plus its plural (nouns) or Präteritum, Partizip II and auxiliary (verbs). Forms come from the dictionary first; the AI fills the gaps. The pronunciation (IPA and a native speaker's recording) comes from the dictionary only.
8. **Practise.** A card shows the English translation and part of speech; flip it for the German word with article, forms and example, and tap the speaker to hear it. Swipe right if you knew it, left if you didn't, up to skip. Three "knew it" in a row marks a word learned; a miss moves it back to learning.

Steps 2 and 7 are the AI features. An account without AI types its words instead, gets the dictionary's facts for them, and practises as usual.

## Features

- **Accounts:** sign in with your email or username and a password, or **Continue with Google**. Sign-up is by invite (`invite:add`) with `SIGNUP_MODE=invite`, or open to anyone with `SIGNUP_MODE=open` (production and the Mac while testing); a new account starts empty with the AI features off (`user:ai` switches them). Settings → Account shows the sign-in methods (connect or disconnect Google), whether AI is included, **Sign out** and **Delete account**, which removes the account and all its data. A forgotten password is reset by the owner with `user:set-password`; there is no email yet.
- **Import:** several photos per import, an optional name ("Lesson 4"), a status per photo, **Retry** for failed photos and **Retake** for pages that could not be read. Unfinished imports appear as a banner on Home.
- **PDF pages:** pick a PDF and a page range (up to 10 pages); the pages are rendered in the browser and read like photos. The phone remembers the book, so the next import suggests the pages after the last ones.
- **Typed words:** type one German word or a list. Suggestions come from the dictionary as you type (*ging* finds *gehen*, *Regenschrim* finds *Regenschirm*); pick the entry you mean and a translation from its glosses, type your own, or **Ask AI**. A list is saved as one import.
- **Review:** Practice / Ignore per word, Practice all / Ignore all, one-tap article fixes from the dictionary, and a collapsed list of words already in your list. Decisions survive a reload.
- **Enrichment:** runs right after saving ("Adding details…"). If the AI fails, the words are still saved and Home offers **Add details** to try again.
- **Practice:** three sources (one import, chosen from the past imports; Last 7 days; Not learned yet), up to 20 words per session, started in two taps. 3D card flip, swipes, buttons, and Space / arrow keys on a desktop. A summary lists the words you missed.
- **Pronunciation:** the back of a card has a speaker button that plays a native speaker's recording of the word from Wikimedia Commons (via Wiktionary). It plays only when tapped, never on the front, and is streamed when played, not stored. About three quarters of the dictionary's words have a recording; words without one show no button.
- **Offline answers:** an answer that fails to send waits in a queue and is retried every 5 s and when the connection comes back. A reload continues at the same card.
- **My words:** Learning / Learned / Ignored tabs with counts, search in German and English, a view menu (A–Z, newest first by day added, or one import), the list in letter sections with each article in its gender's colour, and a progress mark per word (a "new" pill, or one dot per right answer in a row).
- **Word detail:** the word with its article colour-coded by gender (der blue, die red, das teal), a speaker button to hear it, its IPA (e.g. /tɪʃ/), the translation, forms and an example sentence with the word in bold, your note, and the streak towards learned. Change the status right there; a note appears only when the grammar's source is unusual (an article Wiktionary disagrees with, forms from the AI).
- **Edit word:** a separate sheet-style screen (pencil button) for your own translation and a note (shown on the card), and for deleting the word.
- **Settings:** Account (above), and Imports, the past imports, each of which can be renamed.
- **Home Screen app:** add it to the iPhone Home Screen to run full screen. Light and dark mode follow the system; the fonts (Bricolage Grotesque, DM Sans) are served by the app itself.

## Tech stack and layout

TypeScript everywhere, in a pnpm workspace. There is no build step: packages import each other's `src/` directly.

- **`core/`:** Zod schemas for every API request and response and for the AI outputs, the API client, the learning rules and card formatting. No Node or browser-only APIs, so a future React Native app can use it unchanged.
- **`server/`:** Fastify API on PostgreSQL 17 (Drizzle ORM, drizzle-kit migrations), with accounts by Better Auth inside it. The only part that talks to the database and to Claude (`@anthropic-ai/sdk`). Also holds the Wiktionary importer, the account scripts, the Vercel build and dev scripts in `server/scripts/`.
- **`web/`:** React + Vite, React Router, CSS Modules, `@use-gesture/react` for swipes, pdf.js for PDF pages. Mobile-first screens; all data goes through the `core` API client.
- **`docs/`:** the spec, the build plan and the design system.
- **Production:** Vercel (the web build as static files, the API bundled with esbuild into one Vercel Function) and Neon (PostgreSQL 17), both in Frankfurt; GitHub Actions checks and deploys (`.github/workflows/ci.yml`).

Tests use Vitest; lint and formatting use Biome.

## Getting started

### Prerequisites

- Node.js 24 or newer (developed on 26)
- pnpm 11.18.0 (pinned in `packageManager`)
- Docker, for PostgreSQL
- An Anthropic API key, for the AI features
- Optional: a Google OAuth client, for Continue with Google ([docs/design.md §14](docs/design.md#14-development-setup), Google on the Mac)
- macOS for the photo dev scripts: `ai:try`, `demo:import` and `pnpm test:live` shrink photos with `sips`. The app itself only needs a browser.

### Set up

```sh
cp .env.example .env     # then set ANTHROPIC_API_KEY and BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up -d     # PostgreSQL 17 with the databases language_app and language_app_test
pnpm install
pnpm db:migrate          # create the tables in the dev database
pnpm --filter server user:claim <email> <username>   # once per database: user 1 becomes your account, with AI on; asks for a password
```

User 1 is the account that owns the word list from before accounts existed; `user:claim` gives it your email, username and password. With `SIGNUP_MODE=invite` anyone else needs an invite before they can create an account: `pnpm --filter server invite:add <email>`.

The `.env` values that matter:

- `BETTER_AUTH_SECRET`: signs the session cookie, at least 32 characters, never in git. The server refuses to start without it.
- `ANTHROPIC_API_KEY`: needed for the AI features. The server starts without it; only the AI calls fail.
- `AI_MODEL_EXTRACT`, `AI_MODEL_ENRICH`, `AI_MODEL_DESCRIBE`, `AI_EFFORT`: the Claude model for each AI call, and one effort level for all three. Defaults: `claude-haiku-5-5` at `medium`. See [AI models and cost](#ai-models-and-cost).
- `DAILY_PHOTO_LIMIT`: photo and PDF page reads per account per day (default 50). `DAILY_DESCRIBE_LIMIT`: **Ask AI** calls per account per day (default 200), a safety net rather than a budget. `APP_TIME_ZONE` (default `Europe/Berlin`): where their day starts.
- `SIGNUP_MODE`: `invite` (the default; only invited emails can create an account) or `open` (anyone can; Create account then has no "Invite only" line).
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: optional, both or neither. Without them no screen offers Google.
- `SERVER_PORT` (default 3000) and `WEB_PORT` (default 5173). Vite will not start if its port is taken, so change `WEB_PORT` if 5173 is in use.
- `DATABASE_URL` and `TEST_DATABASE_URL` already match `docker-compose.yml`.
- Never set `BETTER_AUTH_URL` on the Mac: it is production's address, and the Mac's server refuses to start with it.

### Load the dictionary

The article check and the dictionary forms need the German Wiktionary extract from kaikki.org (1.08 GB). Without it every word is "not in dictionary" and all grammar comes from the AI.

```sh
mkdir -p data/kaikki
curl -o data/kaikki/kaikki.org-dictionary-German.jsonl \
  https://kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl
pnpm --filter server import:wiktionary data/kaikki/kaikki.org-dictionary-German.jsonl
```

The import writes about 98,000 entries and 249,000 inflected forms (*ging* → *gehen*, used when you type a word) in roughly 14 s. Running it again replaces both tables. A database loaded before words could be typed by hand needs it run once more after `pnpm db:migrate`, to fill the forms.

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

This migrates the dev database, then starts the server on `127.0.0.1:3000` and Vite on port 5173 on all network interfaces. Vite proxies `/api` to the server. Open `http://localhost:5173` and sign in.

## Using it on the iPhone

**Production:** open `https://dingsda.vercel.app` in Safari and sign in, with the password or with Google. Optional: Share → **Add to Home Screen**. The app then opens full screen as "Dingsda", without Safari's swipe gestures getting in the way of the flashcards; it signs in once on its own (Google works there too).

**Development**, against the Mac's `pnpm dev`:

1. Connect the iPhone to the same Wi-Fi as the Mac.
2. Open `http://<Mac IP>:5173` in Safari (`ipconfig getifaddr en0` prints the Mac's address on most Macs) and sign in with your password. Plain HTTP is fine; picking photos works without HTTPS. Google isn't offered there: it returns only to https or `localhost`, so it works only in the Mac's own browser on `http://localhost:5173`.
3. Safari and the Home Screen app keep separate cookies, so each signs in once.

## AI models and cost

There are three Claude calls: **extract** reads one photo or PDF page, **enrich** writes example sentences and missing forms for up to 30 words at a time, and **describe** is **Ask AI** when adding a word by hand (the word you meant, or a short translation of a dictionary entry; ≈0.01¢ a call on Haiku 5.5, ≈0.5¢ on Opus 5.5). They run only for accounts with AI on.

- **Default** (code, `.env.example` and production, since 2026-10-25): Claude Haiku 5.5 at effort `medium`, about 20 times cheaper per page than Opus. It splits some separable verbs, which gives a wrong lemma (*kreuzen* for *ankreuzen*), and misses a few long compounds.
- **For comparison:** Claude Opus 5.5 at effort `low`, the default until 2026-10-25.

```sh
AI_MODEL_EXTRACT=claude-opus-5-5
AI_MODEL_ENRICH=claude-opus-5-5
AI_MODEL_DESCRIBE=claude-opus-5-5
AI_EFFORT=low
```

Measured on 2026-10-11 on the densest test page (an exercise page), photo shrunk to 1600 px:

| Model, effort | Words found | Time | Cost per page |
|---|---|---|---|
| Opus 5.5, `low` | 101 | 25 s | 8.1¢ |
| Sonnet 5.5, `low` | 106 | 18 s | 4.2¢ |
| Haiku 5.5, `medium` | 96 | 30 s | 0.43¢ |

Across three real pages, Opus took 13–25 s and 5–8¢ per page. Sonnet's mistakes are mostly extra words you can skip in review. Enriching 11 words cost 2.7¢ on Opus, 1.3¢ on Sonnet and 0.07¢ on Haiku. The full comparison is in [docs/design.md §11.4](docs/design.md#114-cost).

Every call writes a row to the `ai_usage` table (account, model, tokens, time), so real costs can be worked out from it. `DAILY_PHOTO_LIMIT` (default 50) caps photo and page reads per account per day and `DAILY_DESCRIBE_LIMIT` (default 200) Ask AI calls; every attempt counts, failed ones included. When the Anthropic credit is used up, a photo read or Ask AI says "AI is unavailable right now" (production's key has €5 of prepaid credit and no auto top-up).

## Development

The everyday commands are in the cheat sheet, [docs/commands.md](docs/commands.md). The server tests and scripts need the Docker database running.

```sh
pnpm test          # all unit and server tests; never calls Claude
pnpm test:live     # real Claude calls (~1¢ per run on Haiku 5.5, the default; ~15¢ on Opus 5.5)
pnpm typecheck     # TypeScript in core, server and web
pnpm check         # Biome lint and format check
pnpm format        # fix formatting with Biome
pnpm db:generate   # generate a migration after changing server/src/db/schema.ts
pnpm db:migrate    # apply migrations to the dev database (pnpm dev does this too)
pnpm build:vercel  # the Vercel build: web app and the API bundled into .vercel/output
pnpm test:bundle   # build, then test the output and the bundled function against the test database
```

Server scripts. Paths are relative to the directory you run them from.

```sh
pnpm --filter server ai:try extract <photo> [--save <name>]      # one real extract call: words, tokens, time, cost
pnpm --filter server ai:try enrich <words.json> [--save <name>]  # the same for enrich
pnpm --filter server ai:try describe <text> [--entry <entry.json>] [--save <name>]  # the same for Ask AI
pnpm --filter server dict:lookup See noun die                    # what the dictionary check sees for a word
pnpm --filter server backfill:pronunciation                     # pronunciation for words saved before it existed
pnpm --filter server demo:import <photo> --user <email|username> [--save]  # the whole import flow against a running pnpm dev, signed in
pnpm --filter server user:claim <email> <username>               # once per database: user 1 becomes your account
pnpm --filter server invite:add <email>                          # also invite:list, invite:remove <email>
pnpm --filter server user:set-password <email|username>          # a new password; ends the account's sign-ins
pnpm --filter server user:ai <email|username> on|off             # the account's AI features
pnpm --filter server serve:vercel [port]                         # serve the built function with plain Node, for trying it by hand
```

- `pnpm test` never calls Claude. Server tests replay real Claude responses recorded in `server/test/fixtures/ai/` (with `ai:try … --save <name>`). Error cases such as refusals, `max_tokens` and 429/5xx are built from those recordings. Google is faked at the network edge, so no test leaves the machine.
- Server tests use a separate database, `language_app_test`, rebuilt from the migrations at the start of each run.
- Run `pnpm test:live` after changes under `server/src/ai/`. It uses the models set in `.env`, up to two photos from `server/test/live/photos/` (git-ignored), a 3-word enrich batch and two Ask AI calls.
- The account scripts, `pnpm db:migrate` and `import:wiktionary` work on `DATABASE_URL` and print which database that is. Against production they run from the Mac on Neon's direct connection, read from a git-ignored `deploy.env` so it is never typed or shown ([docs/design.md §14](docs/design.md#14-development-setup), Accounts on the Mac).
- The rules for working on the repo (spec first, test-first milestones, every API shape a Zod schema in `core/`) are in [CLAUDE.md](CLAUDE.md).

## Production

- **Address:** `https://dingsda.vercel.app`, live since 2026-10-26. The web app and the API (one Vercel Function, `fra1`) are on Vercel Hobby; the database is Neon Free, PostgreSQL 17 in Frankfurt. Production started fresh: the Mac's word list stays on the Mac, and the developer account is user 1 there too.
- **Deploys** happen only through GitHub Actions, never by hand: a push to `main` runs the checks (typecheck, Biome, `pnpm test`, `pnpm test:bundle` on a PostgreSQL 17 service), then Neon's migrations, then the Vercel deploy. Pull requests get the checks only. So push to `main` only what has passed review.
- **Docs-only changes run nothing:** a push or pull request that changes only `*.md` files or files under `docs/` runs neither the checks nor the deploy; one that also changes anything else runs everything.
- **Configuration** is in Vercel's production variables (secrets stored as sensitive) and GitHub's repository secrets, never in git ([docs/design.md §18.3](docs/design.md#183-configuration)).
- **The Vercel token for GitHub expires ≈2027-10-26:** renew `VERCEL_TOKEN` before then, or deploys fail.
- **Backups:** for now only Neon's 6 hours of history; the nightly encrypted backups are the next step (M12.5).
- How it was set up and how going live went: [docs/design.md §18](docs/design.md#18-deployment-m12-designed-2026-10-25-m124-built-and-live-2026-10-26).

## Data and licences

- **Wiktionary data** comes via kaikki.org and is licensed CC BY-SA. The app credits it in the footer of the Home screen. Commercial use would need a licence review. The small committed sample `server/test/fixtures/kaikki-sample.jsonl` is the same data.
- **Recordings** are audio files on Wikimedia Commons, linked from Wiktionary. Each file has its own free licence and author (those checked were CC BY-SA or CC BY), shown on its Commons page. The app stores only the file name and URL and streams the MP3 from `upload.wikimedia.org` when you tap play. The app credits the recordings in the footer of the Home screen ("recordings from Wikimedia Commons"), not per word.
- **Textbook photos are never committed.** `server/test/live/photos/` and `data/` (the dictionary download and any local photos) are git-ignored, and the server does not store uploaded photos.
- **AI fixtures:** `server/test/fixtures/ai/` holds Claude responses recorded from a few real textbook pages, so they contain the word lists read from those pages. That is fine in this private repo; review them before making the repo public.

## Docs and status

- [docs/design.md](docs/design.md): the spec, kept in sync with the code. Read the relevant section before changing behaviour.
- [docs/plan.md](docs/plan.md): the build plan: Part 1, M0–M8 (the prototype); Part 2, M9 onward, in build order.
- [docs/design-system/](docs/design-system/README.md): how the UI looks: the brand book, the tokens and a guideline per component.
- [docs/m12-research.md](docs/m12-research.md): the code tried and the commands found while researching accounts and deployment.
- [docs/commands.md](docs/commands.md): a cheat sheet of the everyday commands: start and stop, accounts on the Mac and in production, checks, deploys.
- [CLAUDE.md](CLAUDE.md): commands and repo rules.

**Status (2026-10-26):** the prototype (M0–M8), past imports (M9), typed words (M10), PDF pages (M11), and accounts and deployment (M12.1–M12.4) are done, and the app is live.

### Next steps

From [docs/plan.md](docs/plan.md), Part 2, in build order:

- Nightly encrypted backups of the production database (M12.5).
- Themes tagged by the AI and the learner's own groups (M13); combinable filters in My words and Practice (M16); card modes such as German → English, articles, plurals and verb forms (M17).
- Spaced repetition (M14) and progress over time: a daily goal, a streak, a history (M15).
- Basics: the alphabet (M18), text-to-speech (M19), numbers (M20) and time (M21).
- Later: open sign-up (an email service and a privacy page), push notifications, gamification, AI for subscribers, a new example sentence on demand; and from [docs/design.md §15](docs/design.md#15-later), grammar topics, levels, more practice modes and a React Native phone app reusing `core/` and `server/`.
