# Language App — Design

**Date:** 2026-10-11, last updated 2026-10-28
**Status:** Describes the built prototype (milestones M0–M8, `docs/plan.md`) and the Part 2 milestones built since (M9: past imports; M10: adding words by hand; M11: importing pages of a PDF; M12.1: accounts and sign-in; M12.2: the AI switch, deleting an account, the account scripts; M12.3: Google sign-in; M12.3b: Google's tokens not kept, Disconnect; M12.4: deployment, live at `https://dingsda.vercel.app` since 2026-10-26, §18; M12.5: the nightly backups, live since 2026-10-28, §18.6; M12.6: the account scripts `user:list` and `user:delete`, §14; M12.7: open sign-up while testing, §4 Accounts); kept in sync with the code. Next: M13 (themes and own groups), once M12.7 is live.

## 1. Purpose

A companion app for learning German from any book. After each study session the learner photographs the pages they worked through; the app extracts the new words, checks them against the words the learner already has, lets the learner confirm them, and turns them into flashcard practice.

**Goal of the prototype:** solve the author's own problem — remember the vocabulary from their German book. If it works well, it may later become a product, so the data model and code structure must not block multiple users, more languages, or a phone app.

**Since M12** the app has accounts (sign-up by invite, or open to anyone while testing since M12.7, §4 Accounts) and runs in production at `https://dingsda.vercel.app` on Vercel and Neon (§18), deployed by CI; the Mac keeps `pnpm dev` and its own databases for development (§14).

**Success criteria for the prototype**
- Photographing a textbook page on an iPhone and getting a correct, reviewable list of new words takes under a minute.
- Words already known or skipped are never offered again.
- Grammar facts on cards (article, plural, verb forms) are correct or visibly flagged.
- A flashcard session can be started in two taps and practised with swipe gestures on the iPhone.

## 2. Scope

### In the app
- Photo import → AI extraction → comparison with the learner's words → Wiktionary check → review → save → AI enrichment; pages of a PDF imported like photos (M11, §6.8); words typed by hand, with dictionary suggestions and **Ask AI** (M10, §6.7)
- Past imports: practise, filter, name and rename them (M9)
- Shared word dictionary + per-learner word list with statuses (`learning` / `learned` / `ignored`)
- Flashcard practice (one mode) with three session sources
- Word pronunciation from Wiktionary: IPA, and recordings from Wikimedia Commons played on tap
- Per-word progress tracking
- "My words" list with edit, status change and delete
- AI usage tracking (tokens and time per call, from which the cost is worked out) and a daily photo limit
- Accounts (M12.1–M12.3b): sign-in by email or username and a password, or with Google (connected and disconnected on Account; Google's tokens not kept); sign-up by invite, or open to anyone while testing (M12.7); the AI features switched on per account; deleting an account with all its data, in the app or by script; the owner's account scripts (§14: claim, invites, password, AI, list, delete; M12.6 added the last two); English as the learner language; German as the target language
- Production (M12.4, §18): the web app and the API on Vercel, the database on Neon, both in Frankfurt, deployed by CI (§18.4)

### Not in the app yet (see §15 Later)
Open sign-up (the email service, password reset by email, a privacy page), grammar topics, levels and placement test, other practice modes (fill-in-the-blank, listening, speaking), spaced repetition, pictures on cards, Korean, phone app, starter word lists.

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
| Accounts | Better Auth inside our own server; sign-up by invite or open (`SIGNUP_MODE`), password or Google; the AI features switched on per account (§4 Accounts) |
| Hosting | Vercel Hobby (the web app as static files, the API as one function) and Neon Free (PostgreSQL 17), both in Frankfurt; deployed only by GitHub Actions (§18) |
| AI model | Claude Haiku 5.5 at `medium` effort everywhere (Opus 5.5 at `low` until 2026-10-25), configurable per call |

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
- **`server/`** — the only unit that talks to the database and to Claude. Holds the API key. Each feature folder has its own `routes.ts` with its HTTP endpoints (§9); `app.ts` wires them together, every route but `/api/health` and `/api/auth/*` behind the session hook.
  - `db/` — Drizzle schema and migrations.
  - `auth/` — accounts with Better Auth (`auth.ts`, its configuration), its endpoints mounted under `/api/auth/*` and the session hook (`routes.ts`), the signed-in learner and the AI routes' gate (`learner.ts`), the invite list (`invites.ts`), the usernames of accounts made with Google (`usernames.ts`), `user:claim` (`claim.ts`), and `user:set-password`, `user:ai`, `user:list` and `user:delete` (`accounts.ts`, which also holds what deleting an account removes beyond the cascades, shared by Delete account and `user:delete`); see Accounts below.
  - `ai/` — the Claude client (`AiClient`: `extractWords(jpeg, ctx)`, `enrichWords(words, ctx)`, `describeWord(input, ctx)`) on a swappable message transport, so tests replay recorded responses; the prompts; `ai_usage` rows. `ctx` names the learner: their id (for `ai_usage`) and their language, taken from the session for each call.
  - `dictionary/` — Wiktionary lookups and the check rules; `scripts/import-wiktionary.ts` loads the reference table.
  - `imports/` — import flow: merge, compare, dictionary check, save.
  - `words/` — enrichment (`enrich.ts`), pronunciation from the dictionary and its backfill (`pronunciation.ts`), the learner's word list: list, detail, edit, delete (`service.ts`), and the query every word view is built on (`views.ts`).
  - `practice/` — session word selection and result recording.
  - `routes/stats.ts` — Home's counters; `http/errors.ts` — error responses (§12); `http/request-id.ts` — the request ids (Vercel's when there is one, §18.2); `config.ts` — `.env` validation, and Vercel's variables.
  - `setup.ts` — the server from its configuration (the database pool, Better Auth, the AI client, `buildApp`), the one setup both `main.ts` (the Mac, `listen()` on 127.0.0.1) and `vercel.ts` (the Vercel Function, §18.2) start.
- **`web/`** — screens and interaction only: photo picking and shrinking, review list, card flip/swipe animation, keyboard shortcuts. All data access goes through the `core/` API client; who is signed in (and whether Google can be offered) comes from `auth/session.tsx`, `auth/rules.ts` holds Sign in's and Create account's rules, and `auth/google.ts` Google's (where it is offered, where it returns to, what its errors say). Device features sit behind small wrappers (`pickPhotos()`, `shrinkImage()`, `playAudio()`, and for PDFs `pickPdf()`, `openPdf()` / `renderPage()` and the remembered book's storage, `bookStore`), so a phone app only needs to replace those.

### Technology

| Part | Choice |
|---|---|
| Language | TypeScript everywhere |
| Repo | One repo, pnpm workspaces: `core/`, `server/`, `web/` |
| Runtime | Node.js 24 or newer (developed on 26) |
| Web | React + Vite, React Router, CSS Modules, `@use-gesture/react` for swipes, pdf.js (`pdfjs-dist`, its legacy build, §6.8) to render PDF pages |
| Server | Fastify, `@fastify/multipart` for photo upload |
| Accounts | Better Auth 1.7.7 (`better-auth` and `@better-auth/drizzle-adapter`, always the same exact version) with its `username` plugin and its Google provider, inside the server; the web app uses no Better Auth client library |
| Database | PostgreSQL 17 (in Docker on the Mac, Neon in production, §18), Drizzle ORM + drizzle-kit migrations |
| Validation | Zod (shared in `core/`) |
| AI | Anthropic TypeScript SDK (`@anthropic-ai/sdk`), structured outputs |
| Tests | Vitest |
| Lint / format | Biome |
| Hosting | Vercel (the web build as static files, the API bundled with esbuild into one Vercel Function, §18.2) and Neon (§18.5) |
| CI / deploys | GitHub Actions (`.github/workflows/ci.yml`, §18.4) |

### Accounts
Every learner has an account and signs in with their email or username and a password (M12.1), or with Google (M12.3, below). Better Auth runs inside our Fastify server, with its tables in our database (§5) and its migrations in our drizzle-kit flow.
- **Who can sign up is one setting, `SIGNUP_MODE`:** `invite` (the default when it's unset) or `open`. Either way a new account starts with AI off (the AI switch, below), and the server tells the app the mode (`GET /api/sign-in-options`, below).
  - **`invite`: sign-up is invite-only.** An account can only be created for an email on the invite list (`invites`, edited with `invite:*`, §14), by password or with Google. Better Auth's `user.validateUserInfo` checks the list before any user is created (its `source.action` `create-user`; not when Google signs in again or is linked to an existing account) and answers 403 `not_invited`; once the account exists, a database hook (`databaseHooks.user.create.after`, which Better Auth runs after the sign-up's transaction commits) marks the invite used and links it. After that the list doesn't matter: removing an invite doesn't remove its account.
  - **`open`: anyone can create an account,** by password or with Google. The check is skipped and the list isn't read or changed (an invite for the email stays unused); it stays, for a return to `invite`. Opening sign-up for real waits for the email service and a privacy page (§15); until then `open` is for testing only (below).
- **Open sign-up while testing** (M12.7, designed, built and live 2026-10-28; the user, 2026-10-28): production and the Mac run with `SIGNUP_MODE=open` (§18.3, §14).
  - **No privacy page and no test-version notice** for now (the user, 2026-10-28). The data is cleared before the app opens for real, and the link goes only to people the user knows (`docs/plan.md`, M12).
  - **The app learns the mode** from `GET /api/sign-in-options`, which answers `{ google, signUp }`, with `signUp` either `"invite"` or `"open"` (`SignInOptions` in `core/`). The server reads it from the Better Auth instance that applies it (`createAuth` keeps `signupMode` on it), so the answer can't differ from what a sign-up gets. Create account (§10 screen 18) shows "Invite only: use the email your invite was sent to." only for `invite`. If the request fails (or a server from before M12.7 answers without the mode, which the schema refuses), the line isn't shown, just as Google isn't offered; a refusal on submit still says why. Without the line, Create account's form starts right under the title, as Sign in's does.
  - **"This app is invite-only. Ask for an invite first." is unchanged.** It comes only with `not_invited`, which the server sends only in `invite` mode for an email not on the list.
  - Switching back is one setting: `SIGNUP_MODE=invite` on Vercel (then a redeploy), and in the Mac's `.env` (then restart `pnpm dev`).
- **Every API route needs a session,** except `/api/health`, `/api/sign-in-options` (whether Google is offered and who can sign up, asked before anyone signs in) and `/api/auth/*`. An `onRequest` hook in front of them reads the session cookie (`auth.api.getSession`, without extending the session) and hands the route the learner, `{ id, learnerLanguage, aiEnabled }`; without a session it answers 401 `unauthorized`. Routes keep everything per `user_id`, so another learner's ids answer 404 (§9).
- **The AI's language** is the signed-in learner's, passed to every AI call (§11) from the session; the AI client is created once without one.
- **User 1** is the prototype's single learner, created by the seed migration (`0001_seed-single-user.sql`), who owns the word list on the Mac. It has no email or password until `user:claim` (§14) makes it the developer account, with AI on. In production `user:claim` ran on Neon's fresh database, so the developer account is user 1 there too (§18.8).
- **Sessions** are rows in `auth_sessions`, found through the cookie `better-auth.session_token` (HttpOnly, `SameSite=Lax`, signed with `BETTER_AUTH_SECRET`). A session lasts 60 days and is extended by each day's use: the web app calls `GET /api/auth/get-session` when it starts, which refreshes it and its cookie (§10). On the Mac the cookie is never `Secure` (`advanced.useSecureCookies: false`), so signing in works over the LAN's plain HTTP; Safari and the Home Screen app keep separate cookies, so each signs in once. **In production** (M12.4, §18) the cookies are `Secure` and carry the `__Secure-` prefix (`__Secure-better-auth.session_token`, `__Secure-better-auth.state`; `useSecureCookies: true`), with the same lifetime and attributes.
- **Addresses on the Mac:** the base URL follows the request's host among `localhost`, `127.0.0.1`, `192.168.*.*`, `10.*.*.*` and `*.local` on `WEB_PORT` (Better Auth's `baseURL.allowedHosts`, `protocol: "auto"`, falling back to `http://localhost:<WEB_PORT>` for the scripts), and the same addresses are the trusted origins: a sign-in, a sign-up, or any POST to `/api/auth/*` that carries the cookie must come from one of them (403 `INVALID_ORIGIN`). Better Auth skips this check when `NODE_ENV=test`; ours sets `advanced.disableOriginCheck: false`, so it always runs. A browser's sign-in is checked even before it has a cookie: Better Auth does so for `/sign-in/email` and `/sign-up/email` (`formCsrfMiddleware`: any `Origin`, `Referer` or `Sec-Fetch-*` header must name a trusted origin, and a cross-site navigation is refused), and our `hooks.before` runs the same check on the username plugin's `/sign-in/username`, which lacks it (found in M12.4). A client that sends none of those headers, such as `demo:import`, isn't a browser and passes.
- **Addresses in production** (M12.4, §18): one static base URL, `BETTER_AUTH_URL` (`https://dingsda.vercel.app`), which is also the only trusted origin; a deployment's own `*.vercel.app` address, the Mac's and the LAN's are refused (403 `INVALID_ORIGIN`), and Google's return address is always production's, whatever host a request came in on. The server takes its production behaviour from `BETTER_AUTH_URL` and nothing else: config accepts only an https address with nothing after the host, the Vercel Function refuses to start without it, and the Mac's server refuses to start with it (§14).
- **Rate limits:** 5 attempts a minute per client address on each of `/sign-in/email`, `/sign-in/username`, `/sign-up/email` and `/delete-user` (which checks a password too), and 10 a minute on `/sign-in/social` (Continue with Google, which checks no password; Better Auth's own rule for every `/sign-in` path, 3 per 10 s, would trip over a few tries in a row), then 429; switched on explicitly (Better Auth's default is production only) and counted in `auth_rate_limits`, so every server instance sees them. On the Mac the address comes from `x-forwarded-for`: Vite's proxy adds the device's address (`xfwd`), and the server, listening on 127.0.0.1 only, trusts the loopback hop (`advanced.ipAddress.trustedProxies`). The Mac's own browser, itself on loopback, has one shared count. In production it comes from Vercel's `x-vercel-forwarded-for` alone (`advanced.ipAddress.ipAddressHeaders`, no trusted proxies): Vercel's edge sets it to the client's address, a single one, and a client's own `x-forwarded-for` or `x-real-ip` doesn't count (§16). A key in `auth_rate_limits` reads `<address>|<path>`; `no-trusted-ip|<path>` would mean the header was missing and everyone shared one count.
- **Ids:** Better Auth runs with database-generated integer ids (`advanced.database.generateId: "serial"`), so `users.id` and every `user_id` stay integers; its answers carry ids as strings (`"2"`), and the server converts them where it reads them.
- **Errors:** Better Auth's endpoints answer with their own body, `{ code, message }` (`USERNAME_IS_ALREADY_TAKEN`, `INVALID_EMAIL_OR_PASSWORD`, `not_invited`…; the rate limiter's 429 has only a message). `core/`'s client turns them into `ApiClientError`s like ours (§12).
- **No password reset by email.** Until the email service exists, a forgotten password is reset by the owner with a script (`user:set-password`, §14), and Sign in has no "Forgot password" link.
- **An account holds everything the learner does:** words, imports, practice history, AI usage. Later features (statistics, push notifications built on practice behaviour) hang off the same user id.

**Google** (M12.3): **Continue with Google** on Sign in and Create account, and **Connect** on Account (§10 screens 17–19), through Better Auth's Google provider (`socialProviders.google`) without its client library.
- **Only with the Google pair:** the server has Google when `.env` holds `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (both or neither; §14); without them it starts as before, `GET /api/sign-in-options` says `google: false` and no screen offers Google. Scopes are Google's basic `openid email profile` (no warning screen, no verification, §16), and Google's account chooser opens every time (`prompt=select_account`), so another Google account can be picked after a refusal.
- **Only where Google returns to:** Google accepts only https return addresses, or `localhost`. The screens offer Google only on https or on `localhost` (the address registered for the Mac's own browser, §14), so the iPhone over the LAN's plain HTTP, `127.0.0.1` and `*.local` don't show a button that would end on Google's error page; they sign in with the password. An account that has Google shows it as connected wherever it is viewed.
- **The trip:** the web app asks `POST /api/auth/sign-in/social` (or `/link-social`) for Google's address with two return addresses of the app, `callbackURL` and `errorCallbackURL` (paths, never another site), and opens it. Google sends the browser back to `/api/auth/callback/google`, whose host is the one the app was opened on (Vite's proxy keeps it), so on the Mac it is `http://localhost:5173/api/auth/callback/google`. The server exchanges the code at Google's token endpoint, reads the id token, and redirects to `callbackURL` (signed in), or to `errorCallbackURL` with `?error=<code>`. The state of a trip under way is a 10-minute row in `auth_verifications` plus a 5-minute signed cookie (`better-auth.state`).
- **A first Google sign-in creates an account** (an email with no account yet): through the same invite check as a password sign-up (`create-user`); an email not on the list comes back to Sign in with `?error=not_invited` and nothing is made. The new account has `email_verified` as Google says (true for Gmail), `ai_enabled` false, the languages `en` / `de`, Google's picture in `image`, and its invite is marked used. **Its username** is made from the email (`databaseHooks.user.create.before`, `auth/usernames.ts`): the part before `@` (and before a `+tag`), lower-case, accents dropped and `ß` written `ss`, each run of other characters than letters, digits, `.` and `_` turned into one `_`, none left at either end, at most 30 characters, `user` when nothing is left; when that name is taken or shorter than 3 characters, the first free one with a number (2, 3, …) is used, shortened to stay within 30 (`anna.schmidt@gmail.com` → `anna.schmidt`, then `anna.schmidt2`; `jo@…` → `jo2`). `display_username` and `name` are the same (as on a password sign-up, `name` is the username). It can't be changed yet (plan, M12).
- **Signing in again with Google** finds the account by its Google account (`auth_accounts`, `provider_id` `google`, `account_id` Google's `sub`); the invite list no longer matters.
- **Google's tokens are not kept** (M12.3b; the user's decision of 2026-10-26). The app never calls Google after sign-in: the id token is read once, during the callback, and nothing needs Google's access later. So every write of a Google sign-in method leaves `access_token`, `refresh_token`, `id_token` and their two expiry columns empty: the first Google sign-up, a later sign-in (which Better Auth turns into an update of the row), Connect (a new row, or an update when that Google account is already connected) and the implicit link of a verified email. Two database hooks do it, whichever path writes: `databaseHooks.account.create.before` empties them on any sign-in method but `credential`, and `account.update.before` on any update that carries a token (a password change carries only `password`). Google's `account_id` and the `scope` it granted are kept (what was granted, not a credential). The tokens stored before M12.3b were cleared by the migration `0007_clear-oauth-tokens.sql`. Encrypting them (`account.encryptOAuthTokens`) was considered and rejected: with nothing kept there is nothing to leak, back up or decrypt. No copy of a sign-in method goes into a cookie either (`account.storeAccountCookie: false`), and Better Auth's endpoints that hand out, refresh or use the tokens are switched off (§9.4).
- **An existing account with the same email** that hasn't connected Google: Better Auth links it by itself only when the account's own email is verified (`email_verified`) and Google says Google's is, then signs in. Password sign-ups have unverified emails (there is no email verification yet), so a Google sign-in for one comes back to Sign in with `?error=account_not_linked`: sign in with the password, then **Connect**. The developer account, whose email `user:claim` marks verified, is linked by its first Google sign-in with its own email (no invite needed), which is safe: whoever holds that Google account holds the email. **This implicit linking stays on** (the user's decision of 2026-10-26), also after Disconnect (below).
- **Connect** (Account, while signed in): `POST /api/auth/link-social`, back to Account either way; no invite check. The Google account's email must be the account's (Better Auth's default; `allowDifferentEmails` stays off), so connecting can't attach someone else's Google account. A failure comes back as `?error=email_does_not_match`, `account_already_linked_to_different_user` (that Google account belongs to another account here), `unable_to_link_account` (Google hasn't verified its email) or `access_denied` (cancelled on Google's page), said in plain words on Account (§12).
- **Disconnect** (Account, while signed in; M12.3b): `POST /api/auth/unlink-account` with the Google sign-in method's id from `list-accounts` (`{ accountId }`, §9.4) removes the `google` row; the account stays signed in, and Connect adds it again. It doesn't go to Google, so it works over the LAN too.
  - **Only an account with a password can disconnect Google.** Better Auth never removes an account's last way to sign in (`account.accountLinking.allowUnlinkingAll` stays off; 400 `FAILED_TO_UNLINK_LAST_ACCOUNT`), so a Google-only account's row just shows "Connected" (§10 screen 19).
  - **The password can't be removed** (there is no way to remove it on Account): a `hooks.before` middleware on `/unlink-account` refuses the `credential` row (400 `CANNOT_UNLINK_PASSWORD`). Otherwise an account with both could be left with Google only and then deleted without a password from a sign-in under a day old, which the password rule for deleting an account (below) is there to prevent.
  - **It needs a sign-in from within the last day** (Better Auth's `session.freshAge`, counted from when the sign-in was made, not from its daily extension): otherwise 403 `SESSION_NOT_FRESH`, and Account says to sign out and in again (§12).
  - **Afterwards, for an account with a verified email** (the developer's), the next Continue with Google with that email signs in and connects Google again by itself (implicit linking, above); Account says so when Google is disconnected. Any other account's Google sign-in then comes back with `account_not_linked`, as before it was connected.

**The AI switch** (`users.ai_enabled`, M12.2). The AI features are photo and PDF import (Call 1), enrichment (Call 2: example sentences, and the forms the dictionary lacks) and Ask AI (Call 3). They are off for a new account, which can type words and practise; on for the developer's own (`user:claim` sets it). The owner switches them with `user:ai` (§14); later a subscription turns them on (plan, Later: AI for subscribers).
- **The switch counts from the next request,** without signing in again: the session hook reads the `users` row with the session on every request (Better Auth's cookie cache, which would keep a copy of the user in the cookie, is off).
- **Without AI the server refuses the AI routes** with 403 `ai_not_enabled`, "AI isn't included in your account", before anything else happens (no AI call, no `ai_usage` row): `POST /imports` (both its sources, `photos` and `pdf`; a body that fails validation is still 400), `POST /imports/:id/photos`, `POST /words/describe` and `POST /words/enrich-pending` (`requireAi` in `auth/learner.ts`).
- **Saving works without AI, with no AI call:** typed words (§6.7) and an import begun before the switch went off (`POST /imports/:id/save`) get the dictionary's facts only, enrichment's first step (§6.6); their `enriched_at` stays null, so an account with AI that adds the same shared word later gets its example sentence. A shared word some other account's AI already enriched shows its example. `detailsPending` is 0 for an account without AI, in the save answers and on `GET /stats`, since it has nothing to add details with.
- **The screens leave the AI out** (the web app knows `aiEnabled` from `GET /api/auth/get-session`, §10): New import is Add words, Confirm word has no **Ask AI**, and nothing offers **Add details** or says details are pending.
- **With AI,** everything works as before, within each account's daily limits (§11.5).

**Deleting an account** (M12.2): Settings → Account → **Delete account** (§10 screen 19) calls `POST /api/auth/delete-user` (Better Auth's `user.deleteUser`, enabled).
- **An account with a password confirms with it.** Better Auth would also accept a sign-in younger than a day (its `session.freshAge`) instead; a `hooks.before` middleware on `/delete-user` refuses that for an account that has a password (400 `PASSWORD_REQUIRED`), so a borrowed phone that is signed in can't delete the account. A Google-only account has no password and needs a sign-in from within the last day; otherwise 400 `SESSION_EXPIRED`, and Account offers **Sign in with Google** (where Google is offered, §10 screen 19), which signs in again with a fresh session and comes back to Account.
- **What goes:** Better Auth deletes the account's sign-ins and sign-in methods, then the `users` row, and our cascades (§5) take the imports, the words in the list, the practice sessions and answers, the AI usage and the account's invite with it. An `afterDelete` hook then removes what the cascades don't reach (`removeLeftovers` in `auth/accounts.ts`): any invite for the account's email that was never linked to it (one added again after the account existed), so the email can't sign up again unless it is invited again, and the state of a Connect to Google under way, which holds the account's id and email (§5, `auth_verifications`; M12.6). It isn't one transaction (Better Auth's endpoint isn't), but every step only deletes.
- **By script:** `user:delete` (§14, M12.6) deletes an account the same way, the same rows from every table (a test holds the two to it), in one transaction.
- **What stays:** the shared word facts (`words`, `word_translations`) and the dictionary; other learners are untouched.
- **Afterwards** the cookie is cleared and the learner lands on Sign in with "Your account was deleted." (§10).
- **Backups:** Neon's history keeps a deleted account for 6 hours (§18.5); the nightly backups (M12.5, §18.6, live since 2026-10-28) keep it for at most 30 days, the bucket's lock and lifecycle rule. They hold no sign-ins (§18.6).

## 5. Data model

```
users ──< user_words >── words ──< word_translations
  │           │            │
  ├──< imports┘            └ (checked against) dictionary_entries
  ├──< sessions ──< card_results >── user_words
  ├──< ai_usage
  ├──< auth_sessions, auth_accounts
  └──< invites (the one it was made from)
```

**Deleting a user deletes their data in one statement:** `imports`, `user_words`, `sessions`, `ai_usage`, `auth_sessions`, `auth_accounts` and `invites` reference `users` with `ON DELETE CASCADE`, and `card_results` cascade from sessions and user words. The shared `words` and `word_translations` rows stay, since they hold no personal data. Deleting an account, from the app or with `user:delete` (§4 Accounts, §14), relies on this; a test holds every table that references `users` to `ON DELETE CASCADE`. `auth_rate_limits` is counted per address, not per account. `auth_verifications` holds the state of a Google sign-in under way, which is no account's, except Connect's: it carries the signed-in account's id and email for its 10 minutes (§16), so deleting an account removes it with the rest (M12.6).

### `users`
The learner's account, and Better Auth's user model (`user.modelName: "users"`; it addresses the columns by their Drizzle property names).

| Field | Notes |
|---|---|
| `id` | |
| `name` | The username as typed (set from it on sign-up; with Google, the username made from the email, §4 Accounts); user 1 keeps "Learner" |
| `learner_language` | `en` (later `ko`); default `en` for a new account. Better Auth "additional field" with `input: false`: no client can set it |
| `target_language` | `de`; default `de`, `input: false` like `learner_language` |
| `created_at` | |
| `email` | Unique, stored lower-case; null only on user 1 until `user:claim` (§4 Accounts) |
| `email_verified` | Default false; true on the claimed developer account, and after a Google sign-up when Google says so (always for Gmail). Better Auth links Google by itself only to a verified email (§4 Accounts) |
| `image` | Google's picture address, from a Google sign-up; unused for now |
| `updated_at` | |
| `username` | Unique, stored lower-case; made from the email for an account made with Google (§4 Accounts) |
| `display_username` | The username as typed, shown in the app |
| `ai_enabled` | Default false; `input: false`, so no client can set it. Set by `user:claim` and `user:ai` (§14); the AI switch (§4 Accounts) |

### Better Auth's tables
Prefixed so they aren't confused with practice `sessions`, and named explicitly in its configuration (`session.modelName: "authSessions"` etc.; never `usePlural`, which would pick our `sessions`). Integer identity ids like ours.
- `auth_sessions`: one per sign-in: `token` (unique), `expires_at`, `ip_address`, `user_agent`, `user_id`.
- `auth_accounts`: one per way to sign in: `provider_id` `credential` with the password hash in `password` (scrypt) and the user's id as `account_id`; `google` with Google's account id (`sub`) as `account_id` and the `scope` it granted. Google's tokens are not kept (§4 Accounts): `access_token`, `refresh_token`, `id_token`, `access_token_expires_at` and `refresh_token_expires_at` stay empty (database hooks on every write; `0007_clear-oauth-tokens.sql` cleared the ones stored before). Disconnect deletes the `google` row (§4 Accounts).
- `auth_verifications`: the state of a Google sign-in under way (`identifier` `auth-state:<state>`, 10 minutes; `value` JSON with the return addresses and the PKCE verifier, and for Connect `link: { userId, email }`), deleted when Google sends the browser back; an abandoned one is deleted by the next lookup after it expired, and a Connect's when its account is deleted. Email verification will use it too.
- `auth_rate_limits`: the sign-in and sign-up attempt counters, `key` (`<address>|<path>`), `count`, `last_request` (ms).

### `invites`
| Field | Notes |
|---|---|
| `email` | Primary key; trimmed and lower-case |
| `created_at` | |
| `used_at`, `user_id` | When an account was created for it, and which (§4 Accounts) |

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
| `source` | `photos` (the default), `pdf`: pages of a PDF rendered to images (§6.8), or `typed`: a list of words typed by hand (§6.7) |
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
| `lemma`, `pos` | Indexed together, also as `(lower(lemma), pos)` for the case-insensitive lookup, and `lower(lemma)` with a trigram index (`pg_trgm`) for suggestions and similar words (§7) |
| `genders` | Array, e.g. `[der]`, `[der, das]` |
| `plurals` | Array |
| `forms` | JSON, same shape as `words.forms` |
| `glosses_en` | Array of short English glosses |
| `ipa`, `audio_file`, `audio_url` | The entry's pronunciation (§7), same meaning as in `words`; nullable |

### `dictionary_forms` — inflected forms, loaded from Wiktionary
| Field | Notes |
|---|---|
| `form` | An inflected form, e.g. `ging`, `Tische`, `aufgestanden`; indexed as `lower(form)` |
| `lemma`, `pos` | The base word it is a form of (`gehen` verb, `Tisch` noun, `aufstehen` verb) |

`UNIQUE (form, lemma, pos)`; a form can belong to several base words. Used only to find typed words (§6.7).

### `ai_usage`
| Field | Notes |
|---|---|
| `id`, `user_id`, `import_id` | |
| `call_type` | `extract` / `enrich` / `describe` (§11.6) |
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
   (or up to 10 pages of a PDF, each rendered to such a JPEG, §6.8)
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
- New candidates are listed, all set to **Practice** by default. Tapping a row toggles Practice / Ignore. "Practice all" / "Ignore all" buttons. The labels say what saving does (§6.5): Practice → `learning`; Ignore → `ignored`, kept in the list but never practised or offered again. The API keeps the actions `add` / `skip`.
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
1. **Dictionary first:** if `dictionary_entries` has plural (nouns) or verb forms, copy them to `words`, `forms_source = dictionary`; copy the pronunciation (`ipa`, `audio_file`, `audio_url`) too. Both come from the entries that describe the word: for a noun those with its own gender (*der Band* → *Bände* /bant/, *die Band* → *Bands* /bɛnt/) or, when none has it, those without a gender (plural-only nouns such as *Eltern*); for other words every entry found (§6.3, including the non-noun fallback: *nicht* as a particle gets the adverb's recording). The pronunciation is the one of the first such entry with a recording, otherwise of the first with IPA. The copy happens before the AI call, so a word keeps its dictionary facts even if the AI fails. The AI never writes a pronunciation: a word without one in the dictionary has none. A word typed by hand already has the facts of the entry the learner chose (§6.7); this step leaves a word whose `forms_source` is set as it is (and asks the AI for no forms for it), and never replaces a pronunciation a word already has.
2. **AI fills the gaps:** AI call 2 receives the words in batches of up to 30, three batches at a time. It always writes the example sentence and its translation, and writes plural / verb forms only for words where the dictionary had none (`forms_source = ai`). Each result is matched to its word by `ref`, and only used if its `lemma` is that word's lemma.
3. Set `enriched_at`. Updates only touch rows where `enriched_at` is still `null`, so two runs never write the same word twice.

A failed batch (AI busy, refused, invalid output) leaves its words pending; the other batches still count, and saving never fails because of enrichment. Save answers after enrichment, so the Review screen shows "Adding details…" meanwhile; the server finishes enrichment even if the phone drops the connection, and the phone then finds the import done and shows the Done screen.

A word already enriched by a previous import (any user) needs no AI call — this is the benefit of the shared `words` table.

**Without AI** (§4 Accounts, the AI switch) only step 1 runs: the dictionary's forms and pronunciation are copied, and there is no AI call. The words keep `enriched_at = null` (an account with AI that adds them later fills them in), and the answer's `detailsPending` is 0.

**Pronunciation backfill:** enriched words never pass through enrichment again, so words saved before pronunciation existed get it from `pnpm --filter server backfill:pronunciation` (`backfillPronunciation()` in `server/src/words/pronunciation.ts`): every German word with neither `ipa` nor `audio_url` gets the dictionary pronunciation, chosen as above. Run it after re-importing the dictionary (it refuses while the dictionary has no recordings); it prints how many words it updated and is safe to run again, since a word that has a pronunciation is never touched. Measured on the author's list before running it: 141 of 149 practisable words have a recording in the dictionary, 134 an IPA.

**Measured (2026-10-11, Haiku 5.5 `medium`):** backfilling the 94 words saved before enrichment existed took 4 calls in 10 s for ≈0.5¢; 30 noun plurals and 16 verb forms came from the dictionary, 1 plural and 2 verb forms from the AI. A typical save (15–40 added words, one or two parallel batches) adds roughly 5–10 s. With Opus 5.5 an 11-word batch took 10 s, so a full 30-word batch would add more; if saves grow slow, switch to answering at once and enriching in the background.

### 6.7 Typed words
Instead of photographing pages, the learner can type German words (§10 screens 14–15): **one word**, or **a list** of up to 30, typed or pasted one per line. Either way each typed text is confirmed on its own, one at a time:
1. **Look up** (`GET /dictionary/lookup`, §9.3). In order, the first that finds something: the dictionary entries whose lemma is the text, ignoring case (*see* → der See "lake", die See "sea"); the base words the text is a form of (*ging* → *gehen*, *Tische* → *Tisch*; §7, forms table); up to 5 similar words, as "Did you mean…?" (*Regenschrim*, *Rgenschirm* → *Regenschirm*). Every entry is offered on its own, so one word can appear twice with different meanings and plurals (*die Bank* "bench" → *Bänke*, *die Bank* "bank" → *Banken*).
2. **Choose** one or more entries. An entry whose word (`lemma`, `pos`, article) is already in the learner's list, in any status, can't be chosen; it links to that word.
3. **Translation** for each chosen entry, editable, at most 200 characters: one of the entry's glosses, shortened (the parts in parentheses dropped: "umbrella (used for protection against rain)" → "umbrella"); the AI's short translation (**Ask AI**, Call 3, §11.6); or the learner's own.
4. **Not in the dictionary:** instead of an entry, the learner can enter the word themselves (base form, part of speech, article for a noun, translation), or let **Ask AI** fill all four from the typed text; the AI also corrects the spelling and gives the base form (*Regenschrim* → *der Regenschirm*). When the AI's word is in the dictionary, its entries are offered as in step 1 instead: only those with the AI's part of speech and, for a noun, its article (*ging* → *gehen* the verb, not *das Gehen*); when none has them, the AI's word fills the form. The form is a word only once it is complete (the word, part of speech and translation; the article is optional); an empty or half-filled form saves nothing and is not counted.
5. **Add**, or in a list **Remove**: the text is dropped and nothing is saved for it. (Unlike Ignore on photo Review, nothing is remembered: the learner typed the word on purpose.)

**Saving** finds or creates each `words` row by identity, as in §6.5:
- A new row chosen from the dictionary gets that entry's plural, forms and pronunciation at once (`forms_source = dictionary` when it has forms) and `check_status = match`. One entered by hand or by the AI is checked like a candidate (§6.3) and gets `match`, `mismatch_kept` or `not_in_dictionary`. The `word_translations` row holds the chosen translation.
- An existing row is reused unchanged; when the chosen translation differs from its stored one, it becomes the learner's `custom_translation`.
- The `user_words` row is `learning`. A word already in the list is left as it is, so nothing is ever added twice.
- **One word** (`POST /words`: the entries chosen for one typed text) has `import_id = null`; no import is created.
- **A list** (`POST /imports/typed`) becomes one import, `source = typed`, `status = done`, without photos, holding every word it added (`import_id`): it is a past import (§9.2), and Done offers **Practice these now** and naming (§10 screen 3). When nothing is added (every word removed or already in the list), no import is created.
- Then enrichment runs as for imported words (§6.6): the example sentence, and the forms the entry didn't have.
- **Without AI** (§4 Accounts) the words are saved the same way but with no AI call: they keep the dictionary's facts (the chosen entry's, and for a word entered by hand the dictionary step of §6.6), a shared word that already has an example sentence, written for someone else, shows it, and `detailsPending` is 0. There is no **Ask AI** on Confirm word (§10 screen 15), and the hand form is filled in by hand.

The typed list, the decisions so far and the current word are kept in the tab (`sessionStorage`), so a reload continues at the same word; nothing reaches the server before the last word of a list is decided.

### 6.8 PDF pages
Instead of photographing pages, the learner can import pages of a book they have as a PDF (§10 screen 16). The pages are turned into images **on the phone** and then go through the photo flow unchanged (§6.1–§6.6): each page is one upload, one extract call and one count towards the daily limit (§11.5), with the same per-page states, Retry, merge, Review, save and enrichment.
- **Rendering:** pdf.js (`pdfjs-dist` 6.4, `web/src/device/pdf.ts`: `openPdf(file)`, `renderPage(doc, pageNumber)`) draws one page at a time on a canvas, so its longest side is 1600 px, and turns it into a JPEG at quality 0.85, like a shrunk photo (§6.2); the canvas is released before the next page. The Import screen renders the pages one at a time, as it shrinks photos, while it sends them at most two at a time. Sending the PDF itself to Claude was rejected: Claude bills each PDF page as text *and* as an image, the whole book would have to be uploaded, and a cleanly rendered page already reads better than a photo.
  - **Safari 18:** the app uses pdf.js's **legacy build**; the modern one calls `Map.prototype.getOrInsertComputed` and `Math.sumPrecise`, which Safari 18 lacks (it failed on the author's iPhone, iOS 18.7.2, 2026-10-23). pdf.js loads only on PDF pages, in its own chunk.
  - **The worker:** pdf.js runs in a web worker, which plain HTTP allows (only service workers need a secure context). The app starts the worker itself and hands it to pdf.js, which would otherwise quietly fall back to running on the page if the worker failed: a failure shows as "Couldn't start the PDF reader" instead.
  - **Files pdf.js loads as it needs them** (fonts a PDF doesn't embed, CMaps, the JPEG 2000 and JBIG2 image decoders with their plain JavaScript fallbacks, colour profiles) are served from `pdfjs-dist` at `/pdfjs/…` by a small plugin in `web/vite.config.ts`, in dev and in `vite build` alike.
  - **Scanned books are slow on Safari 18:** pdf.js's JPEG 2000 decoder needs a WebAssembly feature Safari 18 lacks (relaxed SIMD), so it falls back to plain JavaScript. On the author's iPhone a page of their scanned book took ≈3.2 s at 1600 px and a thumbnail ≈1.6 s (2026-10-23). Hence thumbnails one at a time, the stale ones cancelled, and nothing on PDF pages waiting for them (§10 screen 16).
- **Pages:** a range of **at most 10** pages per import, From–To, inside the document. The numbers are the ones printed in the book when the PDF carries page labels (pdf.js `getPageLabels`; labels that only repeat the PDF's own numbers count as none), otherwise the PDF's own page numbers, and the screen then says so; thumbnails of the chosen pages show which pages they are. The author's book has no labels, and its printed numbers can't be worked out from the PDF's: it holds the course book and the workbook, so PDF page 20 is printed 102, but PDF page 120 is the workbook's "AB 114". When a printed number occurs twice in a labelled PDF, From is the page with that number nearest the pages suggested, and To is looked for from From onwards.
- **The book is remembered** on the phone: the last PDF chosen is kept in the browser's storage (IndexedDB, `web/src/device/bookStore.ts`) with its name and the last range imported (recorded when that import is created, with its first page), so the next PDF import opens on it and suggests the pages after that range (after 42–45: 46–49). One book at a time; **Choose another PDF** replaces it (the same PDF chosen again keeps its place). Nothing about it reaches the server, and it stays on that phone only: clearing Safari's data removes it, Safari may clear it after 7 days without a visit, and Safari and a Home Screen icon keep separate storage; the learner then simply picks the PDF again. If the browser refuses to store it (storage full, private browsing), the import still works, without remembering. The open book also stays in the tab's memory, so going between PDF pages and Import doesn't open it again.
- **No file-size limit:** the PDF never leaves the phone; Safari reads it into memory. The author's book is 90 MB (215 scanned pages with JPEG 2000 images and an OCR text layer); the iPhone opened it and stored it in IndexedDB (2026-10-23).
- **Name:** without a typed name, the import is named after the pages, "Pages 42–45" (one page: "Page 42"); it can be renamed as usual (Done, Settings). The import is created with `source = pdf`.

## 7. Wiktionary dictionary

- **Source:** German entries from English Wiktionary, as the JSONL download from kaikki.org (`kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl`, 1.08 GB, 371k lines; downloaded 2026-10-11, file dated 2026-10-03). kaikki marks this file **deprecated, to be removed**; the importer also accepts the raw wiktextract dump for all languages (`.jsonl.gz`), keeping only `lang_code = de`, as the replacement. The downloaded file lives in `data/kaikki/` (git-ignored).
- **Import:** `pnpm --filter server import:wiktionary <file>` streams the file and writes `dictionary_entries` and `dictionary_forms` (98,308 entries and 249,020 forms in ≈14 s on the development Mac, measured 2026-10-17; reading and mapping the file is ≈10 s of it). The tables' indexes that no constraint needs (the trigram index above all) are dropped inside the load's transaction and built again from their own definitions after the rows are in, which is far quicker than keeping them up to date row by row; the forms go in as three arrays per batch (`unnest`). Mapping (`server/src/dictionary/kaikki.ts`):
  - **Part of speech:** `noun`, `verb`, `adj`→adjective, `adv`→adverb, `pron`→pronoun, `prep`/`postp`→preposition, `conj`→conjunction, `det`/`article`→determiner, `num`→numeral, `particle`, `intj`→interjection, `contraction`→other. Everything else is skipped: proper names (`name`), phrases, proverbs, affixes, symbols.
  - **Form-of entries:** senses that only point to an inflected form ("nominative plural of Tisch") are dropped, and an entry with no other senses is skipped (≈268k entries). Derived words that Wiktionary also files as form-of are kept: female equivalents (*Freundin*), agent nouns (*Lehrer*), diminutives, gerunds and verbal nouns.
  - **`genders`:** from the gender tags (masculine/feminine/neuter) of the kept senses. A noun with several genders appears as several entries (*das/der/die Band*), each with its own plural.
  - **`plurals`:** forms tagged exactly `plural` (qualified variants such as "Handies, now nonstandard" are left out).
  - **`forms`** (verbs): Präteritum from the form tagged `past`, Partizip II from `participle past`, auxiliary from `auxiliary`. When Wiktionary lists both *haben* and *sein* (529 verbs, e.g. *fahren*, *aufstehen*), `forms` stays empty so enrichment picks the usual one; a card shows one auxiliary.
  - **`glosses_en`:** the most specific gloss of each kept sense, up to five.
  - **Pronunciation** (from the entry's `sounds`; each sound is checked on its own, so a malformed one never drops the entry): **`ipa`** is the entry's first IPA tagged `Germany`, otherwise its first IPA (*November* lists the Austrian /noˈfɛmbɐ/ first). The recording is the entry's best one: tagged `Germany` (almost all are "Germany, Berlin"), then untagged, then any (Austria, Bavaria…). **`audio_file`** is its Commons file name and **`audio_url`** its `mp3_url`, the MP3 transcode on `upload.wikimedia.org` (iPhone Safari cannot play Ogg); recordings hosted anywhere else are ignored. Wiktionary repeats the sounds on every entry of a word, but homographs with different sounds have their own (*der Band* /bant/, *die Band* /bɛnt/).
  - A test loads a 74-line sample cut from the real file (`server/test/fixtures/kaikki-sample.jsonl`, made with `server/scripts/make-kaikki-sample.ts`), with the IPA and recordings of each entry, and form-of entries for the forms table (*ging*, *gegangen*, *Tische*, *aufgestanden*, *schneller*, *Banken*).
- **Check from the command line:** `pnpm --filter server dict:lookup <lemma> <pos> [article]` prints the entries and the check result.
- **Re-running** the import replaces the table (truncate + insert in one transaction).
- **Forms table:** the import also keeps what the form-of entries say (≈277k entries in the file consist only of them, e.g. *ging*: "first/third-person singular preterite of gehen") as `dictionary_forms` rows, form → base word and the form entry's part of speech: *ging* → *gehen*, *Tische* → *Tisch*, *aufgestanden* → *aufstehen*, *schneller* → *schnell*. Each form is kept once per base word, and a form equal to its base word, ignoring case, is left out (the lookup finds that word anyway). Derived words filed as form-of (*Freundin*) stay entries, not forms. The lookup offers a base word only when the dictionary has an entry for it with that part of speech. Both tables are replaced in the same transaction. Only typed words use it (§6.7); a database loaded before M10 needs the import run once more.
- **Search for typed words** (`server/src/dictionary/search.ts`): **suggestions** are the entries whose lemma starts with the typed letters, ignoring case (an exact match first, then shorter lemmas, then alphabetical), topped up with similar words when they give fewer than 3 views; **similar** words are ranked by the trigram similarity of the lower-cased lemma (`pg_trgm`'s `similarity()`, at least 0.3), best first, then shorter. The lookup's exact entries put the typed case first (*morgen*: the adverb, then der and das Morgen). On the full dictionary each query takes a few milliseconds (prefix 13 ms for two letters, similar 5 ms, forms under 1 ms). A migration creates the `pg_trgm` extension (part of PostgreSQL, and a trusted extension, so the database owner may create it).
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
  - if not enriched yet: whatever is available, plus a "Details pending" pill (not for an account without AI, which has no way to add them; `cardBack(word, { aiEnabled })` in `core/`)
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

All routes under `/api`, JSON unless noted. Request and response shapes are Zod schemas in `core/`. Every route but `/health`, `/sign-in-options` and `/auth/*` needs a session and acts for its learner; without one it answers 401 `unauthorized` (§4 Accounts, §9.4).

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{ status: "ok" }` |
| GET | `/sign-in-options` | `{ google, signUp }` (`SignInOptions`): whether the server has the Google pair, and its `SIGNUP_MODE`, `"invite"` or `"open"` (M12.7; §4 Accounts); open to everyone, like `/health` |
| GET, POST | `/auth/*` | Better Auth's endpoints: sign-up, sign-in (by password or Google), Connect, Disconnect, sign-out, the session, see §9.4 |
| GET | `/stats` | Home counters (learning, learned), `detailsPending` (the learner's non-ignored words without details; always 0 for an account without AI) and unfinished imports |
| GET | `/imports` | Past imports → `{ imports }`, see §9.2 |
| POST | `/imports` | Create import `{ name?, source? }` (name trimmed, at most 100 characters; `source` `photos` (default) or `pdf`, §6.8; anything else, `typed` included, is 400 `invalid_request`) → 201 + import |
| PATCH | `/imports/:id` | Rename `{ name }` → `{ id, name }`, see §9.2 |
| POST | `/imports/:id/photos` | Upload one JPEG (multipart field `photo`, at most 10 MB) → extract, merge, compare, check → `{ pageQuality, wordsFound, import }`. Only while the import is `collecting` |
| GET | `/imports/:id` | Import with its `source` and candidates; `existing` is recomputed on every read |
| POST | `/imports/:id/review` | Move import to `reviewing` (no more photos) → import; 409 `import_closed` once it is done |
| POST | `/imports/typed` | `{ words: [TypedWord] }` → a typed list saved as one import, then enrich, see §9.3 |
| POST | `/imports/:id/save` | `{ decisions: [{ key, action: add \| skip, article? }] }` → save, then enrich → `{ added, skipped, detailsPending }`. Allowed once, from `collecting` or `reviewing` |
| POST | `/words/enrich-pending` | Retry enrichment for the learner's `learning` / `learned` words with `enriched_at = null` → `{ enriched, pending }` |
| GET | `/dictionary/suggest?q=` | Up to 8 entries for the letters typed so far → `{ suggestions }`, see §9.3 |
| GET | `/dictionary/lookup?q=` | The entries for one typed word → `{ entries, forms, similar }`, see §9.3 |
| POST | `/words/describe` | `{ text, entryId? }` → the AI's word (Call 3), see §9.3 |
| POST | `/words` | `{ words: [TypedWord] }` → typed words saved without an import, then enrich, see §9.3 |
| GET | `/words?status=&q=&importId=&sort=` | The learner's words → `{ words, counts }`, see below |
| GET | `/words/:userWordId` | → `WordDetail`, see below |
| PATCH | `/words/:userWordId` | `{ status?, customTranslation?, note? }` → `WordDetail`, see below |
| DELETE | `/words/:userWordId` | → `{ deleted: true }`, see below |
| GET | `/sessions/options` | `{ options: [{ source, count }] }`, in display order; `import`'s count is that of the most recent past import (§8.1), 0 when there is none |
| POST | `/sessions` | `{ source, importId? }` → `{ id, source, cards }`; `importId` is required for `import` and not allowed otherwise (400 `invalid_request`); 404 `import_not_found` for an import that isn't `done` or isn't the learner's; 400 `no_words` for a source without words (also a `done` import without `learning` or `learned` words) |
| POST | `/sessions/:id/results` | `{ userWordId, result, flipped, flipMs, answerMs }` → `{ recorded }` |
| POST | `/sessions/:id/finish` | → `{ knew, didntKnow, skipped, missed }` |

Errors are listed in §12. Ids of another learner's rows answer like unknown ids (404). **The AI routes** — `POST /imports`, `POST /imports/:id/photos`, `POST /words/describe` and `POST /words/enrich-pending` — answer 403 `ai_not_enabled` for an account without AI (§4 Accounts, the AI switch), before anything else (`POST /imports` validates its body first). When the Anthropic credit is used up, a route that needed Claude answers 503 `ai_unavailable` (§12).

### 9.1 Word endpoints
A `WordView` is what a card shows (§8.2): `userWordId`, `lemma`, `pos`, `article`, `plural`, `forms`, `translation`, `customTranslation`, `exampleDe`, `exampleTranslation`, `note`, `enriched`, `ipa`, `audioFile`, `audioUrl`.

- **`GET /words?status=&q=&importId=&sort=`** — `status` (`learning` / `learned` / `ignored`) filters; absent means all. `q` is a case-insensitive substring of the German lemma, the stored translation or the learner's custom translation; `%` and `_` match themselves, a blank `q` is no search. `importId` keeps only the words that import created (any status, so its skipped words are in the Ignored tab); an id that isn't one of the learner's imports simply matches nothing. `sort` is `az` (the default: by lemma, ignoring case) or `newest` (`added_at` newest first, then the newest row first). Each word is a `WordView` plus `status`, `timesSeen`, `correctStreak` (for the progress mark) and `addedAt` (for the day headings). `counts` gives the words per status that match `q` and `importId`, whatever `status` asked for, so the tabs can show where the matches are. No paging: the prototype's list has a few hundred words.
- **`GET /words/:userWordId`** — `WordDetail`: a `WordView` plus `status`, `formsSource`, `checkStatus`, `timesSeen`, `timesCorrect`, `correctStreak`, `lastResult`, `lastPracticedAt`, `addedAt`. 404 `word_not_found`.
- **`PATCH /words/:userWordId`** — fields left out stay as they are. Texts are trimmed; an empty or blank text, or `null`, clears the field (stored as `NULL`). At most 200 characters for the translation and 2000 for the note (400 `invalid_request`). Changing the status to `learning` resets `correct_streak` to 0, so the next correct answer does not mark the word learned again at once; `times_seen` and `times_correct` stay. Answers with the updated `WordDetail`; 404 `word_not_found`.
- **`DELETE /words/:userWordId`** — deletes the `user_words` row and its `card_results`. The shared `words` row and its translations stay, so a later import offers the word again as new, and adding it again reuses its details without an AI call. 404 `word_not_found`.

### 9.2 Past imports
- **`GET /imports`** — the learner's **past imports**: `done` imports with at least one `learning` or `learned` word, newest first (`completed_at`, then id). Each is an `ImportSummary`: `id`, `name`, `source`, `completedAt`, and `wordCount`, its `learning` + `learned` words (what a session from it can draw on, at least 1). An import that added nothing to learn never gets an entry: one whose pages had no new words, one whose new words were all skipped, and one whose words were later all deleted or set to Ignored. The import row itself stays (it is `done`, and its skipped words keep their `import_id`); it is only left out of the list, and comes back if one of its words is moved back to Learning. Unfinished imports stay Home's banners (§10 screen 1).
- **`PATCH /imports/:id`** — `{ name }`, trimmed, at most 100 characters (400 `invalid_request`); an empty or blank name, or `null`, clears it. Allowed in any status. Answers `{ id, name }`; 404 `import_not_found`.

### 9.3 Typed words
An `EntryView` is one dictionary entry as Confirm word shows it (§10 screen 15): `entryId`, `lemma`, `pos`, `article` (one of the entry's genders: an entry with several, *der/das Liter*, gives one view per gender; a noun without a gender has `null`), `plural` (its first), `forms`, `glosses` (up to 3), `ipa`, `audioUrl`, and `inMyWords`, the learner's `userWordId` when a word with this identity is in their list (any status), otherwise `null`.
- **`GET /dictionary/suggest?q=`** — `q` trimmed, at most 50 characters; under 2 characters the list is empty. Up to 8 `EntryView`s (§7, search).
- **`GET /dictionary/lookup?q=`** — `q` trimmed, 1–50 characters. `entries`: the entries whose lemma is `q`, ignoring case. `forms`: only when `entries` is empty, `[{ lemma, pos, entries }]` for each base word `q` is a form of. `similar`: only when both are empty, up to 5 entries by similarity. All three as `EntryView`s.
- **`POST /words/describe`** — `{ text }` (trimmed, 1–50 characters) asks the AI which word the learner meant (Call 3, §11.6) → `{ lemma, pos, article, translation }`. With `entryId`, only a translation is asked for, in that entry's sense, and the answer keeps the entry's word (a noun entry with several genders, *der/das Liter*, has one meaning: its first gender stands in). 404 `entry_not_found`, checked before the AI is asked; 422 `not_german` when the AI says the text isn't German; the AI errors of §12 (`ai_busy`, `ai_unavailable`, `ai_refused`, `ai_invalid_output`); 429 `daily_limit` beyond the Ask AI limit (§11.5); 403 `ai_not_enabled` for an account without AI.
- **`POST /words`** and **`POST /imports/typed`** — `{ words: TypedWord[] }`; a `TypedWord` is `{ lemma, pos, article, translation, entryId? }`, with `entryId` when it was chosen from the dictionary (the server checks that the entry still has that lemma, part of speech and gender; otherwise the word counts as entered by hand). Texts are trimmed; the lemma is 1–100 characters, the translation 1–200; an article on a word that isn't a noun is dropped. Two words with the same identity count once (the first). `POST /words` takes 1–5 words (the entries chosen for one typed text), `POST /imports/typed` 1–150 (a list's 30 texts with up to 5 entries chosen for each; `TYPED_IMPORT_MAX` in `core/`). Both save as in §6.7 and answer after enrichment: `POST /words` → `{ added: [{ userWordId, lemma, article }], alreadyInList, detailsPending }`; `POST /imports/typed` → `{ importId, added, alreadyInList, detailsPending }`, with `importId` `null` when nothing was added. `alreadyInList` counts the words that were in the list already.

### 9.4 Accounts
Better Auth's endpoints under `/api/auth/*`, mounted in Fastify as one GET/POST route that hands each request to its Fetch handler and sends its answer back as it is (both `Set-Cookie` headers included). Their answers carry ids as strings, and their errors are `{ code, message }` (§12). `core/` has the schemas and client calls for the ones the app uses; the web app calls them like any other route, without Better Auth's client library.
- **`POST /auth/sign-up/email`** — `{ email, username, password }` (`SignUpRequest`): username 3–30 letters, digits, `.` and `_`, unique ignoring case (stored lower-case, `display_username` as typed); password 8–128 characters; email unique, stored lower-case. Better Auth's username is optional; ours isn't: a hook before the endpoint answers 400 `USERNAME_REQUIRED` without one, and sets `name` to it. Fields no client may set (`aiEnabled`, the languages) are ignored. Checks the invite list (§4 Accounts), creates the account and signs it in → `{ token, user }` and the session cookie. Errors: 400 `USERNAME_IS_ALREADY_TAKEN`, `USERNAME_TOO_SHORT`, `USERNAME_TOO_LONG`, `INVALID_USERNAME`, `USERNAME_REQUIRED`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`, `INVALID_EMAIL`; 422 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`; 403 `not_invited`.
- **`POST /auth/sign-in/email`** `{ email, password }` and **`POST /auth/sign-in/username`** `{ username, password }` — either in any case → `{ token, user }` and the session cookie. A wrong password and an unknown name get the same 401: `INVALID_EMAIL_OR_PASSWORD`, or `INVALID_USERNAME_OR_PASSWORD`.
- **`POST /auth/sign-out`** — `{}` → `{ success: true }`; ends this sign-in only (its `auth_sessions` row), and clears the cookie.
- **`GET /auth/get-session`** — the session and its account, or `null` when signed out (`AuthSession`). The account is `{ id, email, emailVerified, username, displayUsername, aiEnabled }` (Better Auth sends more; the schema keeps these; `emailVerified` tells Account what Disconnect leaves, §4 Accounts). Extends a session older than a day, with its cookie.
- **`GET /auth/list-accounts`** — the account's ways to sign in, `[{ id, providerId, accountId, userId, scopes, createdAt, updatedAt }]`, never a token (`SignInMethods` keeps `id` and `providerId`): `credential` is a password, `google` Google. Account reads it for its Sign-in methods, to know whether Delete account asks for a password, and for the id Disconnect sends.
- **`POST /auth/unlink-account`** — Disconnect: `{ accountId }` (`UnlinkAccountRequest`), the Google sign-in method's `id` from list-accounts (Better Auth 1.7.7 takes the row's id under that name, not Google's account id, and has no `providerId` form) → `{ status: true }` (`UnlinkAccountResponse`); deletes that row (§4 Accounts). Errors: 400 `FAILED_TO_UNLINK_LAST_ACCOUNT` (the account's only way to sign in), `CANNOT_UNLINK_PASSWORD` (ours: the `credential` row), `ACCOUNT_NOT_FOUND` (not one of the account's), `VALIDATION_ERROR` (no `accountId`); 401 without a session; 403 `SESSION_NOT_FRESH` (the sign-in is more than a day old), `INVALID_ORIGIN`.
- **`POST /auth/sign-in/social`** — Continue with Google: `{ provider: "google", callbackURL, errorCallbackURL, loginHint? }` (`SocialSignInRequest`; both addresses are paths of the app, `loginHint` preselects a Google account) → 200 `{ url, redirect }` (`SocialRedirectResponse` keeps `url`, Google's address, which the web app opens) and the state cookie. Signed in or not (Account's Sign in with Google before deleting signs in again). Errors: 404 `PROVIDER_NOT_FOUND` (no Google pair), 403 `INVALID_CALLBACK_URL` / `INVALID_ERROR_CALLBACK_URL` (an address of another site), 429 after 10 a minute.
- **`POST /auth/link-social`** — Connect: `{ provider: "google", callbackURL, errorCallbackURL }` (`LinkSocialRequest`), with a session (401 without) → the same answer; no invite check.
- **`GET /auth/callback/google?code&state`** (or `?error&state`) — where Google sends the browser back, not called by the app: exchanges the code at Google's token endpoint and redirects (302) to `callbackURL` with the session cookie (sign-in), or after linking; or to `errorCallbackURL` with `?error=<code>` (and `error_description`): `not_invited`, `account_not_linked`, `email_does_not_match`, `account_already_linked_to_different_user`, `unable_to_link_account`, `access_denied` (Google's, when cancelled), `state_mismatch`, `invalid_code` and Better Auth's others (§12).
- **`POST /auth/delete-user`** — `{ password? }` (`DeleteAccountRequest`) → `{ success: true, message: "User deleted" }`, the session cookie cleared; deletes the account and everything it owns (§4 Accounts). Errors: 400 `INVALID_PASSWORD` (wrong password), `PASSWORD_REQUIRED` (an account with a password sent none), `SESSION_EXPIRED` (an account without a password whose sign-in is more than a day old), `CREDENTIAL_ACCOUNT_NOT_FOUND` (a password sent for an account without one); 401 without a session; 403 `INVALID_ORIGIN`; 429 after 5 attempts a minute.
- **Switched off** (`disabledPaths`, 404 with the body "Not Found"): `/is-username-available` (it would reveal usernames); `/get-access-token`, `/refresh-token` and `/account-info`, which hand out, refresh or use Google's tokens: none are kept (§4 Accounts), so they could only fail or ask Google. (Before M12.3b, `/get-access-token` handed a signed-in browser its stored Google access token, and `/account-info` read Google's profile from the stored id token.) Better Auth's other built-in endpoints are left as they are; without an email sender, `/request-password-reset` answers `RESET_PASSWORD_DISABLED`.

## 10. Screens

```
Home ─┬─► Import ─┬─► Review ──► Done ─► (Practice these now)
      │           ├─► PDF pages ──► (pages read like photos) ──► Review
      │           └─► Add words ──► Confirm word ──► (a list) Done
      ├─► Practice setup ──► Flashcards ──► Summary
      ├─► My words ──► Word detail ──► Edit word
      └─► Settings ─┬─► Account ──► (Sign out, Delete account) Sign in
                    │      └──► (Connect) Google ──► Account
                    └─► Imports ──► Import ──► Rename import

(signed out) Sign in ◄──► Create account ──► (signed in) the page in ?next=, or Home
(signed out) Sign in, Create account ──► (Continue with Google) Google ──► the page in ?next=, or Sign in with ?error=
```

**Signed in or not.** When the app starts it asks who is signed in (`GET /api/auth/get-session`, §9.4), and at the same time whether the server offers Google (`GET /api/sign-in-options`; if that fails, no Google), showing nothing until it knows; if it can't reach the server it says so with **Try again**. Signed out, only Sign in and Create account open: any other page goes to Sign in with itself kept in `?next=` (`/signin?next=%2Fwords%3Fstatus%3Dlearned`; Home needs none), and signing in or creating an account returns to it. `next` is followed only to a page of the app (a path starting with one `/`, not Sign in or Create account), otherwise Home. Signed in, Sign in and Create account go to `next` or Home. Any 401 from a route while using the app (the session expired, or was ended elsewhere) leads to Sign in the same way.

**Without AI** (`aiEnabled` false in the session, §4 Accounts) the screens leave the AI features out (`web/src/auth/aiFeatures.ts`):
- **New import** is Add words (screen 14): Home's New import opens it, and `/imports/new` and `/imports/new/pdf` go there (replacing the entry), so there is no photo drop zone and no PDF pages. Add words then says, as a muted line under its title, "Importing photos and PDF pages uses AI, which isn't included in your account.", and its back button goes Home. An import begun before AI was switched off can still be opened from its Home banner, reviewed and saved; its Import screen has no **Add more photos**.
- **Confirm word** has no **Ask AI**, neither on a chosen card nor in the hand form ("Fills in all four" goes with it).
- **Nothing offers Add details:** not Home, not Done (`detailsPending` is 0 anyway, §9). Done doesn't say "Example sentences and forms are ready.", and its second button is always **Type more words**. Saving says "Saving…" rather than "Adding details…" (Confirm word, Review). Cards and Word detail show no "Details pending" and no "Use Add details on Home"; a word's Example card appears only when its shared word has an example.
- Home's hint while the list is empty is "Type the words you studied to start your list."
- The Account screen says "Not included in your account" (screen 19).

Mobile-first layout, usable on desktop; light and dark follow the system. How screens look (colour, type, cards, buttons, headers, the sticky action bar, toasts) is the design system in `docs/design-system/`, starting from its `README.md`. This section says what each screen shows and does.

**Import labels.** Wherever a past import is listed (Practice setup, My words, Settings) it is shown by its name, or without one by the day it was completed ("13 Oct", with the year when it isn't this year). When several unnamed imports share a day, each of them also shows its time ("11 Oct, 14:32"). Dates and times are the phone's.

1. **Home** — top to bottom:
   - the title, the app's name (`APP_NAME` in `core/`; the working name is "Dingsda", `docs/plan.md` Part 2 context), with a round **Settings** button (a gear) at the right end of its line;
   - once there are learning or learned words, the **deck card**: how many words are not ignored ("149 words", large), the share of them learned as text ("12% learned", rounded down, so it says 100% only when every word is learned) and as a bar, and the Learning and Learned counts. (Ignored words are not counted here.);
   - only when there is unfinished work, as cards: a banner for each import not yet `done` that has at least one photo ("Continue importing Lesson 4" while collecting, "Finish reviewing Lesson 4" once reviewing; an unnamed import shows its date), and "N words without details yet" + **Add details** when enrichment is pending;
   - **Practice**, the main button (a big lime button with a play circle), once there are learning or learned words, with what it draws from on a second line ("136 words to practise"; "Review learned words" when every word is learned);
   - two tiles side by side: **My words** with the counts ("136 learning · 0 learned"); the whole tile opens the Learning tab of My words, and it is Home's only way there; and **New import** ("Add more words"), an outlined tile. While there are no words yet, New import is the main button instead (big and lime, a plus in the circle), with the hint "Photograph the pages you studied to collect their new words." below it, and the My words tile under that;
   - the credit in the footer: grammar data from Wiktionary (CC BY-SA), recordings from Wikimedia Commons.
2. **Import** — add photos (thumbnails, remove), optional name, per-photo state (preparing / reading / done with word count / failed + Retry / poor quality + Retake), **Review words** when at least one photo is done.
   - The title is the import's name, large ("New import" before the import exists, "Import" when it has no name). Before the first photo: the **Name (optional)** field and a large dashed drop zone, "Take or choose photos" over "Photograph the pages you studied", with a lime camera square, and under it two quiet links, **or choose PDF pages ›**, which opens PDF pages (screen 16), and **or type words ›**, which opens Add words (screen 14). Then the photos as tiles, two per row: the thumbnail (dimmed while it is read), a small round remove button (a cross) where removing is allowed, and its state with an icon: a check and "13 words" in the accent, a spinner and *Preparing* / *Reading*, "Couldn't read much from this page" in warning colour, the error in red, or "Waiting…"; **Retry** and **Retake** are full-width buttons under it. **Add more photos** is the grid's last cell, dashed like the drop zone. The number of words found so far is a pill after **Review words**; the hint under it ("Wait until every photo is read") stays.
   - The import is created when the first photo is sent, so leaving the screen early leaves nothing behind; the name is typed before that and can't be changed on this screen (it can on Done and in Settings). The URL moves from `/imports/new` to `/imports/:id` without losing the photos in memory.
   - **PDF pages** arrive here from screen 16 as tiles like photos, each labelled with its page ("p. 42", a small dark pill at the top left of the thumbnail); *Preparing* is the page being rendered. They have no **Retake** (a rendered page can't be photographed again); **Retry** renders and sends the page again. The title is the import's name ("Pages 42–45"), chosen on screen 16, so there is no name field, and there is no **Add more photos** cell: the import is the pages chosen, and more pages are another import. The texts say pages: "Wait until every page is read", "2 pages read earlier; their words are kept." The pages are handed over in memory, so after a reload a PDF import resumes like any other, with the pages read so far.
   - Photos are shrunk one at a time (phone memory) and sent at most two at a time. "Uploading" and "reading" are shown as one state, *Reading*: `fetch` reports no upload progress, and a shrunk photo is only ≈0.5 MB.
   - A photo can be removed before it is sent or after it failed; once read, its words stay in the import (they can be skipped in review). **Retry** appears only for failures worth retrying with the same photo (AI busy, invalid output, network, an unexpected server error); otherwise the message says what to do (e.g. "photograph it in two parts").
   - **Review words** is enabled only when nothing is still being prepared or read, because starting review closes the import to photos. Photos read in an earlier visit count (“2 photos read earlier; their words are kept”).
3. **Review** — §6.4. **Save N words** → "Adding details…" → **Done**: "17 words added" with **Practice these now** (starts an `import` session from this import, §8.1). With nothing set to Practice the button reads **Ignore all N words** ("Ignore 1 word" for one; **Finish** when there are no new words) and shows "Saving…".
   - Decisions are kept on the device (`localStorage`, per import) until saved, so a reload keeps them; another device starts from "all Add". Opening Review for an import that is still collecting starts the review.
   - Under the large title (the import's name, else "Review words"): "**9** new words · **8** to practise" with **Practice all** and **Ignore all** as pills at the right (on a phone-wide screen they wrap under the counts). "4 already in your words" is a quieter card that opens (its chevron turns) to list those headwords, articles in their gender colours. Every new word is a card, and the whole card is one Practice/Ignore toggle: the headword (article coloured) over "translation · part of speech", a "not in dictionary" pill under them when Wiktionary doesn't have the word, and the state at the right, a lime **Practice** pill with a check or a grey **Ignore** pill; an ignored card is dimmed and its headword struck through. An article mismatch is a warning-coloured strip across the card's bottom ("AI: der Sofa · Dictionary: das Sofa", a warning icon, one **Use das** button per dictionary article, filled in the warning colour); once applied the strip turns teal, "Dictionary article applied" with **Undo**. "Every word on these pages is already in your list." when there is nothing new.
   - Done offers **Practice these now** (when words were added), **Import more pages** (after PDF pages, `source = pdf`, it opens PDF pages, which suggests the pages after these; **Type more words** after a typed list, `source = typed`, which opens Add words) and **Home**. A reloaded Done screen no longer has the counts and just says "Import saved". On Home, **Practice** is the main button once there are words and **New import** the second (screen 1).
   - Done has no back button; "Done" is a small grey label at the top, and the result is the big text: a lime circle with a check inside two thin rings, "8 words added" (or "Import saved") large, then "1 ignored; they won't be suggested again." and, with a small sparkle in teal, "Example sentences and forms are ready." (when they are), or the "N words without details yet" card with **Add details**. In the action bar, one above the other: **Practice these now** (the big lime button, with a play triangle), **Import more pages** and a quiet grey **Home**.
   - **Nothing added:** when the save added no words, the big text is "No words added", with "Every word on these pages is already in your list." under it when the pages had no new words, or "N ignored; they won't be suggested again." when every new word was ignored. Such an import gets no entry among the past imports (§9.2), so Done offers neither **Practice these now** nor naming.
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
   - **Delete word** (soft red, with a bin icon), at the bottom of the screen, asks in place, not with a browser dialog (`ConfirmDelete`, shared with Delete account), in a red-tinted card with a bin icon, the question in bold over the rest, and **Keep** / **Delete** side by side: "Delete “der Tisch” from your words? Its progress and note are lost, and a later import may offer it again as a new word. To stop practising it for good, set its status to Ignored instead." After deleting, a toast "“der Tisch” deleted" and the list; Back must not lead to the deleted word. When the history is list → detail → edit, the app goes back two entries, to that list; otherwise the list replaces the edit screen.
   - A word that no longer exists says "This word is not in your list any more", as on Word detail.
10. **Settings** (`/settings`) — a menu: the round back button, the large title "Settings", then one card with a row per section: its name, a short status at the right in grey and a chevron; the whole row opens the section. Other sections (such as the daily goal, plan M17) will join this card. For now two rows:
    - **Account**, first, with the username (as typed) at the right, opens Account (screen 19);
    - **Imports**, with the number of past imports at the right ("5"; nothing while there are none), opens Imports.
11. **Imports** (`/settings/imports`) — the round back button (to Settings), the large title "Imports", and the past imports (`GET /imports`), newest first, as rows on the page like My words' rows, a hairline between them, each with a chevron: the label (import labels above) in bold, and under it in grey the day when the import has a name, and its words ("13 Oct · 9 words", "54 words"). The whole row opens the import. Without any: "Your imports will appear here."
12. **Import** (`/settings/imports/:id`) — the round back button (to Imports), the import's label as the large title, and one muted line under it: its words and the day it was added ("9 words · added 13 Oct"). Then a card of actions, for now one row: **Rename** with a chevron, which opens Rename import. Later actions on an import (deleting it, for example) join this card. The page finds the import among the past imports; one that isn't there (any more) says "This import is not in your list any more" with a link to Imports.
13. **Rename import** (`/settings/imports/:id/rename`) — like Edit word (screen 9): **Cancel** at the left of the header, "Rename" as the title, **Save** at the right, lime and enabled only when the trimmed text differs from the name. One card: the small uppercase label **Name**, the field with the current name (the day as placeholder; 16 px) and the help text "Leave empty to show the date instead." Enter saves; an emptied field clears the name. **Save** stores it, shows a toast "Renamed" and returns to the import's page, which shows the new title. **Cancel**, like the browser's Back, drops the typed text. Neither adds a history entry, as on Edit word: opened from the import's page they go back to it; opened directly, the import's page replaces this screen. If saving fails, a toast says so and the typed name stays. An import that is no longer listed says so, as on its page.

14. **Add words** (`/words/new`) — the round back button (to New import; Home without AI), the large title "Add words" (without AI, the muted line "Importing photos and PDF pages uses AI, which isn't included in your account." under it, `ui.lead`), and a segmented control **One word** / **A list**, like My words' tabs (the choice is in the URL, `?mode=list`).
    - **One word:** a field "German word" (placeholder "e.g. Regenschirm"; 17 px; `lang="de"`; the phone's autocorrect stays on; no automatic capital, since the lookup ignores case). From 2 letters, 200 ms after typing stops, **suggestions** appear under it (`GET /dictionary/suggest`) as rows like My words': the headword (the article in its gender's colour) over "glosses · part of speech" (the first two glosses, shortened, on one line), with an "In your words" pill when the word is in the list. Tapping one opens Confirm word for its lemma with that entry chosen; **Continue** in the action bar, or Enter, opens it for the typed text. After a word is added this screen comes back with an empty field and a line, a card with a check, "der Regenschirm added" (several: "der See and die See added"), each word a link to its Word detail (whose Back returns here); when the word turned out to be in the list already (added meanwhile), "Already in your list.". The line is shown only right after the save: it goes as soon as the learner types or switches to **A list**, and whenever they leave Add words (Back, Home, the browser's Back, or a tap on a word in it), so coming back, also from that Word detail, shows none; a reload may drop it too.
    - **A list:** a text box under the label "One word per line", with the number of words under it ("5 words", "No words yet"; blank lines and repeats, ignoring case, don't count). A line is trimmed, its inner spaces made single, a pasted bullet or number ("- ", "• ", "1. ", "2) ") dropped, and cut at 50 characters (the most the lookup takes). Beyond 30, **Continue** is disabled and the line says "At most 30 words at a time" in the danger colour. **Continue** opens Confirm word at the first word.
    - The typed text and list stay in the tab while the learner goes back and forth.
15. **Confirm word** (`/words/new/confirm`) — one typed text at a time (§6.7). The header has the round back button (to the previous word; from the first, to Add words) and "Confirm word" as the small title, or for a list "Confirm words" with "**2** / 5" at its right over a thin progress bar, as on Flashcards (StepProgress). Then:
    - "You typed *regenschrim*" in grey, and the lookup's entries as cards, each a toggle like a Review card: the headword (article coloured), "noun · pl. die Regenschirme" or "verb · ging · ist gegangen", and the glosses as Wiktionary writes them, one per line; a chosen card has a 2 px `accent-ink` edge (lime in dark) and a lime check where an unchosen one has an empty ring. "*ging* is a form of **gehen**" heads a base word's cards, "Did you mean…?" the similar words. When exactly one card comes from an exact match or a form, it starts chosen. A card already in the list is dimmed, with "In your words ›" linking to that word instead of the ring. At most 5 words can be chosen for one text.
    - A chosen card opens a **Translation** field inside it (the small uppercase label, the field sunk into the card), filled with its first shortened gloss; the glosses, shortened, as chips under the field fill it when tapped (the one in the field is marked), and an **Ask AI** pill (a sparkle) asks Call 3 for a short translation, with a spinner while it runs.
    - Last, a quieter card **Not in the dictionary?** (a chevron that turns) opens the hand form: German word (the typed text), part of speech (a native select, "noun" already chosen for a capitalised text, "Choose…" otherwise), article (der / die / das as pills in their gender colours, optional, for plural-only nouns; nouns only), translation, and **Ask AI** ("Fills in all four"), which fills all four from the German word field. When the AI's word is in the dictionary, its cards appear first under "The AI suggests **der Regenschirm**" with a sparkle (and aren't repeated below): only the entries with the AI's part of speech and, for a noun, its article (for *ging* → *gehen* the verb, not *das Gehen*), the first not in the list chosen with the AI's translation, and the hand form closes. When no entry has them, the AI's word fills the hand form, as for a word the dictionary doesn't have. When the lookup found nothing at all, the form is open from the start, titled "Not in the dictionary". The hand form counts as one more word only when it is complete (German word, part of speech and translation; the article is optional) and open: an open but empty or half-filled form isn't counted, doesn't change Add's label and never blocks **Add**; closing it leaves it out. A complete form counts toward the 5 words: next to 4 chosen cards no fifth card can be chosen, and completed next to 5, **Add** waits until a card is unchosen.
    - The action bar: **Add** (lime; "Add 2 words" when two would be saved, the chosen cards plus a complete hand form; enabled when at least one word, and at most 5, would be saved and every chosen card has a translation; disabled when nothing would be saved) and, in a list, **Remove** to its left (a third of the width, as tall as Add). In a list both go on to the next word; after the last, the list is saved ("Adding details…") and Done opens (screen 3), or, when nothing was added (also when every word was removed: then nothing is sent), Add words with "No words added." One word is saved at once ("Adding details…") and Add words comes back (screen 14). A lookup that fails shows its message with **Try again**.

16. **PDF pages** (`/imports/new/pdf`) — the round back button (to New import), the large title "PDF pages", then:
    - **The book:** when one is remembered, a card with a document icon in a grey well, its file name (at most two lines, then an ellipsis) and under it the page count ("Menschen A1.pdf" over "180 pages"), and under the card a quiet **Choose another PDF**; otherwise a dashed drop zone like Import's, "Choose a PDF" over "From Files or iCloud", with a lime document square (`<input type="file" accept="application/pdf">`). While the file opens, the card shows a spinner, "Opening…" and the file name. A file that can't be opened leaves the book as it was, with the reason in red under it: "Couldn't open this PDF", "This PDF is password-protected" or "Couldn't start the PDF reader".
    - **Pages:** two number fields side by side, **From** and **To** (`inputmode="numeric"`, 16 px or more), filled with the pages after the last import from this book, or 1–1 for a new book; under them "4 pages" or, in red, the reason **Import pages** is off ("At most 10 pages at a time", "The book has 180 pages", "From must not be after To", "Enter the first and the last page"; with page labels, "The book has no page 300"). The numbers are the book's own (page labels) when the PDF has them; when it has none, a muted line under them says "Page numbers of the PDF file, not the printed ones".
    - **Preview:** small thumbnails of the chosen pages in a row that scrolls sideways to the screen's edges, each with its number under it, so the learner sees they picked the right pages. They are drawn one at a time, 400 ms after the fields stop changing; until then each is a shimmering placeholder (a plain one if the page can't be drawn). A page no longer chosen stops being drawn (pdf.js `RenderTask.cancel()`), pages drawn earlier come back at once, and nothing on the screen waits for them.
    - **Name (optional)**, its placeholder the automatic name ("Pages 42–45").
    - **Import pages** in the action bar (the big lime button; "Import 4 pages", "Import 1 page") opens the Import screen (screen 2) with the pages as tiles; from there it is the photo flow.

17. **Sign in** (`/signin`)
    - **Layout:** no back button, and the large title "Sign in". One card (a form card, `FormCard`) with **Email or username** (`autocomplete="username"`, no automatic capital, no autocorrect) and **Password** (`type="password"`, `autocomplete="current-password"`), each a small uppercase label over a field sunk into the card (17 px). **Sign in** in the action bar (lime; grey while a field is empty; "Signing in…" with a spinner while it runs); Enter signs in too.
    - **The one field:** with an `@` it is an email (`POST /api/auth/sign-in/email`), otherwise a username (`POST /api/auth/sign-in/username`).
    - **Under the card:** the error, in red, then **Continue with Google** (where Google is offered, below), then the quiet link **Create an account ›** (keeping `?next=`).
    - **Right after Delete account:** a card above the form, with a check in `accent-ink`, "Your account was deleted." It lives only in the app's memory, so a reload or the next sign-in forgets it.
    - **Errors:** "Wrong email, username or password" (a wrong password, an unknown name, or one that can't be anyone's), "Too many attempts. Try again in a minute." (429), and otherwise the API client's message ("Can't reach the server").
    - **Continue with Google** (`GoogleButton`, design system): an outlined button in Google's own colours with its standard "G", 48 px, full width. Shown only where Google can work: the server has the Google pair (`GET /api/sign-in-options`, asked with the session when the app starts) and the page is on https or `localhost` (§4 Accounts); not on the iPhone over the LAN. It asks for Google's address (`POST /api/auth/sign-in/social`, `callbackURL` the page in `?next=` or Home, `errorCallbackURL` Sign in keeping `next`) and opens it; while it asks, it fades and the Sign in button waits (and the other way round). If the address can't be had, the reason shows under the card ("Too many attempts. Try again in a minute." or the API client's message).
    - **Back from Google without signing in** (`?error=<code>`, read when the screen opens and then taken out of the address, keeping `next`), in red under the card: "This app is invite-only. Ask for an invite first." (`not_invited`), "That Google account isn't connected to an account here. Sign in with your password, then connect Google in Settings." (`account_not_linked`), "Google sign-in was cancelled." (`access_denied`), and otherwise "Couldn't sign in with Google. Try again.". Signing in with the password clears it.
    - Signing in returns to the page kept in `?next=` (see Signed in or not, above).
18. **Create account** (`/signup`)
    - **Layout:** the round back button (to Sign in, keeping `?next=`), the large title "Create account", and, only while sign-up is invite-only (`signUp: "invite"` from `GET /api/sign-in-options`; not in open mode, nor when that request failed; §4 Accounts), a muted line "Invite only: use the email your invite was sent to." Without it the form card starts right under the title, as on Sign in. One form card with **Email** (`type="email"`, `autocomplete="email"`), **Username** (the note "3–30 letters, digits, . or _"; no automatic capital, no autocorrect) and **Password** (the note "At least 8 characters", `autocomplete="new-password"`). **Create account** in the action bar ("Creating account…" while it runs).
    - **The field rules** are checked before anything is sent: an empty email "Enter your email address", a broken one "Enter a valid email address", a username outside the rule and a password shorter than 8 characters (or longer than 128, "At most 128 characters") show the rule in red under the field, which gets a red border; the first such field gets the focus. Typing in a field clears its error. Spaces around the email and the username are trimmed.
    - **Errors from the server:** under their field, "This username is taken" and "An account with this email exists. Sign in instead."; under the card, "This app is invite-only. Ask for an invite first." (403 `not_invited`, invite mode only), "Too many attempts. Try again in a minute.", or the API client's message.
    - The new account is signed in at once and lands on `?next=` or Home (an empty word list).
    - **Continue with Google** under the card, as on Sign in (same rule for where it is shown); an email not on the list comes back to Sign in with its error, and an invited one lands on `?next=` or Home with its new account (its username made from the email, §4 Accounts).
19. **Account** (`/settings/account`)
    - **Header:** the round back button (to Settings) and the large title "Account".
    - **Cards:** the username (as typed) large (28 px, the display font), with the email under it in grey; **Sign-in methods** (the small uppercase label) with a row each, from `GET /api/auth/list-accounts`: **Password**, with a check, shown when the account has one; **Google** under it (`googleRow` in `web/src/auth/google.ts`), in one of three states:
      - **Connected, with Disconnect:** the account has Google and a password. "Connected" in grey with the check, then a small secondary **Disconnect** button, wherever it is viewed (it doesn't go to Google, so also over the LAN). No confirmation: it can be undone with Connect. While it runs the button reads "Disconnecting…" with a spinner and "Connected" is hidden (it is no longer sure, and the row needs the room); everything else on the screen waits. Done, the row becomes **Connect** where Google is offered and goes where it isn't, and a grey line under the rows says "Google disconnected." For an account with a verified email (the developer's), which its next Google sign-in connects again (§4 Accounts), it says "Google disconnected. Continue with Google still signs in to this account and connects it again." A failure shows in red under the rows and Google stays connected (§12): "Your last sign-in was more than a day ago. Sign out and in again, then disconnect Google." (`SESSION_NOT_FRESH`), "Google was already disconnected." (the rows are read again), "Google is your only way to sign in, so it can't be disconnected.", "Too many attempts. Try again in a minute.", "Can't reach the server", otherwise "Couldn't disconnect Google. Try again."
      - **Connected only:** Google is the account's only way to sign in. "Connected" in grey with the check, and a grey line under the rows: "Google is your only way to sign in, so it can't be disconnected."
      - **Connect:** the account has no Google: a small secondary **Connect** button where Google can be offered (as on Sign in), and no row where it can't (nor while the methods load). **Connect** ("Connecting…" with a spinner while it asks) opens Google (`POST /api/auth/link-social`) and comes back to Account, which then shows "Connected"; a failure comes back with `?error=` and shows in red under the rows (§12): "That Google account has another email. Connect the Google account of <the account's email>.", "That Google account is already connected to another account here.", "Google sign-in was cancelled.", otherwise "Couldn't connect Google. Try again."

      Then **AI features**: "Included: photo and PDF import, Ask AI, example sentences" with AI on, otherwise "Not included in your account" in grey.
    - **Sign out:** a large secondary button under the cards ("Signing out…"); it ends this sign-in only and goes to Sign in, without `next`. If it fails, a toast says so.
    - **Delete account,** at the bottom of the screen: soft red with a bin, asking in place like Delete word (the shared `ConfirmDelete`, screen 9): the bold question "Delete your account and all its words, imports and practice history?" over "This can't be undone.", then, for an account with a password, a **Password** field (the small uppercase label over the field sunk into the card, `autocomplete="current-password"`), and **Keep** / **Delete** side by side. **Delete** waits until a password is typed; Enter deletes too. A failure shows in red under the field, which gets a red border: "Wrong password", "Enter your password", "Too many attempts. Try again in a minute.", or the API client's message; typing clears it. **Keep** closes it and forgets the password. An account without a password (Google only) deletes at once; when its sign-in is more than a day old it reads "Your last sign-in was more than a day ago. Sign in with Google again, then delete the account." over a **Sign in with Google** button (`GoogleButton`), which signs in again with the account's Google account preselected (`loginHint`) and comes back to Account, where Delete account then works; where Google isn't offered it reads "Sign out and in again, then delete the account." as before. Once deleted, the app is signed out and shows Sign in with "Your account was deleted." (screen 17), without `next`. If the sign-in methods can't be loaded, the field is shown (every account but a Google-only one has a password).

## 11. AI calls

### 11.1 Common settings
- **SDK:** `@anthropic-ai/sdk`, beta client (`client.beta.messages.create`, needed for `fallbacks`). Structured outputs: the Zod schemas from `core/` are converted to JSON Schema with the SDK's `betaZodOutputFormat` and sent as `output_config.format`; responses are parsed by our own code, not `messages.parse()`. The SDK turns enum values into schema descriptions rather than hard constraints, so every response is validated again with Zod before use. `thinking` is never sent (Opus 5.5 always thinks adaptively; disabling it is a 400).
- **Model:** `claude-haiku-5-5` by default, on the Mac and in production (the user, 2026-10-25: about 20 times cheaper per page than Opus 5.5, §11.4), configured separately per call (`AI_MODEL_EXTRACT`, `AI_MODEL_ENRICH`, `AI_MODEL_DESCRIBE`).
- **Effort:** `medium` (`AI_EFFORT`), set explicitly on every call.
- **Refusal fallback:** server-side fallback enabled (`fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta) for models that support it (Opus 5.5, Opus 5, Fable 5.1, Sonnet 5.5). Haiku 5.5 has no server-side fallback and must not be sent the parameter, so a Haiku refusal is final. `stop_reason` is checked before reading content.
- **`max_tokens`:** 16000.
- **Retries:** SDK default (2) for 408 / 409 / 429 / 5xx / connection errors; never a 400 or 402, so the used-up credit (§12) is tried once.
- **Used-up credit:** the API answers either 400 `invalid_request_error` with "Your credit balance is too low…", or 402 `billing_error` (reports differ, §16). Both become `AiError("unavailable")`, recorded in `ai_usage` like any failed attempt (`ok` false, no tokens), and the route answers 503 `ai_unavailable` (§12). The 400 has no type of its own, so only its message tells it from a bad request (`creditUsedUp` in `ai/claude.ts`).
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

Error kinds differ: Sonnet's mistakes are mostly extra words the learner can skip, while Haiku's split separable verbs produce a wrong lemma. Since 2026-10-25, Haiku 5.5 at `medium` is the default everywhere (the code, `.env.example`, production); Opus 5.5 stays a setting for comparisons.

### 11.5 Daily limit
`DAILY_PHOTO_LIMIT` (default 50) extract calls per user per day, counted from `ai_usage` and checked before each upload. Every extract attempt counts, including failed ones and the retry after invalid output. Beyond it, photo upload returns an error: "Daily page limit reached" (a PDF page counts like a photo, §6.8).

`DAILY_DESCRIBE_LIMIT` (default 200) Call 3 calls (**Ask AI**, §11.6) per user per day, counted the same way. Beyond it **Ask AI** answers "Daily AI limit reached"; the glosses and typing still work. It is a safety net, not a budget: pricing the AI features comes later (plan, Later: AI for subscribers).

**The day** starts at midnight in `APP_TIME_ZONE` (default `Europe/Berlin`, an IANA zone checked at startup), not in the server's own zone: Vercel runs in UTC and `TZ` can't be set there (§18). `startOfDay(now, zone)` in `ai/usage.ts` works it out with `Intl`, summer time included (midnight in Berlin is 22:00 UTC in summer, 23:00 in winter), so a call at 23:30 and one at 00:30 Berlin time fall on different days whatever zone the process runs in. The routes read the clock through `AppDeps.now`, which tests set. Only accounts with AI reach these calls at all (§4 Accounts).

### 11.6 Call 3 — Describe
**Ask AI** on Confirm word (§6.7, §10 screen 15). Model `AI_MODEL_DESCRIBE`; the other settings as in §11.1.

**Input:** `{ text, entry? }`: the typed text and, when a dictionary entry's translation is asked for, `entry: { lemma, pos, article, glosses }`.

**Output schema:**
```json
{ "german": true, "lemma": "Regenschirm", "pos": "noun", "article": "der", "translation": "umbrella" }
```

**Prompt rules:**
- With `entry`: translate that word in the sense its glosses describe; `lemma`, `pos` and `article` repeat the entry's.
- Without: the German word the learner most likely meant, in base form as in Call 1 (infinitive, nominative singular, uninflected adjective), correcting misspellings (*Regenschrim* → *Regenschirm*) and inflected forms (*ging* → *gehen*); an article only for a noun.
- `translation` is a short English equivalent (one to four words; verbs as "to go"), as in Call 1.
- `german: false` when the text isn't a German word (English, nonsense); the other fields are then ignored.

Recorded fixtures: an entry's translation (*die Bank*, "bank (financial institution)" → "bank"), a misspelt noun (*Regenschrim* → der Regenschirm "umbrella"), an inflected verb (*ging* → gehen "to go"), an English word (*umbrella* → `german: false`).

**Measured (2026-10-17, Haiku 5.5 `medium`):** ≈1,050 input and ≈40 output tokens (210 when the AI explains a non-German text in its guess), 0.9–2.4 s, ≈0.01¢ per call. On Opus 5.5 the same is ≈0.5¢, so the 200-a-day limit is ≈2¢ a day on Haiku and ≈$1 on Opus.

## 12. Errors

### Import
| Problem | Behaviour |
|---|---|
| File the browser cannot decode | Error on that photo only: "Couldn't open this image" |
| `pageQuality = poor` | Photo marked poor: "Couldn't read much from this page" + **Retake**; its words are still added to candidates |
| One photo fails | Other photos continue; failed photo shows **Retry** |
| Claude 429 / 5xx / unreachable after SDK retries | "AI is busy, try again" + **Retry** |
| The Anthropic credit is used up (400 "credit balance is too low", or 402 `billing_error`) | Tried once, recorded in `ai_usage`; "AI is unavailable right now" + **Retry** (it works again once the credit is topped up) |
| An account without AI sends a photo (an import begun before AI was switched off) | 403 `ai_not_enabled`, "AI isn't included in your account", no **Retry**; the screen offers no **Add more photos** for it |
| Other Claude API errors (bad request, invalid API key; not the used-up credit, below) | Not retried; surfaces as an unexpected server error |
| `stop_reason = refusal` (after fallback) | Treated as a failed photo |
| Output fails Zod validation | One automatic retry, then failed photo |
| `stop_reason = max_tokens` (or `model_context_window_exceeded`) | Failed photo: "Page too long — photograph it in two parts" |
| Enrichment fails | Words stay saved; cards show "Details pending"; Done screen and Home show "N words without details" + **Add details** (`/words/enrich-pending`) |
| Learner leaves during review | Import stays `reviewing`; Home shows a banner to finish it |
| Same word saved twice concurrently | Unique constraints + upsert; no duplicates |
| Daily limit reached | Upload refused with a clear message |
| A chosen file isn't a PDF, or pdf.js can't open it | On PDF pages: "Couldn't open this PDF"; the remembered book is not replaced |
| pdf.js's worker doesn't start | "Couldn't start the PDF reader"; pdf.js is not left to run on the page instead. The remembered book is kept (the file is fine), and the next visit tries again |
| The PDF is password-protected | "This PDF is password-protected"; nothing is remembered |
| The remembered book can't be read any more (storage cleared or broken) | It is forgotten; PDF pages asks for a PDF again |
| A page fails to render | That tile fails, "Couldn't render this page", with **Retry** (renders again); the other pages continue. A thumbnail that can't be drawn stays a plain placeholder |
| The browser can't store the book | The import works; the book just isn't remembered |
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

### Adding words
| Problem | Behaviour |
|---|---|
| Suggestions can't be loaded | None appear; **Continue** still works |
| The lookup fails | Inline message with **Try again** |
| Ask AI fails (busy, credit used up, refused, invalid output, limit, not German) | Toast with the reason; the fields keep their text. The messages are Ask AI's own, not the photo ones: "AI is busy, try again", "AI is unavailable right now", "The AI declined to answer for this word", "The AI's answer was unusable, try again", "Daily AI limit reached", "That doesn't look like a German word" |
| Enrichment fails because the credit is used up | As any failed enrichment (§12 Import): the words are saved and wait for their details |
| Saving fails | Toast; the typed words and decisions stay in the tab, and **Add** can be tried again |
| A chosen word is already in the list (added meanwhile) | Not added twice; counted in `alreadyInList` |
| The dictionary isn't loaded | Every word is "Not in the dictionary"; the hand form and Ask AI still work |

### Signing in
| Problem | Behaviour |
|---|---|
| A page opened signed out, or a route answers 401 (session expired or ended elsewhere) | Sign in, with the page kept in `?next=` (§10) |
| Asking who is signed in fails when the app starts | "Can't reach the server" with **Try again**; nothing else loads |
| Wrong password, unknown email or username | "Wrong email, username or password", the same for both |
| 6th sign-in or sign-up attempt within a minute from one device | 429: "Too many attempts. Try again in a minute." |
| Sign-up with an email not on the invite list (`SIGNUP_MODE=invite`; open mode creates the account) | 403 `not_invited`: "This app is invite-only. Ask for an invite first."; no account |
| Sign-up with a taken username or email | Under the field: "This username is taken", "An account with this email exists. Sign in instead." |
| A POST to `/api/auth/*` from an address that isn't trusted | 403 `INVALID_ORIGIN`; nothing changes |
| Sign out fails | Toast; still signed in |
| Delete account with a wrong password | 400 `INVALID_PASSWORD`: "Wrong password" under the field; nothing is deleted |
| Delete account without the password of an account that has one | 400 `PASSWORD_REQUIRED` (the screen doesn't send it so): "Enter your password" |
| Delete account of an account without a password whose sign-in is more than a day old | 400 `SESSION_EXPIRED`: "Your last sign-in was more than a day ago. Sign in with Google again, then delete the account." with **Sign in with Google**, back to Account; where Google isn't offered, "Sign out and in again, then delete the account." |
| Delete account fails otherwise (network, 429) | The message in place; still signed in, nothing deleted |
| A first Google sign-in with an email not on the invite list (`SIGNUP_MODE=invite`; open mode creates the account) | Back to Sign in with `?error=not_invited`: "This app is invite-only. Ask for an invite first."; no account |
| A Google sign-in for an existing account with that email that hasn't connected Google (its email not verified) | Back to Sign in with `?error=account_not_linked`: "That Google account isn't connected to an account here. Sign in with your password, then connect Google in Settings."; not signed in, nothing linked |
| Cancelled on Google's page | Back with `?error=access_denied`: "Google sign-in was cancelled." (on Sign in or Account) |
| Google comes back with another error (a state over 10 minutes old or from another browser, a code Google refuses) | Sign in: "Couldn't sign in with Google. Try again."; Account: "Couldn't connect Google. Try again." |
| Connect with a Google account of another email | Back to Account with `?error=email_does_not_match`: "That Google account has another email. Connect the Google account of <email>."; nothing linked |
| Connect with a Google account that belongs to another account here | Back to Account with `?error=account_already_linked_to_different_user`: "That Google account is already connected to another account here." |
| Google's address can't be had (no answer, 11th try within a minute) | Under the card on Sign in and Create account, under Sign-in methods on Account (a toast for Sign in with Google before deleting): the API client's message, or "Too many attempts. Try again in a minute." |
| The server has no Google pair, or the app is opened over plain HTTP elsewhere than `localhost` (the iPhone over the LAN) | No Google button and no Connect; an account's connected Google still shows, with Disconnect when it has a password (§4 Accounts) |
| Disconnect with a sign-in more than a day old | 403 `SESSION_NOT_FRESH`: "Your last sign-in was more than a day ago. Sign out and in again, then disconnect Google." in red under the rows; Google stays connected |
| Disconnect of Google that is already gone (disconnected on another device) | 400 `ACCOUNT_NOT_FOUND`: "Google was already disconnected."; Account reads the sign-in methods again |
| Disconnect of an account's only way to sign in (its password removed elsewhere meanwhile; the screen doesn't offer it otherwise) | 400 `FAILED_TO_UNLINK_LAST_ACCOUNT`: "Google is your only way to sign in, so it can't be disconnected."; nothing removed |
| Removing the password through the API (no screen offers it) | 400 `CANNOT_UNLINK_PASSWORD`; nothing removed |
| Disconnect fails otherwise (no answer, 429, a server error) | "Can't reach the server", "Too many attempts. Try again in a minute.", otherwise "Couldn't disconnect Google. Try again."; Google stays connected |

### Error codes
| HTTP | `code` | When |
|---|---|---|
| 401 | `unauthorized` | A route without a valid session ("Sign in to continue"); the web app goes to Sign in |
| 400 | `invalid_request` | Body, query or parameters fail validation, no photo was sent, or two save decisions for one key. Fastify's own client errors (malformed JSON, wrong content type) keep their 4xx status |
| 400 | `invalid_image` | The upload is not a JPEG |
| 400 | `unknown_candidate`, `invalid_article` | Save decisions don't fit the import (§6.5) |
| 400 | `no_words` | Practice source without words |
| 404 | `import_not_found`, `session_not_found`, `word_not_found`, `entry_not_found`, `not_found` | Unknown id, or one of another learner; `not_found`: no such route |
| 409 | `import_closed` | Photo for an import that is no longer collecting; review or save of an import that is done |
| 413 | `file_too_large` | Photo over 10 MB |
| 422 | `ai_refused`, `ai_invalid_output`, `page_too_long` | The photo failed (§12 Import), or Ask AI did (§12 Adding words) |
| 422 | `not_german` | Ask AI: the typed text isn't a German word (§11.6) |
| 429 | `daily_limit` | §11.5 |
| 403 | `ai_not_enabled` | An AI route for an account without AI: "AI isn't included in your account" (§4 Accounts, §9) |
| 503 | `ai_busy` | Claude rate-limited, overloaded or unreachable after the SDK's retries |
| 503 | `ai_unavailable` | The Anthropic credit is used up: "AI is unavailable right now" (§11.1) |
| 500 | `internal` | Anything unexpected; the message includes the request id |

Better Auth's endpoints (`/api/auth/*`) answer with their own body, `{ code, message }`, and their own codes (§9.4): 400/422 for the sign-up rules, 400 `INVALID_PASSWORD`, `PASSWORD_REQUIRED` and `SESSION_EXPIRED` for deleting an account, 400 `FAILED_TO_UNLINK_LAST_ACCOUNT`, `CANNOT_UNLINK_PASSWORD` and `ACCOUNT_NOT_FOUND` and 403 `SESSION_NOT_FRESH` for Disconnect, 401 `INVALID_EMAIL_OR_PASSWORD` / `INVALID_USERNAME_OR_PASSWORD`, 403 `not_invited` and `INVALID_ORIGIN`, 404 `PROVIDER_NOT_FOUND` (Google without the Google pair), 404 with the text "Not Found" for a switched-off endpoint, and 429 from the rate limiter with only a message. Google's return isn't an answer to the app but a redirect, so its errors arrive in the address, `?error=<code>` (`not_invited`, `account_not_linked`, `email_does_not_match`, `account_already_linked_to_different_user`, `access_denied` …, §9.4), and the screen it lands on says them.

### General
Every error response has the body `{ "error": { "code": "...", "message": "..." } }` (`ApiError` in `core/`), except Better Auth's (above). An unexpected server error answers 500 `internal` with "Something went wrong (request <id>)"; the details stay in the server log under that request id. On Vercel the id is Vercel's own (`x-vercel-id`, such as `fra1::iad1::q8x2k-1792998000000-0f3c2a7b9e1d`), which finds the request in Vercel's logs; on the Mac, Fastify's (`req-1`, `req-2`…, §18.2). The API client turns every failed call into an `ApiClientError` with the server's code (ours, or Better Auth's `code` from `{ code, message }`), or `unauthorized` (a 401 without a code), `too_many_requests` (a 429 without one, as the rate limiter sends), `network` (no response), `http_error` (another error without such a body) or `invalid_response` (a body that fails its schema). The web app shows the message in a toast, or inline with **Try again** where the screen has nothing else to show.

## 13. Testing

| Layer | What | How | Cost |
|---|---|---|---|
| Unit | Learning rules, card formatting, API client, candidate merging, dictionary match logic, swipe thresholds, result queue, audio player (fake `<audio>` elements), photo / review / word-form helpers, the bold word in an example sentence, Word detail's labels, Edit word's and Rename import's history steps, import labels and finding an import among the past imports, My words' day headings, a typed list's lines, shortened glosses, Confirm word's steps, PDF page ranges and labels, the automatic name, the page suggested next, PDF tiles in the photo queue, the thumbnail queue, the remembered book (a fake IndexedDB), the auth calls and their schemas (ids as strings, Better Auth's error body, 401 and 429 codes), Sign in's email-or-username choice, `?next=` (and that it never leaves the app), Create account's field rules, the wording for each sign-in and sign-up error; the delete-account and sign-in-methods calls; the screens without AI (where New import leads, Add words' note and back button, Add details, Done's lines and second button, the saving label, the Account card's two states), which photo errors offer **Retry**, the delete confirmation (when it asks for the password, the wording of each failure); Google: the sign-in/social, link-social and sign-in-options calls and their schemas (only Google, only paths of the app; the sign-up mode `invite` or `open` and nothing else, an answer without it refused, M12.7), Create account's invite line (in invite mode only: not in open mode, nor when the options request fails, which also means no Google), where Google is offered (https, `localhost`, not the LAN, not without the pair), where it returns to (`next` kept, never another site), the wording of each `?error=` on Sign in and Account, Account's Google row (Connected with Disconnect, Connected only with its note, Connect, none; what it becomes after Disconnect), Sign in with Google before deleting; Disconnect: the unlink-account call and its schema (the method's id, not a provider), Better Auth's refusals as `ApiClientError`s, `emailVerified` in the session, the id it sends, its busy label, what it says when done (verified email or not) and the wording of each failure | Vitest in `core/`, `server/` and `web/` | Free |
| Server | Import flow (extract → merge → compare → dictionary → save → enrich), an import's source (photos or PDF pages), ignored words never re-offered, session selection and order per source, result recording, word list search / import filter / sort / edit / delete, past imports and renaming, the migration that turns `last_import` sessions into `import` ones, dictionary search (suggestions, lookup, forms, similar words), typed words (one word, a list as an import, facts from the chosen entry, a custom translation on a reused word), Call 3 and its limit, daily limit, error paths (429, refusal, invalid output, max_tokens, JSON 500); accounts: Better Auth's schema check on our tables, the accounts migration on a database of its own (user 1's data untouched, the cascades), sign-up (invites, `SIGNUP_MODE=open` with AI off and the invite list untouched, the username and password rules, taken names), `/api/sign-in-options` answering `signUp` with `google` for each mode and both Google settings, signed out (`invite` by default), sign-in by email and username in any case, sign-out, trusted origins, the rate limits per address, every route but `/api/health` and `/api/auth/*` answering 401 without a session (one test over all the app's routes), the AI calls in the session's language, `user:claim` and the invite list; the AI switch (every AI route 403 without AI and unchanged with it, the switch counting from the next request, typed words and a save without an AI call), deleting an account (every cascaded table emptied, an unlinked invite and a Connect under way removed, shared words, the dictionary and user 1 untouched, a wrong or missing password, a Google-only account's day-old sign-in), `user:set-password` and `user:ai`, `user:list` (every account, user 1 without an email, the sign-in methods, AI and words, last active from the newest sign-in and moved by get-session past a day but not by other requests, `—` without one, the aligned lines and times in `APP_TIME_ZONE` across the clock change, the total; as the script, no password hash or token in its output and nothing written) and `user:delete` (the confirmation's rule; everything the account owns gone, an unlinked invite and a Connect under way too, shared words, the dictionary and other accounts untouched; user 1 deleted once claimed; one transaction, shown by a trigger failing the `users` row's delete after the invite's; an account already gone; the same rows from every table as Delete account; every table referencing `users` cascading; as the script, a refused, empty or missing answer, an unknown account and a flag deleting nothing, exit code 1, and the confirmed delete printing what went), Google sign-in (Google's address: client, return address following the host, state, basic scopes, PKCE, the account chooser; the code exchanged at the token endpoint, the only request sent out; an invited email's new account, verified, AI off, its username from the email and made unique, its invite used; an email not on the list refused with `not_invited` and no row, `next` kept; `SIGNUP_MODE=open` (signed in, verified, AI off, the invite list untouched); cancelled; signing in again without the invite; a password account's `account_not_linked`; the developer account's verified email linked; Connect with no invite check, another email refused, a Google account of another account refused; a Google-only account deleting after signing in with Google again; 10 a minute), the username rules for Google sign-ups, Google's tokens not kept (none stored after a Google sign-up, a second sign-in, Connect, Connect again and the implicit link, with Google handing out a refresh token too; old ones cleared by the next sign-in; signing in still works; the password row untouched; no account cookie; `get-access-token`, `refresh-token`, `account-info` and `is-username-available` 404), the migration that clears them (only the token columns of non-password rows; running again or on an empty table changes nothing), Disconnect (a password account loses its Google row and keeps its session and password; a Google-only account refused; the password refused; another account's method; without a session 401; a day-old sign-in 403 and then a fresh one works; an untrusted origin; afterwards Continue with Google links a verified email again and answers `account_not_linked` for an unverified one, and Connect works again), the used-up credit in both forms (through the real SDK and a fake `fetch`: one request, 503 `ai_unavailable`, an `ai_usage` row), the daily limits' day in `APP_TIME_ZONE` with the process in UTC (23:30 and 00:30 Berlin time, the days the clocks change); a browser's sign-in by email, by username or a sign-up from another site refused without a cookie too (and a cross-site navigation), a script without an origin let through; production (M12.4): with `BETTER_AUTH_URL` the cookie `__Secure-better-auth.session_token` with `Secure`, `HttpOnly`, `SameSite=Lax` and the Mac's cookie name meaning nothing, the one trusted origin (the Mac's, the LAN's, plain http, a deployment's own address and another site refused, by email and by username), Google returning to production's callback whatever the host, the rate limits per `x-vercel-forwarded-for` (the stored key, a client's own `x-forwarded-for` not helping), the Mac ignoring that header, a non-https address refused; the request id (Vercel's `x-vercel-id` in a 500's message, Fastify's own without it or for a header that can't be one); the shared setup (the pool per platform, `attachDatabasePool` on Vercel only, the pool closed with the app, Vercel without `BETTER_AUTH_URL` and the Mac with it refused); `BETTER_AUTH_URL` and Vercel's required variables in the config | Vitest + real PostgreSQL test database (Docker), the AI transport replaying **recorded real Claude responses** (fixtures; enrichment tests vary one recorded response). The route tests run as signed-in user 1, with AI on: the test app's `inject` gives each request a real session row and a signed cookie (`buildTestApp`, `learner: null` for signed out, `now` and `timeZone` for the daily limits). Rate limits are off except in their own tests. Google's side is played by the test: its token endpoint is answered by a fake `fetch` (`vi.stubGlobal`) with an id token for the test's Google account, and any other address throws, so nothing leaves the machine (`test/helpers/google.ts`) | Free |
| Dictionary import | Mapping from kaikki JSONL to `dictionary_entries` and `dictionary_forms`, including the choice of IPA and recording; the pronunciation backfill | Vitest on a small sample file with expected rows | Free |
| Vercel build (M12.4) | Unit, in `pnpm test`: the routes (`/api` and `/api/…` to the function, not `/apifoo`; the files; `index.html` for the rest), the function's `.vc-config.json`, reading a bundle's imports (esbuild's parser, not text that only mentions one) and which may stay. Bundle, `pnpm test:bundle`: `.vercel/output` as `pnpm build:vercel` writes it (`config.json`, `.vc-config.json`, `index.html` and the hashed assets it loads, the manifest, pdf.js's files; the function one file importing only Node's own modules, `pg-native` and the optional `@opentelemetry/api`, so no workspace package or `src/` path), then the bundled function itself, run by plain Node behind `node:http` (`serve:vercel`) with production's variables only: `/api/health`, 401 without a session, its own 404, an invited sign-up with a `Secure` cookie that opens `/api/stats`, the rate limits' key from `x-vercel-forwarded-for`, another origin refused, and no start without its variables | `pnpm test:bundle` builds, then runs Vitest on the test database (≈6 s); CI runs it after `pnpm test` | Free |
| Backups (M12.5) | Unit, in `pnpm test`: the excluded tables (each in the schema; every table either backed up whole or excluded; `backup.yml` lists none of its own), the private key's shape (a refusal never repeats it; the public key named as such), libpq's connection (the password in `PGPASSWORD`, `PGSSLROOTCERT=system` with `verify-full` unless a root certificate is chosen), `db:counts` (every table of `public` and `drizzle`, exact), `backup:role` (reads every table and sequence, one made later too; can't delete or create; a new password or only the grants again; no role without a password), `backup:restore` refusing a database that isn't empty before asking for the key and changing nothing, as a function and as the script. Round trip, `pnpm test:backup`, shaped as on Neon (an owner that isn't a superuser but can create roles): `backup-dump.sh` as the read-only role (only the encrypted file left behind; refused without a public key), a wrong key (can't decrypt, the database stays empty), the script with the key piped in (every table's count as the source's, the sign-in tables empty, the dictionary loaded again, neither key nor password printed), the restored database (every migration recorded, `db:migrate` doing nothing, Better Auth's schema check, `pg_trgm`, ids going on from the backup's) and no second restore into it | `pnpm test:backup` needs `age` and PostgreSQL 17's client (≈2 s); CI installs both as `backup.yml` does and runs it after `pnpm test:bundle` | Free |
| Live | Up to 2 real photos (from the git-ignored `server/test/live/photos/`), a 3-word enrich batch and two Ask AI calls (a misspelt noun, an English word) through the real Claude API, with the models set in `.env`; asserts schema validity, a sensible word count, articles only on nouns, the corrected word, and every call under a minute | `pnpm test:live`, run on demand (after AI changes, before milestones, when switching models) | ~15¢ per run on Opus 5.5, ~1¢ on Haiku 5.5 |
| AI quality (optional, not built yet) | 20–30 photos of real book pages with hand-checked word lists; reports word recall, lemma accuracy, article accuracy, dictionary mismatches | Script, run on demand to compare models; needs the hand-checked pages first | ~$2–3 per run on Opus |
| Manual | Layout, gestures, photo flow on the real device | iPhone on the local network | — |

Fixtures are created by running a few real photos through Claude once and saving the raw responses (`pnpm --filter server ai:try extract <photo> --save <name>`, `… enrich <words.json> --save <name>`, `… describe <text> [--entry <entry.json>] --save <name>`; stored in `server/test/fixtures/ai/` with the prompt hash and timing). Cases that cannot or should not be provoked for real (refusal, `max_tokens`, invalid output, fallback, 429/5xx/connection errors) are built in the tests from a recorded response. The used-up credit's two answers are fixtures of their own (`error-credit-balance-too-low.json`, `error-billing.json`: status, headers and body, written in the API's error shape since they can't be recorded), answered to the real SDK by a fake `fetch` (`anthropicTransport(key, { fetch })`). Implementation follows test-first development.

## 14. Development setup

- `docker compose up -d` starts PostgreSQL (dev and test databases).
- `pnpm dev` migrates the dev database, then starts the server (127.0.0.1:3000) and Vite (all interfaces, port 5173, `strictPort`). Vite proxies `/api` to the server, so the browser needs only one address; it keeps the browser's `Host` (the address the app was opened on) and adds the device's address to `x-forwarded-for` (`xfwd`).
- The dictionary is loaded once with `pnpm --filter server import:wiktionary <file>` (§7); without it every word is `not_found`. A database with words saved before pronunciation existed then needs `pnpm --filter server backfill:pronunciation` once (§6.6). One loaded before M10 needs the import run once more, for the forms table (§7).
- Checks: `pnpm test` (never calls Claude), `pnpm typecheck`, `pnpm check` (Biome; `pnpm format` fixes formatting). `ai:try` and `pnpm test:live` shrink photos with macOS `sips`.
- **The Vercel build** (§18.2): `pnpm build:vercel` writes `.vercel/output` (git-ignored, as all of `.vercel/`); `pnpm test:bundle` builds and then tests the output and the bundled function against the test database (§13); `pnpm --filter server serve:vercel [port]` serves the built function with plain Node on 127.0.0.1, reading only the environment (no `.env`), for trying it by hand. GitHub Actions runs all the checks on every push to `main` and every pull request, except those that change only docs (§18.4).
- **Backups** (§18.6): `pnpm --filter server backup:restore <file.dump.age> [dictionary.jsonl]` restores a nightly backup into an empty `DATABASE_URL` (a new database: the dev one isn't empty), asking for the private key hidden; `pnpm --filter server db:counts` prints every table's exact row count, read-only; `BACKUP_ROLE_PASSWORD=… pnpm --filter server backup:role [role]` makes the read-only role the dump runs as; `pnpm test:backup` runs a backup's round trip on throwaway databases. They need `brew install age postgresql@17`: the PostgreSQL 17 client, keg-only beside Homebrew's `libpq` 18, its server never started. `server/scripts/backup-dump.sh` is the workflow's dump, check and encryption, runnable by hand with `DATABASE_URL`, `AGE_RECIPIENT` and the 17 client on PATH.
- **iPhone:** same Wi-Fi, open `http://<Mac IP>:5173` and sign in (Safari and the Home Screen app each sign in once). Optionally Share → **Add to Home Screen** (`web/public/manifest.webmanifest`, Apple web-app meta tags): it then opens full screen as "Dingsda" (`APP_NAME`), without Safari's swipe gestures. The Mac still has to run `pnpm dev`. Photo picking works over HTTP. (Microphone access needs HTTPS: production has it, the LAN would need §18.7.)
- **Production** is `https://dingsda.vercel.app` (§18). It is deployed by CI, never by hand (only the first deployment came from the Mac, §18.8): a push to `main` deploys it (§18.4), so push only what has passed its milestone's review. The account scripts, `pnpm db:migrate` and `import:wiktionary` reach Neon from the Mac as described under Accounts on the Mac, below.
- Configuration via `.env` (template: `.env.example`): `DATABASE_URL`, `TEST_DATABASE_URL`, `ANTHROPIC_API_KEY`, `AI_MODEL_EXTRACT`, `AI_MODEL_ENRICH`, `AI_MODEL_DESCRIBE`, `AI_EFFORT`, `DAILY_PHOTO_LIMIT`, `DAILY_DESCRIBE_LIMIT`, `SERVER_PORT` (default 3000), `WEB_PORT` (default 5173; the server also uses it for the addresses it trusts, §4 Accounts), `BETTER_AUTH_SECRET` (signs the session cookie, at least 32 characters, `openssl rand -base64 32`; the server, `user:claim` and `user:set-password` refuse to start without it; never in git), `SIGNUP_MODE` (`invite`, the default, or `open`: anyone can create an account, §4 Accounts; the Mac runs `open` while testing, M12.7), `APP_TIME_ZONE` (the daily limits' day, §11.5; default `Europe/Berlin`; the server refuses a name that isn't an IANA time zone) and `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (the Google OAuth client, below; both or neither; the secret never in git). `BETTER_AUTH_URL` is production's address (§18.3) and stays unset on the Mac (commented out in `.env.example`).
- **Accounts on the Mac** (§4 Accounts): the migration that adds them leaves the word list with user 1, which has no email or password yet. `pnpm --filter server user:claim <email> <username>` asks for a password (typed hidden, twice; or piped in) and makes user 1 the developer account: that email, the username (stored lower-case, shown as typed), the password, `email_verified` and AI on. It refuses a user 1 that already has an email, and prints what it changed. The invite list: `invite:add <email>` (trimmed and lower-cased; adding one twice is harmless), `invite:list` (each email, and when and by which account it was used), `invite:remove <email>` (an account made from it stays).
  - **`user:set-password <email|username>`** (the account found as Sign in finds it: an email with an `@`, else a username, either in any case) asks for the new password the same way (8–128 characters), sets it through Better Auth's `internalAdapter` (`ctx.password.hash`, then `updatePassword`, or `linkAccount` for an account without one, which then has a password), and ends all the account's sign-ins, so every device signs in again. It prints the account and how many sign-ins it ended. The way to reset a forgotten password until the email service exists.
  - **`user:ai <email|username> on|off`** switches the account's AI features (§4 Accounts) and prints the switch before and after ("AI off → on"); nobody has to sign in again.
  - **`user:list`** (M12.6, built 2026-10-28) prints every account under a header, one aligned line each, sorted by id, with no filter (there are few; an argument is refused). Each line has:
    - the id, the username as shown (`display_username`) and the email (`—` for user 1 before `user:claim`, which has neither);
    - its sign-in methods (`password` for Better Auth's `credential`, `google`, `password, google`, or `none`);
    - AI on or off, and the words in its list (every `user_words` row, all of My words' tabs);
    - when it was created, and when it was last active: the newest `updated_at` of its sign-ins (`auth_sessions`). A sign-in sets it, and so does get-session when the app starts once the sign-in is a day old (Better Auth 1.7.7 writes `updatedAt` with the new `expiresAt`, §16); the app's other requests read the session without extending it. So it is the last time the app was opened on any device, to within a day. It is `—` when the account has no sign-in on record, e.g. after signing out everywhere or `user:set-password`.
    - **Times** are in `APP_TIME_ZONE` (Europe/Berlin, as the daily limits' day, also when run against Neon from the Mac), to the minute: `2026-10-28 11:21`.

    It ends with a total ("3 accounts, 1 with AI on"; "No accounts." for none). It only reads, and never shows a password hash, a token or a session id: its query selects none of them.
    ```
    Database: localhost:5432/language_app
      id  username   email             sign-in           AI   words  created           last active
       1  LazyPixel  dev@example.com   password, google  on     354  2026-10-11 21:34  2026-10-26 15:41
       4  M126Test   test@example.com  password          off      3  2026-10-28 17:37  —
    2 accounts, 1 with AI on
    ```
  - **`user:delete <email|username>`** (M12.6, built 2026-10-28) deletes an account and everything Delete account (§4 Accounts) deletes:
    - It finds the account as Sign in does, prints it as `user:list` does, then what will go, counted: the words in its list, imports, practice sessions, their answers, AI usage records, sign-ins, sign-in methods (named) and invites (the one it was made from, and one for its email never linked to it), and a Connect to Google under way when there is one.
    - **To confirm, the username is typed back**: visibly on a terminal (`askLine` in `scripts/prompt.ts`; Ctrl+C or Ctrl+D answer nothing), or piped in, the first line, for tests. It counts in any case and with spaces around ignored, as Sign in compares usernames (they are stored lower-case and unique that way); nothing else does, not the email, the id or a misspelling. Anything else, or no answer, prints "Not deleted." with exit code 1, and nothing changes. No flag skips the question: any second argument, or one starting with `-`, is a usage error. An account without a username (only user 1 before `user:claim`) can't be named, so can't be deleted by script.
    - **Every account is treated alike,** user 1 included (the user, 2026-10-28): the developer account is only the one `user:claim` made, with AI switched on, and there are no developer tools.
    - It deletes in **one transaction** (`deleteAccount` in `auth/accounts.ts`): the `users` row is locked first (`FOR UPDATE`, so nothing can be added to the account meanwhile) and what will go counted again; then what the cascades don't reach, by the same function Delete account's `afterDelete` hook runs (`removeLeftovers`: any invite for its email never linked to it, and the state of a Connect under way); then the `users` row, whose cascades (§5) take the account's data and its invite. Shared words, the dictionary and other accounts stay. A failure at any step rolls everything back, and the script prints the statement's own reason.
    - Afterwards it prints what was deleted, counted inside the transaction, and "On Neon (production), copies remain for a while: Neon's history keeps the account for 6 hours, and the nightly backups for up to 30 days, which the bucket's lock doesn't let anyone shorten" (§18.6); printed on the Mac too.
  - All of them work on `DATABASE_URL` (for Neon: the direct connection, run from the Mac, with the string read from the git-ignored `deploy.env` so it is never typed or shown: `( set -a; . ./deploy.env; set +a; DATABASE_URL="$NEON_DIRECT_URL" pnpm --filter server invite:list )`, §18.8) and print which database that is (host and name, never the password); an unknown account is an error (exit code 1). `pnpm db:migrate` and `import:wiktionary` work the same way.
- **Google on the Mac** (§4 Accounts): one OAuth client in Google Cloud, made once by hand:
  1. In the Google Cloud console, a project for the app (one for development and production).
  2. **Google Auth Platform → Branding:** the app's name, a support email and the developer's email. **Audience:** External, left in Testing (with only the basic scopes any Google account can sign in, §16, so the invite list is what keeps strangers out); listing your own and the test Gmail under Test users does no harm, in case Google holds back accounts that aren't listed. **Data access:** nothing to add (the basic `openid`, `email` and `profile` are asked for by default).
  3. **Clients → Create client:** a Web application; under Authorized redirect URIs exactly `http://localhost:5173/api/auth/callback/google` (no JavaScript origin is needed: the server makes the exchange). Google shows the client secret when the client is made: copy it then. A new or changed redirect URI can take a few minutes to work. Production's, `https://dingsda.vercel.app/api/auth/callback/google`, is on the same client beside it (added going live, M12.4); Google uses whichever matches the address the sign-in started from.
  4. In `.env`, `GOOGLE_CLIENT_ID=<…>.apps.googleusercontent.com` and `GOOGLE_CLIENT_SECRET=<…>`, then restart `pnpm dev`; `GET /api/sign-in-options` then answers `"google":true`.

  Google works only in the Mac's own browser on `http://localhost:5173`: it returns only to https or `localhost`, so the iPhone over the LAN (`http://<Mac IP>:5173`) signs in with the password and isn't shown the Google buttons. A Google account is connected to an existing account on the Mac (Settings → Account → **Connect**); the iPhone then shows it as connected. A `WEB_PORT` other than 5173 needs its own redirect URI.
- Never start the Mac's server with an https base URL or `useSecureCookies`: a `Secure` cookie is never sent back over the LAN's plain HTTP, so signing in would stop working on the iPhone. The Mac's server refuses to start with `BETTER_AUTH_URL` set, with a message saying so.
- The server starts without `ANTHROPIC_API_KEY`; only the AI calls fail until it is set. The AI writes translations in the signed-in learner's `learner_language`, taken from the session for each call.

## 15. Later

Recorded here so decisions already made are not lost.

**Planned** (`docs/plan.md`, Part 2; each feature moves into the sections above when it is built):
- Themes tagged by the AI from a built-in list and corrected by the learner; the learner's own groups (M13)
- Combinable filters in My words and Practice: theme, group, part of speech, gender, plural-only nouns, import, date added (M14)
- Practice modes German → English, articles, plurals, verb forms (M15)
- Spaced repetition (M16); progress over time: daily goal, streak, history (M17)
- Basics: the alphabet (M18), numbers (M20) and time (M21), each an explanation and its own practice; text-to-speech (M19)
- After M21: gamification; opening sign-up to everyone (the email service with its own domain, for verification and password reset, and a privacy page; then `SIGNUP_MODE=open` for real, beyond M12.7's testing); push notifications built on practice behaviour (Home Screen app, HTTPS, a service worker, the learner's consent)
- Small open items left by the milestones built so far (rough edges, follow-ups, renewing the Vercel token) are listed in `docs/plan.md`, Later

**Not planned yet:**
- **Grammar:** fixed topic list per level, tagging imports with topics, grammar exercises. Basics (M18) builds the topic structure they can reuse.
- **Levels:** learner picks A1.1 … B1+, placement test checks it.
- **Practice modes:** fill-in-the-blank, listening to words and sentences, speaking, mixed; "practise missed words again".
- **My words at scale:** paging, sorting by progress, undo for delete.
- **Export** of the word list (CSV, Anki).
- **Pictures** on card fronts.
- **Example sentences from Tatoeba** as a second source.
- **Starter word lists** (e.g. Goethe A1–B1) as an optional import into a learner's list.
- **Korean** as learner language (new `word_translations` rows; Korean UI text).
- **Several learners' shared words:** review of shared `words` rows with `mismatch_kept` before reusing them for other learners.
- **Phone app** in React Native reusing `server/` and `core/`.
- **The model, measured:** Haiku 5.5 at `medium` became the default on 2026-10-25 from the first measurements (§11.4); the AI quality test (§13, not built) would compare it with Opus 5.5 on hand-checked pages. The Wiktionary check guards a smaller model's grammar facts.
- **Text-to-speech (listening; planned for numbers and time in M19, research kept here):** Azure Neural TTS, audio generated once per word/sentence and stored; slow version via SSML speaking rate. Free tier covers an A1–A2 deck. Alternatives: Google Chirp 3 HD, ElevenLabs (premium). Words already have Wiktionary recordings (§7, §8.2); TTS remains for example sentences and for the words without a recording (≈ a quarter of the dictionary, mostly long compounds and rare words).
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

- **M12's working examples and commands** (the Better Auth probe's configuration and results, the deploy probe's build script and handler, the Vercel CLI, GitHub Actions, R2, `age`, Neon's backup role) are in `docs/m12-research.md`.
- **Better Auth for M12 (2026-10-25,** 1.7.13 read in its docs and source, and tried in a throwaway test: Fastify 5, Drizzle 0.45 with `casing: "snake_case"`, an in-memory Postgres, bundled with esbuild):
  - **Mounting:** a Fastify catch-all `/api/auth/*` route that turns the request into a Fetch `Request` for `auth.handler` (Better Auth's Fastify page). `auth.api.getSession({ headers: fromNodeHeaders(request.headers) })` from `better-auth/node` reads the session in our own routes.
  - **Cookie refresh:** a session extended inside our own routes would drop the refreshed cookie, so the web app calls `GET /api/auth/get-session` on start.
  - **Our `users` table as its user model:** `user.modelName: "users"`. Field names are Drizzle property names, and with snake_case casing no `fields` mapping is needed.
  - **Required columns:** Better Auth checks the schema at startup, and **every auth request fails** while a NOT NULL column it never writes is undeclared. So `learnerLanguage` and `targetLanguage` must be `additionalFields` with defaults (`en`, `de`, `input: false`), and so must `aiEnabled` (`false`, `input: false`; a client sending `true` is silently ignored).
  - **Model names:** `authSessions`, `authAccounts`, `authVerifications` and the rate-limit model get explicit names. Never use `usePlural`, which would pick our practice `sessions`.
  - **Ids:** `advanced.database.generateId: "serial"` is global (all its tables use identity ids). It works with our `generatedAlwaysAsIdentity()` columns, but **ids always come back as strings** (`"2"`, `session.userId` too); the credential account's `accountId` is the user id as text.
  - **Invite check:** `user.validateUserInfo({ user, source })`. It runs before any user is created, by email or OAuth; return `{ error: "not_invited" }` unless `source.action === "sign-in"`. Keep `autoSignIn: true`: with it off, or with `requireEmailVerification`, a refused sign-up returns a fake success.
  - **Username plugin:** `POST /sign-in/username`, and `POST /sign-up/email` with `username` (optional there, so required in our Zod schema). Defaults: 3–30 characters, `/^[a-zA-Z0-9_.]+$/`, stored lower-case with `displayUsername` as typed. Errors: `USERNAME_IS_ALREADY_TAKEN` (400), `INVALID_USERNAME_OR_PASSWORD` (401), `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` (422). `disabledPaths: ["/is-username-available"]`.
  - **Google without the client library:**
    - `POST /api/auth/sign-in/social` with `{ provider: "google", callbackURL, errorCallbackURL }` answers 200 `{ url }`, and the web app sets `location.href`. Errors come back as `errorCallbackURL?error=<code>`.
    - **Linking:** implicit linking to an existing account needs the local `emailVerified` to be true, otherwise `account_not_linked`. Explicit linking while signed in is `POST /link-social` and doesn't need it.
  - **Scripts:** `user:claim` and `user:set-password` go through `(await auth.$context).internalAdapter`: `updateUser`, `linkAccount({ providerId: "credential", accountId: String(id), password: await ctx.password.hash(pw) })`, `updatePassword`. `internalAdapter.createUser` outside an endpoint throws once `validateUserInfo` is set; `auth.api.signUpEmail({ body })` works headless.
  - **Passwords:** scrypt through `node:crypto`, ≈70 ms per hash on the Mac. `/request-password-reset` answers `RESET_PASSWORD_DISABLED` without an email sender.
  - **Deleting a user:** `user.deleteUser.enabled`. It needs a correct password, or a session younger than `session.freshAge` (default 1 day). It isn't transactional, hence our cascades.
  - **Secure cookies:**
    - Whether cookies are `Secure` (with the `__Secure-` prefix) is decided once at startup: `useSecureCookies`, else the `baseURL` protocol, else `NODE_ENV === "production"`.
    - So dev must never run with `NODE_ENV=production` or an https `baseURL`. Over the LAN's plain HTTP, cookies are set fine.
    - Several dev origins: `baseURL: { allowedHosts: [...], protocol: "auto", fallback }`; production a static https `baseURL`. Every POST must come from a trusted origin (403 `INVALID_ORIGIN`).
  - **Rate limiting** is on only when `NODE_ENV` is production by default, so set it explicitly: `storage: "database"`, `customRules` per path. The client IP comes from `x-forwarded-for` only for a single address, so set `advanced.ipAddress.ipAddressHeaders` to Vercel's client-IP header (`x-vercel-forwarded-for`, confirmed in M12.4, below).
  - **Bundling:** esbuild `--platform=node --format=esm` bundles it cleanly (`node` picks `node:crypto` scrypt instead of a slow JavaScript one); the optional `@opentelemetry/api` import falls back harmlessly. Keep `better-auth` and `@better-auth/*` on one exact version. 1.7.x churned (a column came and went, `requireLocalEmailVerified` is deprecated), and 1.8 is in beta.
- **Built on 1.7.7 (M12.1, 2026-10-25;** the only release at least 1.7.7 and two weeks old that day), which behaved as the probe found, plus:
  - **The origin check is skipped when `NODE_ENV=test`** (`advanced.disableOriginCheck` defaults to true there), so it is set to `false`.
  - **The client address comes from headers only** (Better Auth sees a Fetch request, not the socket). Without one, every client shares one counter per path (and a warning is logged). On the Mac, Vite's proxy adds it (`xfwd`) and loopback is the trusted proxy; production's header was settled in M12.4 (below).
  - **`databaseHooks.user.create.after` runs after the sign-up's transaction commits** (`queueAfterTransactionHook`), so a write to our own tables there, through our own connection, sees the new user; inside the transaction it would wait on the uncommitted row.
  - **A `hooks.before` middleware can change the body before the endpoint validates it** (sign-up's `name` set from the username).
  - **Fields with `input: false` sent by a client are silently left out** (200), not refused.
  - **Typing:** `additionalFields` with `required: false` come back optional in `getSession`'s types, though the columns are NOT NULL.
  - **The schema check** (`npx auth@1.7.7 check schema --config <file>`) passed against our Drizzle schema; the same check runs on the first auth request, and a test runs it.
  - **Fastify:** request hooks added after a `register` run only for routes registered after them, so the test app signs requests in by wrapping `inject` rather than with a hook.
- **Found in M12.2 (2026-10-26,** Better Auth 1.7.7 and `@anthropic-ai/sdk` 0.133.0, read in their source):
  - **`/delete-user` checks a password only when one is sent;** without one it accepts any session younger than `freshAge` (1 day), also for an account that has a password. Hence our `hooks.before` refusing that (`PASSWORD_REQUIRED`). Its errors: `INVALID_PASSWORD`, `SESSION_EXPIRED`, `CREDENTIAL_ACCOUNT_NOT_FOUND`, all 400. It deletes sessions, then accounts, then the user, not in one transaction, and calls `afterDelete(user)` at the end.
  - **No cookie cache by default** (`session.cookieCache` off), so `getSession` reads the session and its user from the database on every request: `ai_enabled` changed by `user:ai` counts at once.
  - **`internalAdapter.updatePassword(userId, hash)` and `deleteUserSessions(userId)`** do what `user:set-password` needs; the hash comes from `ctx.password.hash` (scrypt), as on sign-up.
  - **The SDK's retries** (`shouldRetry`): 408, 409, 429 and 5xx, plus connection errors and an `x-should-retry: true` header; a 400 or 402 is never retried unless the API sends that header. The 402 has no error class of its own (a plain `APIError`, `status` 402, `type` `billing_error`).
- **Found in M12.3 (2026-10-26,** Better Auth 1.7.7 read in its source, and tried with Google faked):
  - **`validateUserInfo`'s `source.action`:** `create-user` before any new user (a password sign-up, `method` `email-password`; a first Google sign-in, `method` `oauth`, `oauth.providerId` `google`), `sign-in` when a Google account that is already linked signs in again, and `link-account` both for the implicit link at sign-in and for `link-social`'s callback. M12.1's check ran on everything but `sign-in`, which would have refused Connect, and the developer account's first Google sign-in, with `not_invited`; it now runs on `create-user` only.
  - **Implicit linking** (`handleOAuthUserInfo`): an existing user with the Google account's email but without that Google account is linked and signed in only if the provider is trusted (`account.accountLinking.trustedProviders`, empty here) or Google says `email_verified`, and the local `emailVerified` is true (`requireLocalEmailVerified`, default true); otherwise `account not linked`, redirected as `?error=account_not_linked`. So the claimed developer account links by itself; password sign-ups don't.
  - **`link-social`'s callback** (`linkOAuthAccount`) fails as `?error=email_does_not_match` (unless `allowDifferentEmails`), `account_already_linked_to_different_user`, or `unable_to_link_account` (Google's email not verified, or the row couldn't be made); the same Google account linked again only refreshes its tokens. Every callback error goes to `errorCallbackURL` with `error` and `error_description` added; Google's own (`access_denied`) is passed through.
  - **Google's id token isn't checked against Google's keys in the redirect flow:** `getUserInfo` only decodes the one the token endpoint returned (straight from Google over TLS). The server's only request is the `POST https://oauth2.googleapis.com/token` (client id and secret in the body, PKCE verifier, the same `redirect_uri`), through `globalThis.fetch` at call time, which is what the tests replace. (Signing in with an id token sent by a client, which the app doesn't use, would fetch Google's keys.)
  - **The redirect URI** is `<baseURL>/callback/google`, the base URL resolved per request among `baseURL.allowedHosts`, so it follows the address the app was opened on; root-relative `callbackURL` / `errorCallbackURL` (`/words`, `/signin?next=…`) pass the origin check (another site's address is refused, 403 `INVALID_CALLBACK_URL`).
  - **The state** is kept in the database (`storeStateStrategy` `database` when there is one): a row in the verification table plus a signed `better-auth.state` cookie (5 minutes, `SameSite=Lax`, sent along on Google's top-level redirect back); every verification lookup deletes expired rows.
  - **Hooks:** the username plugin's `user.create.before` runs before ours (plugins' database hooks come first) and leaves a user without a username alone, so ours fills it in; the plugin's own checks (length, characters, taken) don't run on it, hence ours keeps to the rules itself.
  - **Rate limits:** besides custom rules, Better Auth has a built-in one for every path starting with `/sign-in` or `/sign-up` (3 per 10 s); a custom rule for the exact path wins over it.
- **Found in M12.3b (2026-10-26,** Better Auth 1.7.7 read in its source, and tried with Google faked):
  - **Where Google's tokens are written:** `handleOAuthUserInfo` (the callback's sign-in) creates the user and its account in one transaction for a first sign-in (`internalAdapter.createAccount`), links a verified email with `linkAccount`, and on a later sign-in updates the row with the fresh tokens (`updateAccount`, unless `account.updateAccountOnSignIn: false`; `scope` is left out there). `linkOAuthAccount` (link-social's callback) creates the row, or updates the tokens of a Google account already connected. `link-social` and `sign-in/social` with an `idToken` in the body (not used by the app) write them too, as do `/get-access-token` and `/refresh-token` after a refresh. Every one goes through `createWithHooks` / `updateWithHooks`, so `databaseHooks.account.create.before` and `update.before` see them all. `update.before` gets only the fields being written, not the row (so not its provider unless the caller sends it; Better Auth's OAuth updates do); a returned `{ data }` is merged over them, and `null` is written as NULL (only `undefined` is skipped). A password change writes only `password` (`updatePassword`, `updateManyWithHooks`).
  - **Who reads them back:** `/get-access-token` (answered a signed-in browser with the stored access token), `/refresh-token` (needs the refresh token; Google sends one only for offline access, which the app never asked for), and `/account-info` (Google's profile, decoded from the stored id token; Google's provider fetches nothing there and returns nothing without one). Nothing else: the callback reads the id token it has just received, not a stored one. `/list-accounts` answers `id`, `providerId`, `accountId`, `userId`, `scopes` and the dates, never a token.
  - **The account cookie** (`account.storeAccountCookie`, a copy of the sign-in method with its tokens in a cookie) is on by default only without a database; with ours it was off, and is now set off explicitly.
  - **`/unlink-account`** takes `{ accountId }`, the sign-in method's own `id` (the row's, not the provider's account id); the `{ providerId }` form of older versions is gone (400 `VALIDATION_ERROR`). It runs behind `freshSessionMiddleware`: a sign-in made more than `session.freshAge` (1 day) ago gets 403 `SESSION_NOT_FRESH`, counted from the sign-in's `created_at`, so the daily extension doesn't help. Then, with one sign-in method left and `account.accountLinking.allowUnlinkingAll` off, 400 `FAILED_TO_UNLINK_LAST_ACCOUNT` (checked before the id); an id that isn't one of the account's, 400 `ACCOUNT_NOT_FOUND`. It removes any other method, the password included, which our hook refuses (`CANNOT_UNLINK_PASSWORD`). Sessions are left alone.
  - **`disabledPaths`** answer 404 with the text body "Not Found" before any endpoint code runs.
- **Found in M12.4 (2026-10-26,** Vercel's docs, Vercel CLI 63.1.2 read in its source and run offline, `@vercel/functions` 3.9.11 and Better Auth 1.7.7 read in their source):
  - **The client's address on Vercel** ([Request headers](https://vercel.com/docs/headers/request-headers)):
    - `x-forwarded-for`: "The public IP address of the client that made the request. If you are trying to use Vercel behind a proxy, we currently overwrite the `X-Forwarded-For` header and **do not forward external IPs**. This restriction is in place to prevent IP spoofing."
    - `x-vercel-forwarded-for`: "This header is identical to the `x-forwarded-for` header. However, `x-forwarded-for` could be overwritten if you're using a proxy on top of Vercel."
    - `x-real-ip`: "This header is identical to the `x-forwarded-for` header." (`@vercel/functions`' own `ipAddress()` reads it.)
    - **Chosen: `x-vercel-forwarded-for`**, Vercel's own header, the one the page says survives a proxy in front. The page says in so many words only of `x-forwarded-for` that Vercel overwrites what a client sent, so going live sent forged values of all three and checked the stored key (§18.8): Vercel replaced them, and the key held the real address. Better Auth takes a header only when it holds a single address (without `trustedProxies`), walking `ipAddressHeaders` in order; with none it falls back to one shared `no-trusted-ip` count and logs a warning once.
  - **`x-vercel-id`** (same page): "a list of Vercel regions your request hit, as well as the region the function was executed in".
  - **`vercel build` with our own output** (CLI 63.1.2, run offline with a hand-written `.vercel/project.json`, an empty global config and no account): it deletes `.vercel/output`, runs vercel.json's `installCommand` and `buildCommand` (`pnpm build:vercel`), and keeps the Build Output API folder the build command wrote (Vercel's static builder finds `.vercel/output/config.json`). It merges routes of its own into `config.json`: an error phase (`{ "handle": "error" }` and a 404 for any path outside `/api` to `/404.html`) between our `/api` route and `filesystem`, and `"crons": []`; harmless, since the `index.html` catch-all leaves no 404 outside `/api`. It wrote no `builds.json`, and `diagnostics/cli_traces.json` with timings only. It warns that `"engines": { "node": ">=24" }` "will automatically upgrade when a new major Node.js Version is released", and says "Using pnpm@10.x based on project creation date" while running the pnpm on the `PATH` (11.18). The bundle it produced was byte for byte the one `pnpm build:vercel` writes.
  - **`vercel deploy --prebuilt`** ([vercel deploy](https://vercel.com/docs/cli/deploy#prebuilt), "upload and deploy the results of a previous `vc build` execution located in the .vercel/output directory"; [vercel build](https://vercel.com/docs/cli/build)): in the CLI's source it needs only `.vercel/output`; `builds.json` is optional, and when there it refuses a failed build or one built for another target (`--prod` against a preview build). So the deploy job runs `vercel pull`, `vercel build --prod` and `vercel deploy --prebuilt --prod`, Vercel's own documented sequence; an upload of `.vercel/output` from `pnpm build:vercel` alone would also be accepted.
  - **Deployment Protection** ([docs](https://vercel.com/docs/deployment-protection)): "Standard Protection … protects all domains except production domains", on all plans; "All Deployments" protects the production domain too, and Password Protection isn't on Hobby. `vercel project protection <name>` shows the setting.
  - **`attachDatabasePool`** (`@vercel/functions` 3.9.11): for a pg `Pool` it listens to `release` and after each keeps the instance running (`waitUntil`) for the pool's `idleTimeoutMillis` plus 100 ms, so idle connections close before Vercel freezes the instance; outside a Vercel Function (`VERCEL_URL` and `VERCEL_REGION` unset) it does nothing. Imported from `@vercel/functions/db-connections`, which leaves the package's OIDC code out of the bundle.
  - **`vercel env add`** ([vercel env](https://vercel.com/docs/cli/env)): the value from stdin (or `--value`, which would put it in the command line); `--sensitive` stores a Secret (never read back), `--no-sensitive` a Config; `--force` overwrites one already there; `--yes` skips the prompts. On production the default type is Secret.
  - **Better Auth's origin check before a cookie** (1.7.7): `formCsrfMiddleware` guards `/sign-in/email` and `/sign-up/email` only; the username plugin's `/sign-in/username` lacked it, so a browser's sign-in by username was accepted from any site (the cookie-carrying POSTs were always checked). Hard to exploit through a browser (a JSON POST from another site needs a CORS preflight the server never grants, and Fastify refuses form bodies), and now checked (§4 Accounts).
  - **node-postgres and Neon's strings** (pg 8.23): `sslmode=require` is treated as `verify-full` with a "SECURITY WARNING" on every start; `sslmode=verify-full` behaves the same without it. `channel_binding=require` is ignored (node-postgres uses channel binding only with its `enableChannelBinding` option); the connection still uses SCRAM over TLS.
- **Found in M12.6 (2026-10-28,** Better Auth 1.7.7 and Drizzle 0.45.3 read in their source, and tried in tests):
  - **A session's `updated_at` is its last refresh:** `createSession` writes `createdAt` and `updatedAt` as now; `/get-session` refreshes a session whose last refresh (`expiresAt` − `expiresIn`) is at least `updateAge` (1 day) old with `updateSession(token, { expiresAt, updatedAt: new Date() })`, and sets the cookie again. `disableRefresh` (our session hook, so every other route) and a "don't remember me" session skip it; with no cookie cache nothing else writes the row. Hence `user:list`'s last active (§14), to within a day.
  - **Connect's state names the account:** with the database strategy, a Google trip's state is a row `auth-state:<state>` in the verification table, its value the JSON of `{ callbackURL, codeVerifier, errorURL, newUserURL, link, expiresAt, requestSignUp, oauthState }`, and `/link-social` sets `link: { userId, email }` from the session. Neither `/delete-user` nor our cascades removed it: it stayed until Google sent the browser back, or until a verification lookup after it expired (`findVerificationValue` deletes every expired row), which may never come. Deleting an account now removes it (§4 Accounts).
  - **What `/delete-user` deletes** (without email verification): `beforeDelete`, `internalAdapter.deleteUser` (sessions, sign-in methods, then the user, through the adapter's hooks), `deleteUserSessions` again, then `afterDelete`. Nothing else is kept per account here (no secondary storage, no cookie cache; rate-limit keys are per address), so a `DELETE` of the `users` row with our cascades and the same leftovers leaves the same database; a test compares the two deletions table by table.
  - **Drizzle writes a column in a `sql` template without its table** among a single-table select's fields (`"id"`, not `"users"."id"`), so a correlated subquery written as `sql` silently compared the inner table's own `id`. Written as a nested query builder (or `db.$count`), its columns carry their table.
- **Google sign-in rules (2026-10-25,** Google's OAuth pages):
  - **Return addresses** must be https, except `localhost`. A raw IP is refused, and the host's top-level domain must be on the public suffix list: `.local` isn't, `vercel.app` is. No wildcards, so each Vercel address is registered on its own.
  - **No warning screen for basic data:** asking only for `openid email profile`, any Google account can sign in without a warning or a 7-day expiry, even while the project is in "Testing", and no verification is needed. So the invite check is what keeps strangers out.
  - **The Home Screen app:** Apple only says that out-of-scope links open in an in-app Safari view, and doesn't say whether the return from Google lands back in the app with its cookie. **Tried on the iPhone (iOS 18.7, 2026-10-26, M12.4):** Continue with Google opens Google in an in-app sheet ("Done" and the address bar, no app switch); after the account is chosen the sheet closes by itself and the app is on Home, signed in, and still signed in after it is closed and opened again. The session's user agent is Safari's. So the Home Screen app keeps Google.
  - **The button** (Google's branding guidelines, read 2026-10-26): the label "Sign in with Google", "Sign up with Google" or "Continue with Google"; the standard-colour "G", never recoloured, resized against the button or used alone, on Google's light (`#FFFFFF` fill, `#747775` 1 px stroke, `#1F1F1F` text), dark (`#131314`, `#8E918F`, `#E3E3E3`) or neutral button; 12 px before the G and 10 px after it on the web; the button may be scaled with its proportions. Google's own font is Google Sans Medium 14/20; ours uses DM Sans (no font is fetched from another site), the one point where it departs from Google's buttons.
- **Other M12 facts (2026-10-25):**
  - **`pg_dump` version:** `ubuntu-latest` runners have PostgreSQL 16, and `pg_dump` refuses newer servers, so install `postgresql-client-17` (PGDG) or run it in the `postgres:17` image.
  - **Neon backup role:** roles made in Neon's console get `neon_superuser`, so the read-only `backup` role is created in SQL with per-schema grants.
  - **R2** asks for a payment method through its "R2 subscription" checkout; PayPal is accepted.
  - **Vercel Instant Rollback** on Hobby reaches only the previous deployment.
  - **Used-up Anthropic credit** answers either 400 `invalid_request_error`, "Your credit balance is too low…", or 402 `billing_error`. Reports differ, so both are handled.
- **Backups (M12.5, 2026-10-27):**
  - **GitHub's schedule time zone:** `timezone:` beside `cron` takes an IANA name, and a run in an hour the clocks skip moves to the next valid time (GitHub's events page). actionlint 1.7.12 (2026-03-30, still the newest release) knows it and checks the name ("invalid timezone … in schedule event"), so no newer actionlint was needed; both workflows are clean, its shellcheck included. **In practice** the first night with `timezone: Europe/Berlin` (2026-10-29) started no scheduled run at all, while the workflow was active and its run by hand had worked; the schedule moved to plain UTC that morning (§18.6, §18.9).
  - **libpq and `sslmode=verify-full`:** libpq checks the server's certificate against `~/.postgresql/root.crt` unless `sslrootcert=system` (PostgreSQL 16+) points it at the system's authorities (OpenSSL's: Homebrew's `openssl@3` on the Mac, `/etc/ssl` on the runner); `system` allows only `verify-full`. node-postgres (pg-connection-string 2.14.1) reads any `sslrootcert` in a URL as a file path and would fail on `system`, so the URLs stay as Neon's (§18.5) and libpq's tools get `PGSSLROOTCERT=system` from the environment (`backup.yml`, `backup:restore`, §18.9 step 4.4). On the Mac, `PGSSLROOTCERT=system` with `verify-full` got as far as the TLS step against the local server ("server does not support SSL"), so the setting is taken; the certificate check itself happens only against Neon.
  - **R2 and the AWS CLI:** the region is `auto`; an EU-jurisdiction bucket is reached only through `https://<account id>.eu.r2.cloudflarestorage.com`, and the jurisdiction can't be changed (Cloudflare's data-location page). R2's S3 page lists `Content-MD5` as supported. Newer AWS CLI and SDK releases send CRC checksums by default, which R2 rejected in 2025 by third-party reports (Cloudflare's own AWS CLI page doesn't mention it), so `backup.yml` sets `AWS_REQUEST_CHECKSUM_CALCULATION` and `AWS_RESPONSE_CHECKSUM_VALIDATION` to `when_required` and relies on `Content-MD5` and the ETag (a single PUT's MD5).
  - **R2 bucket locks** (Cloudflare's page): a rule, for a prefix or the whole bucket, keeps objects from being deleted or overwritten for a number of days, until a date or indefinitely, and doesn't stop new ones; where a lifecycle rule would delete earlier, the lock wins.
  - **age:** `--identity -` reads the identity from stdin in Ubuntu 24.04's age 1.1.1 (its source) and Homebrew's 1.3.2, so the key reaches age through a pipe. The post-quantum keys of age 1.3 (`age-keygen -pq`) aren't for the runner's 1.1.
  - **pg_dump's archive** has a `TABLE DATA` entry for every table whose data it keeps, empty tables included, and none for `--exclude-table-data`'s, which `backup-dump.sh` checks in `pg_restore --list`.
  - **An owner like `neondb_owner`** (not a superuser) migrates (`pg_trgm` is a trusted extension), restores with `--no-owner --no-acl` (`COMMENT ON EXTENSION` included) and, with `CREATEROLE` (which `neon_superuser` gives), makes the `backup` role; without `CREATEROLE` it can't (tried in `pnpm test:backup`).
  - **One child's output as another's input** (Node): handing `age.stdout` to `pg_restore` as its stdin leaves the parent's end of the pipe open, so age never emits `close` (the restore hung); `backup:restore` closes its end once pg_restore has started.

## 17. Accounts: where the steps went (M12.1–M12.4, all built)

Settled with the user on 2026-10-24 and 2026-10-25 (`docs/plan.md`, M12). As each step was built, its parts moved into the sections above (§2, §4, §5, §9, §10, §12–§14); this section only records where they went. Its old subsection numbers (17.1–17.9) are given for older references (commits, notes); none is left.
- **M12.1 (sign-in) is built:** accounts, sessions, the invite list, `user:claim` and the `invite:*` scripts are in §4 Accounts, §5 (`users`, Better Auth's tables, `invites`, the cascades), §9.4, §10 screens 17–19, §12 Signing in, §13 and §14. (Its subsections 17.3 and 17.4 moved there.)
- **M12.2 is built (2026-10-26):** the AI switch (17.5) is in §4 Accounts (the AI switch), §6.6–§6.7 (saving without AI), §9 and §10 (Without AI); the used-up credit in §11.1 and §12; the daily limits' day in §11.5; the scripts (17.6) in §14; deleting an account (17.7) in §4 Accounts, §5 and §9.4; Account's Delete account (from 17.8) in §10 screen 19 and Sign in's "Your account was deleted." in screen 17; the `ai_not_enabled` and `ai_unavailable` rows of 17.9 in §12.
- **M12.3 is built (2026-10-26):** Google (17.2, and Google in 17.1) is in §4 Accounts (Google; deleting a Google-only account), §5 (`users`, `auth_accounts`, `auth_verifications`), §9 and §9.4 (`/sign-in-options`, `sign-in/social`, `link-social`, the callback), §12 (Google's errors, with the `not_invited` row of 17.9), §13, §14 (the Google OAuth client) and §16 (what Better Auth does); its screens (17.8) in §10 screens 17–19 and the design system's `GoogleButton`.
- **M12.3b is built (2026-10-26),** a follow-up decided after M12.3's demo and never in this section: Google's tokens not kept, Disconnect, and implicit linking kept, in §4 Accounts (Google), §5 (`auth_accounts`), §9.4 (`unlink-account`, the switched-off endpoints), §10 screen 19, §12, §13 and §16.
- **M12.4's code is built (2026-10-26):** production's static https base URL as the one trusted origin, the `Secure` cookies with the `__Secure-` prefix and the client's address from `x-vercel-forwarded-for` are in §4 Accounts (Sessions, Addresses in production, Rate limits), §13, §14 and §16.
- **M12.4 went live (2026-10-26, §18.8):** `user:claim` ran on Neon's fresh database, so the developer account is user 1 there as on the Mac; the account scripts (§14) run from the Mac on Neon's direct connection. Google has production's return address on the same OAuth client (§14) and the Google pair in Vercel's variables (§18.3), and works in Safari and in the Home Screen app (§16); on https the screens offer it everywhere (§4 Accounts); this was the production part of 17.1.

## 18. Deployment (M12, designed 2026-10-25; M12.4 built and live 2026-10-26; M12.5 built 2026-10-27, live 2026-10-28)

M12.4's build, function, configuration and workflow are built (18.2–18.4), and the app went live on 2026-10-26 (18.8): `https://dingsda.vercel.app`, deployed by CI on every push to `main` but a docs-only one (§18.4). The backups (18.6, M12.5) went live on 2026-10-28 (18.9).

### 18.1 Where it runs
| | Development (the Mac) | Production |
|---|---|---|
| Web | Vite, `http://<Mac IP>:5173` on the LAN | Static files on Vercel (Hobby), `https://dingsda.vercel.app` (the working name; final after M12) |
| API | Fastify on 127.0.0.1:3000 (`tsx watch`) | One Vercel Function in Frankfurt (`fra1`), Node 24 |
| Database | PostgreSQL 17 in Docker: the prototype's word list, with user 1 claimed as the developer account | Neon Free in Frankfurt (`aws-eu-central-1`), PostgreSQL 17, autoscaling capped at 1 CU; started fresh with only the dictionary and the developer account (user 1, claimed there, §18.8) |
| AI | The same Anthropic key as production | The same key: €5 of prepaid credit, no auto top-up (§18.8 step 4) |
| Sign-in | Cookies without `Secure`; Google only in the Mac's own browser on `localhost` (the iPhone over the LAN signs in with a password) | `Secure` cookies; Google on the production address, in Safari and in the Home Screen app (§16) |
| Deploys | None: `pnpm dev` runs the working tree | GitHub Actions on every push to `main` that changes more than docs (§18.4) |

- **Production starts fresh:** the Mac's word list stays on the Mac (the user, 2026-10-24).
- **A secure context:** the deployed app runs on HTTPS, so the browser APIs CLAUDE.md rules out work there. The rule stays for the LAN.

### 18.2 Build
Built in M12.4 as the check found (`docs/plan.md`, M12):
- **`pnpm build:vercel`** (at the root) runs the web build (`vite build`), then `server/scripts/build-vercel.ts` (`buildVercelOutput` in `scripts/vercel-output.ts`); ≈2 s on the Mac, the bundle itself 0.4 s:
  - It refuses to run without `web/dist/index.html`, then writes `.vercel/output` from scratch, with the web build as `static/`, unchanged.
  - It bundles `server/src/vercel.ts` with esbuild (0.28.2, a dev dependency of `server`): ESM for Node 24, everything inside (`core/` and every library), not minified, with a `createRequire` banner for the CommonJS libraries. Two imports stay outside on purpose: `pg-native` (node-postgres requires it only for `pg.native`) and `@opentelemetry/api` (Better Auth tries it for tracing in a `try`/`catch` and uses a no-op without it). The build fails if the bundle would import anything else but Node's own modules. The result is one file, `functions/api.func/index.mjs`, 5.2 MB (the probe's 3.6 MB had no Better Auth).
  - `functions/api.func/.vc-config.json`: `runtime: "nodejs24.x"`, `handler: "index.mjs"`, `launcherType: "Nodejs"`, `maxDuration: 300`, `regions: ["fra1"]`. Vercel's request helpers stay off (`shouldAddHelpers`' default), so the body reaches Fastify untouched.
  - `config.json` (version 3): `^/api(?:/.*)?$` to `/api`, the function, which sees the original path; then `{ "handle": "filesystem" }`, the web build's files; then `^/(.*)$` to `/index.html`, so the app's own routes (`/words`) load. `/apifoo` isn't the function's. `vercel build` adds an error phase of its own (§16).
- **`vercel.json`:** `framework: null`, `installCommand: "pnpm install --frozen-lockfile"`, `buildCommand: "pnpm build:vercel"`, `regions: ["fra1"]`, and `git.deploymentEnabled: false`, because deploys come only from GitHub Actions (§18.4). Vercel never builds on its own machines (every deploy is prebuilt), so the probe's Corepack setting isn't needed.
- **Node 24** is pinned where it runs: the function's runtime by `.vc-config.json`, and the build by GitHub's runner (`actions/setup-node`, Node 24). `engines.node` stays `>=24`: with `24.x`, pnpm prints "Unsupported engine" on every command on the Mac, which develops on Node 26 (it only warns: `engine-strict` is off, and there is no `.npmrc`). The one cost of `>=24` is a warning line in `vercel build` (§16).
- **The handler** (`server/src/vercel.ts`, next to `main.ts`): once per function instance it reads Vercel's variables (`parseVercelConfig`: `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` must be set, the rest as on the Mac; there is no `.env`), builds the server with `createServer(config, "vercel")` from `setup.ts`, the same setup `main.ts` uses on the Mac (the database pool, Better Auth, the AI client, `buildApp`), and awaits `app.ready()`. Each request then goes to Fastify as it came (`app.server.emit("request", req, res)`). A missing variable stops the instance with a message naming it. Started by plain Node from the bundle, it is ready in ≈0.15 s on the Mac.
- **Database pool:** on Vercel, Neon's pooled connection with `max: 3`, a 5 s idle timeout, `connectionTimeoutMillis: 10000` (Neon's advice), and `attachDatabasePool` from `@vercel/functions` (3.9.11), so idle connections are closed before an instance is frozen (§16). The Mac keeps node-postgres's defaults (10 connections, 10 s idle).
- **Request ids:** Fastify takes Vercel's `x-vercel-id` as the request id (`genReqId`, `http/request-id.ts`; only a value of letters, digits, `_`, `.`, `:` and `-`, up to 128 characters), since its own counter restarts in every instance. That way "Something went wrong (request …)" finds its log line. Without the header (the Mac) the ids are Fastify's kind, `req-1`, `req-2`…. Vercel keeps runtime logs for one hour on Hobby.

### 18.3 Configuration
- **Vercel's production variables:**
  - `DATABASE_URL`: Neon, pooled;
  - `BETTER_AUTH_SECRET`: 32 random bytes, not the Mac's;
  - `BETTER_AUTH_URL`: `https://dingsda.vercel.app`, the production address (§4 Accounts: the base URL, the one trusted origin, `Secure` cookies, the client's address from Vercel's header);
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`;
  - `ANTHROPIC_API_KEY`; `AI_MODEL_EXTRACT` / `_ENRICH` / `_DESCRIBE` and `AI_EFFORT` only if they differ from the defaults (Haiku 5.5, `medium`);
  - `DAILY_PHOTO_LIMIT`, `DAILY_DESCRIBE_LIMIT` (only if they differ from 50 and 200), `APP_TIME_ZONE`, `SIGNUP_MODE` (`invite` at going live, §18.8; `open` while testing, from M12.7, §4 Accounts; a change takes effect with the next deploy).

  Secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`) are stored as "sensitive" variables, which can't be read back; the others as plain ones. `NODE_ENV` isn't set: production's behaviour comes from `BETTER_AUTH_URL` alone, and `TZ` is reserved (§11.5).
- **The Mac's `.env`** gains `BETTER_AUTH_SECRET`, `APP_TIME_ZONE` and `SIGNUP_MODE` (`open` while testing, from M12.7, like production), and from M12.3 the Google pair (one Google client with both return addresses: `http://localhost:5173/api/auth/callback/google` for the Mac's own browser, §14, and `https://dingsda.vercel.app/api/auth/callback/google` from M12.4). Never `BETTER_AUTH_URL`: the Mac's server refuses to start with it.
- **GitHub Actions** (§18.4, §18.6):
  - secrets, set going live (§18.8): `VERCEL_TOKEN` (valid until ≈2027-10-26), `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `NEON_MIGRATE_URL` (direct, owner);
  - for the backups (M12.5, set 2026-10-28, §18.9 step 5): the secrets `NEON_BACKUP_URL` (direct, the read-only `backup` role, `sslmode=verify-full`), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (the bucket's token), and a repository variable, `AGE_RECIPIENT`, the backups' public key (`age1…`).
- **Going live's secrets** sat in `deploy.env` at the repo root (git-ignored, values single-quoted) while §18.8 was under way, and the commands read them from there, so none was typed, shown or pasted into a chat; it was deleted afterwards. A later script on Neon gets a new `deploy.env` with `NEON_DIRECT_URL='…'` from Neon's console.
- **Deployment protection:** Vercel Authentication with Standard Protection: every deployment's own address needs a Vercel login, the production domain doesn't (§16). So Vercel's own login stays off for production: the app's sign-in protects it, and Vercel's would also lock out the iPhone. There are no preview deployments (every deploy is `--prod`).

### 18.4 Deploys (GitHub Actions)
`.github/workflows/ci.yml`, built in M12.4; it runs from the push that brings it (§18.8):
- **Docs-only changes run nothing** (added after going live; the user, 2026-10-26: docs updates shouldn't trigger CI): `push` and `pull_request` both have `paths-ignore: ["**.md", "docs/**"]`, so a push or pull request that changes only markdown files or files under `docs/` runs neither the checks nor the deploy; one that also changes anything else runs everything. It is safe because no code or test reads the docs, and Biome's `files.includes` already leaves `docs` out.
- **Checks:** on every push to `main` and on pull requests (except docs-only ones, above), on `ubuntu-24.04` with Node 24 and the pnpm of `packageManager` (its store cached): `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm check`, `pnpm test` and `pnpm test:bundle`, then (from M12.5) the PostgreSQL 17 client and `age`, installed as `backup.yml` installs them, and `pnpm test:backup` (§18.6), against a `postgres:17` service with user `app` and the database `language_app_test`, as `docker/initdb` makes it on the Mac (the tests rebuild its schema, `pg_trgm` included, themselves). `pnpm test:live` stays manual, since it costs money. The suite also passes with the process in UTC and the C locale, as on the runner.
- **Deploy:** on `main` only (a push, not a pull request), and only when the checks pass (`needs: checks`), one at a time (`concurrency: deploy-production`; a newer run waits for the running one rather than cancelling it):
  1. `vercel pull --yes --environment=production`, then `vercel build --prod`, which runs `vercel.json`'s build command (§18.2), with Vercel CLI 63.1.2 and `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`;
  2. `pnpm db:migrate` against Neon (`NEON_MIGRATE_URL`), once the build is ready, so a failed build leaves Neon alone;
  3. `vercel deploy --prebuilt --prod`.
- **Pinned actions,** each to a release's commit, its tag beside it: `actions/checkout` v7.0.1, `actions/setup-node` v7.1.0, `pnpm/action-setup` v6.1.0 (the newest releases at least two weeks old on 2026-10-26). `actionlint` 1.7.12 finds nothing in the workflow.
- **Migrations only add** (new tables, nullable or defaulted columns, new indexes). Neon is migrated a moment before the new code goes live, so for that moment the old code runs against the new schema. Removing a column takes two deploys.
- **Rollback:**
  - Vercel's Instant Rollback on Hobby goes back to the previous deployment only.
  - The schema isn't rolled back.
  - After a rollback, Vercel holds later deploys until the rollback is undone or `vercel promote` is run.
- **Failure emails:** a failed check or deploy emails the user who created the workflow.
- **The dictionary** is loaded into Neon once from the Mac (`import:wiktionary` on the direct connection, ≈30 s), and again only when the loader changes.
- **Proven only by running it** (§18.8): green on a clean push, and a failing check stopping the deploy.

### 18.5 Neon
- **Starting state:** the project from the check is reused:
  - renamed, with its password reset, so the old connection strings stop working;
  - its schemas dropped in Neon's SQL Editor and rebuilt by the migrations (`pg_trgm` included: `CREATE EXTENSION` works as `neondb_owner`), and the dictionary loaded again (§18.8).
- **Connection strings:** `sslmode=verify-full` in place of Neon's `sslmode=require`, which node-postgres treats the same but warns about on every start (§16).
- **Roles:**
  - `neondb_owner` for the app (pooled connection) and the migrations (direct);
  - a read-only `backup` role for the backups, created in SQL by `backup:role` (§18.6) as `neondb_owner`, whose `neon_superuser` membership lets it create roles: `CONNECT`, `USAGE` on `public` and `drizzle`, `SELECT` on their tables and sequences, plus default privileges for the tables and sequences `neondb_owner` creates later.
- **History:** Neon Free keeps 6 hours, so any moment in the last 6 hours can be restored from the console.

### 18.6 Backups
**Built** (M12.5 code, 2026-10-27; settled with the user on 2026-10-27: the bucket, the sign-in data, the lock), and **live since 2026-10-28** (§18.9): the first backup was run by hand that day and restored in the drill. Neon's 6 hours of history (§18.5) stays beside it.
- **The nightly job:** `.github/workflows/backup.yml` runs every night at 02:17 UTC (`schedule`, `cron: "17 2 * * *"`: 03:17 in Berlin in winter, 04:17 in summer), and by hand when needed (`workflow_dispatch`: the restore drill, or before something risky). One run at a time (`concurrency: backup`, a second waits), 15 minutes at most, `contents: read` only. Its steps:
  1. checks out the repo (for the dump script; no dependency is installed, so no package's code runs beside the secrets);
  2. installs the PostgreSQL 17 client (`postgresql-client-17` from PostgreSQL's apt repository, added by the runner's own `apt.postgresql.org.sh`; the runner's 16 refuses Neon's 17) and `age` (Ubuntu's, 1.1.1);
  3. names the backup `YYYY-MM-DD-HHMM.dump.age`, Berlin time, so a run by hand on the day of a nightly one gets a name of its own (the lock refuses to overwrite a file);
  4. runs **`server/scripts/backup-dump.sh`** with `NEON_BACKUP_URL` (the direct connection as `backup`), `PGSSLROOTCERT=system` and `AGE_RECIPIENT`:
     - `pg_dump --format=custom`, leaving out the data of these tables (`--exclude-table-data=public.<table>`; the tables themselves stay), the script's one list (`EXCLUDED_TABLES`):
       - the dictionary, `dictionary_entries` and `dictionary_forms`, which `backup:restore` loads again;
       - the sign-ins, `auth_sessions`, `auth_verifications` and `auth_rate_limits` (the user, 2026-10-27), so a backup holds no session token that still works. After a restore everyone signs in again; passwords and Google links (`auth_accounts`) are kept;
     - **checks the dump** with `pg_restore --list` and fails the run unless it has the data of `users`, `user_words` and `drizzle.__drizzle_migrations`, has every excluded table and none of their data;
     - encrypts it with `age` to the public key; the plain dump lives in a private temporary folder (`umask 077`) that is removed however the script ends. It prints sizes and times, never the connection string;
  5. uploads the file with the runner's AWS CLI to the bucket's EU endpoint (`s3api put-object`, region `auto`) with its `Content-MD5`, which R2 checks on arrival; the CLI's newer default checksums are off (`AWS_REQUEST_CHECKSUM_CALCULATION` and `AWS_RESPONSE_CHECKSUM_VALIDATION` `when_required`, §16). Then `head-object` must find it with the same size and its MD5 as the ETag, or the run fails;
  6. removes the encrypted file from the runner (`if: always()`).
- **The excluded tables are kept honest by a test** (`server/test/backup/backup.test.ts`): each one is a table of `server/src/db/schema.ts`, and every table of the schema is either on a list of tables backed up whole or excluded, so a new or renamed table fails the test until it is placed. `backup.yml` lists no table of its own.
- **The bucket** (the user, 2026-10-27): `dingsda-app-backups` on Cloudflare R2, in the **EU jurisdiction**, so the files stay in the EU. Its endpoint is `https://<account id>.eu.r2.cloudflarestorage.com`, its token is made for that jurisdiction, and the jurisdiction can't be changed later. R2 needs a payment method even within its free tier.
- **30 days, locked:**
  - a **bucket lock** rule (the user, 2026-10-27) refuses to delete or overwrite a file younger than 30 days, whoever asks, GitHub's token included; only the Cloudflare login can remove the rule;
  - a lifecycle rule deletes files after 30 days (a lock wins over a lifecycle rule; both are 30 days), so there are about 30 backups, plus any run by hand. R2's free tier is 10 GB-month, and a backup is under 1 MB today (the Mac's word list: 94 KB, §18.9);
  - the cost: no backup can be deleted early, a mistaken one included. A deleted account stays in backups for at most 30 days either way (§4 Accounts).
- **The private `age` key** (an X25519 key from plain `age-keygen`; not its `-pq` keys, which the runner's age 1.1 can't use) is kept only by the user, in a password manager. GitHub and R2 hold only encrypted files; GitHub holds the public key as the repository variable `AGE_RECIPIENT`.
- **The read-only role** `backup` (§18.5), made by **`pnpm --filter server backup:role [role]`**, run as the owner (`neondb_owner`) on the direct connection with the password in `BACKUP_ROLE_PASSWORD` (from `deploy.env`, `openssl rand -hex 32`), so it is never typed, shown or kept in Neon's SQL Editor history; the password reaches Neon only in the `CREATE ROLE` statement over TLS. It grants `CONNECT`, `USAGE` on `public` and `drizzle`, `SELECT` on all their tables and sequences, and default privileges for the tables and sequences the owner creates later (`ALTER DEFAULT PRIVILEGES IN SCHEMA public, drizzle`), so a later migration's table is dumped without a new grant. Run again with a password it changes the password; without one, an existing role only gets its grants again (after a restore into Neon, below). It can read everything, session tokens included (pg_dump locks every table whose definition it dumps), so `NEON_BACKUP_URL` is a secret like the others. It is printed with the database first, like the other scripts.
- **Restore: `pnpm --filter server backup:restore <file.dump.age> [dictionary.jsonl]`** (decided in M12.5: the target is `DATABASE_URL`, as for every other script, not an argument, so no connection string with a password is ever typed; for Neon it comes from `deploy.env` as in §18.8):
  1. prints `Database: <host>/<name>`;
  2. checks that the file and the dictionary file are there, then refuses, changing nothing, a database that isn't empty: any table, view or sequence outside PostgreSQL's own schemas, or a `drizzle` schema. The Mac's own `.env` points at the dev database, which isn't empty, so a restore needs `DATABASE_URL` set to a new one;
  3. checks that `age` and PostgreSQL 17's `pg_restore` are there (Homebrew's keg-only `postgresql@17`, the runner's `/usr/lib/postgresql/17/bin`, or PATH; `--version` must say 17);
  4. asks for the private key at a hidden prompt, once (pasted from the password manager; piped in, the first line), and checks its shape (`AGE-SECRET-KEY-1` and 58 Bech32 characters) without ever repeating it;
  5. decrypts with `age --decrypt --identity -`, the key on age's stdin, straight into `pg_restore --no-owner --no-acl --single-transaction --exit-on-error`: no plain dump or key is ever on disk, in an argument or a log. The restoring role owns everything (as `neondb_owner` does on Neon). One transaction, so a failure (a wrong key, a damaged file) leaves the database empty again. `pg_restore` gets the URL without its password (which goes into `PGPASSWORD`), and `PGSSLROOTCERT=system` with `sslmode=verify-full` (§16);
  6. loads the dictionary as `import:wiktionary` does, from `data/kaikki/kaikki.org-dictionary-German.jsonl` unless another file is given (≈14 s on the Mac);
  7. prints every table's row count, as `db:counts` does.

  `pg_trgm` and the `drizzle` schema with `__drizzle_migrations` come back with the rest, so `pnpm db:migrate` then says "Database is up to date"; Better Auth's schema check passes, and new rows' ids go on from the backup's.
- **Row counts: `pnpm --filter server db:counts`** prints the exact row count of every table of `public` and `drizzle` in `DATABASE_URL`, in one read-only transaction, marking the tables backups leave out `(not in backups)`. On Neon the `backup` role is enough. The drill compares its output on Neon with the restored database's.
- **On the Mac** a restore needs `age` and the PostgreSQL 17 client: `brew install age postgresql@17` (installed 2026-10-27, age 1.3.2 and 17.11). `postgresql@17` is keg-only, so it doesn't replace Homebrew's `libpq` (18) on PATH; its server is never started (`brew services` stays off for it). The scripts find its `pg_restore` themselves.
- **Tests** (§13): `pnpm test` covers the exclusion list, the key's shape, libpq's connection, the counts, `backup:role`'s grants, and `backup:restore` refusing a database that isn't empty; **`pnpm test:backup`** runs a backup's whole round trip with the real tools (`backup-dump.sh`, `age`, `pg_dump`/`pg_restore` 17) on throwaway databases, and CI runs it after installing the tools as `backup.yml` does.
- **Failures:** a failed run emails the user (the notification setting of §18.8 step 7).
- **Later:** once there are other people's data or payments, an independent copy or Neon's paid 7-day history is considered (§15).

### 18.7 HTTPS on the LAN (with push notifications, §15)
- **What it gives:** a secure context on the iPhone over the LAN, with **mkcert**:
  - a local certificate authority on the Mac;
  - its root certificate installed on the iPhone and trusted under Settings → General → About → Certificate Trust Settings;
  - a certificate for `<Mac name>.local`, the LAN IP and `localhost`;
  - Vite's `server.https` set to use it, with the `.local` name added to `allowedHosts`.
- **Not for Google:** Google sign-in still wouldn't work there, since Google accepts only `localhost` or a public domain as a return address. M12 doesn't need it, so it comes with the first feature that needs a secure context on the phone during development: push notifications (or the microphone).

### 18.8 Going live, once (M12.4, done 2026-10-26)
The steps in order, done once by the user and Claude together. **You** marks what the user does by hand (a console, a password, a paste); **Claude** marks commands the session can run in the main checkout's root, which print no secret.
- **Secrets:** they live only in `deploy.env` at the repo root (git-ignored, readable only by you) and, where they must stay, in Vercel, GitHub and the password manager. Commands read them in a subshell, `( set -a; . ./deploy.env; set +a; … )`, so a secret never appears on a command line, in output or in shell history; values go to Vercel through stdin. Nobody pastes a secret into the chat.
- **The Vercel CLI** isn't installed: it runs as `npx -y vercel@63.1.2` (the newest release at least two weeks old on 2026-10-26), with the login made for `project add`.
- **Rehearsed on 2026-10-26** on the Mac against a fresh local database standing in for Neon: steps 1 and 3 as written (with a piped throwaway password for `user:claim`), the reset of step 2.4, and the built function with step 6's variables, answering as step 6 expects (§16, `docs/plan.md` M12.4).

1. **`deploy.env`** (Claude): the production secret and the keys the Mac already has, without showing them:
   ```sh
   umask 077 && touch deploy.env
   printf 'PROD_BETTER_AUTH_SECRET=%s\n' "$(openssl rand -base64 32)" >> deploy.env
   grep -E '^(GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|ANTHROPIC_API_KEY)=' .env >> deploy.env
   grep -o '^[A-Z_]*=' deploy.env    # names only
   ```
2. **Neon** (You, in Neon's console, the project from the check):
   1. Settings: rename it `dingsda`; check Frankfurt (`aws-eu-central-1`), PostgreSQL 17, autoscaling capped at 1 CU.
   2. Roles → `neondb_owner` → **Reset password**, so the probe's connection strings stop working.
   3. **Connect** (database `neondb`, role `neondb_owner`): copy the string with **Connection pooling** on (its host has `-pooler`) and off (direct). In both, `sslmode=require` becomes `sslmode=verify-full` (§18.5). Each goes from the clipboard straight into `deploy.env`, then Claude single-quotes the values and switches `sslmode` (the strings carry `&`, which breaks `. ./deploy.env` unquoted):
      ```sh
      printf 'NEON_POOLED_URL=%s\n' "$(pbpaste)" >> deploy.env     # copied with pooling on
      printf 'NEON_DIRECT_URL=%s\n' "$(pbpaste)" >> deploy.env     # copied with pooling off
      ```
      The result:
      ```sh
      NEON_POOLED_URL='postgresql://neondb_owner:…@ep-…-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require'
      NEON_DIRECT_URL='postgresql://neondb_owner:…@ep-….eu-central-1.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require'
      ```
   4. **SQL Editor** (database `neondb`): drop the probe's schema and dictionary.
      ```sql
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      ```
      If Neon refuses to drop `public`, delete the database `neondb` under **Databases** and create it again with the owner `neondb_owner`.
3. **The database,** from the Mac on the direct connection. Each command first prints `Database: <host>/<name>`: it must be Neon's `ep-…` host, never `localhost`.
   1. Claude: the migrations (with `CREATE EXTENSION pg_trgm`), the dictionary (≈30 s over the internet) and any invite for a second account to try:
      ```sh
      ( set -a; . ./deploy.env; set +a; DATABASE_URL="$NEON_DIRECT_URL" pnpm db:migrate )
      ( set -a; . ./deploy.env; set +a; DATABASE_URL="$NEON_DIRECT_URL" pnpm --filter server import:wiktionary data/kaikki/kaikki.org-dictionary-German.jsonl )
      ( set -a; . ./deploy.env; set +a; DATABASE_URL="$NEON_DIRECT_URL" pnpm --filter server invite:add <email> )
      ```
   2. You, in your own terminal: the developer account as user 1, with its production password typed hidden, twice (into the password manager too). It uses the Mac's `.env` only for `BETTER_AUTH_SECRET`, which signs nothing here.
      ```sh
      ( set -a; . ./deploy.env; set +a; DATABASE_URL="$NEON_DIRECT_URL" pnpm --filter server user:claim <email> <username> )
      ```
4. **Vercel** (Claude): link the project, check its protection, set production's variables.
   ```sh
   npx -y vercel@63.1.2 link --yes --project dingsda --team lazy-pixel    # writes .vercel/project.json (git-ignored)
   cat .vercel/project.json                                                # orgId and projectId: ids for GitHub, not secrets
   npx -y vercel@63.1.2 project protection dingsda --scope lazy-pixel
   ( set -a; . ./deploy.env; set +a
     secret() { printf %s "$2" | npx -y vercel@63.1.2 env add "$1" production --sensitive --force --yes; }
     plain() { printf %s "$2" | npx -y vercel@63.1.2 env add "$1" production --no-sensitive --force --yes; }
     secret DATABASE_URL "$NEON_POOLED_URL"
     secret BETTER_AUTH_SECRET "$PROD_BETTER_AUTH_SECRET"
     secret GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET"
     secret ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"
     plain GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID"
     plain BETTER_AUTH_URL https://dingsda.vercel.app
     plain APP_TIME_ZONE Europe/Berlin
     plain SIGNUP_MODE invite )
   grep -E '^(AI_MODEL_|AI_EFFORT|DAILY_)' .env      # model names and limits, not secrets
   npx -y vercel@63.1.2 env ls production
   ```
   - The AI models, `AI_EFFORT` and the daily limits are added as plain variables only where the Mac's `.env` differs from the defaults (§18.3).
   - **Protection:** it must be Vercel Authentication with Standard Protection (deployment addresses need a Vercel login, the production domain doesn't). Otherwise, You: the dashboard → `dingsda` → Settings → **Deployment Protection** → Vercel Authentication, **Standard Protection**, Save.
   - The Anthropic key's credit is the €5 prepaid without auto top-up (`docs/plan.md`, M12).
5. **Google** (You, Google Cloud console): the OAuth client of §14 → **Authorized redirect URIs** → add `https://dingsda.vercel.app/api/auth/callback/google`, keeping `http://localhost:5173/…` → Save. No JavaScript origin is needed (the server makes the exchange); if the console asks for the domain under **Branding → Authorized domains**, add `dingsda.vercel.app`. A new address can take a few minutes to work.
6. **The first deployment, from the Mac** (Claude), with the M12.4 commit made but not pushed (a push would run the deploy job before its secrets exist). It becomes production; `pnpm dev` can keep running.
   ```sh
   npx -y vercel@63.1.2 pull --yes --environment=production
   npx -y vercel@63.1.2 build --prod
   npx -y vercel@63.1.2 deploy --prebuilt --prod     # prints the deployment's own address
   rm -f .vercel/.env.production.local               # what pull wrote: plain values and a short-lived Vercel token
   ```
   Then the checks (Claude):
   ```sh
   curl -s https://dingsda.vercel.app/api/health                                          # {"status":"ok"}
   curl -s https://dingsda.vercel.app/api/sign-in-options                                  # {"google":true}
   curl -s -o /dev/null -w '%{http_code}\n' https://dingsda.vercel.app/api/stats           # 401
   curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://dingsda.vercel.app/words                 # 200 text/html
   curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://dingsda.vercel.app/manifest.webmanifest
   curl -s -o /dev/null -w '%{http_code}\n' <the deployment's own address>/api/health      # 401: Vercel's login
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://dingsda.vercel.app/api/auth/sign-in/username \
     -H 'Origin: https://dingsda.vercel.app' -H 'Content-Type: application/json' \
     -H 'X-Vercel-Forwarded-For: 203.0.113.9' -H 'X-Forwarded-For: 203.0.113.9' -H 'X-Real-Ip: 203.0.113.9' \
     -d '{"username":"nobody_here","password":"not a password"}'                         # 401
   ```
   - **The client's address** (You, Neon's SQL Editor): `SELECT key, count FROM auth_rate_limits;` must show the Mac's public address in front of `|/sign-in/username`, not `203.0.113.9` and not `no-trusted-ip`. With `203.0.113.9`, Vercel passed the forged header on: Claude switches `VERCEL_CLIENT_IP` (`server/src/auth/auth.ts`) to `x-real-ip` and its tests, rebuilds, deploys and checks again. With `no-trusted-ip`, the header didn't arrive.
   - **The M12 demo** (You, the iPhone on mobile data, Wi-Fi off):
     1. Safari, `https://dingsda.vercel.app`: sign in with the password; Home with an empty list (production starts fresh); a photo import, its review and save; practise its words.
     2. Safari: sign out, **Continue with Google** with your own Gmail: back on Home as the developer account (its verified email links Google by itself, §4 Accounts); Account shows Google connected.
     3. **The Home Screen app** (the check first in the plan): Share → **Add to Home Screen**, open it, sign in with the password (it keeps cookies of its own), sign out, then **Continue with Google**. If it comes back into the Home Screen app signed in, Google stays; if it ends in Safari, or in a Safari view that doesn't sign the app in, note it: a small follow-up hides Google in standalone mode (`display-mode: standalone`), offering the password only.
   - A 500's "request fra1::…" is found in the dashboard → `dingsda` → Logs (an hour on Hobby).
7. **GitHub** (You):
   1. vercel.com → Account Settings → **Tokens** → Create: scope `lazy-pixel` (limited to the `dingsda` project if it offers that), an expiry such as a year (with a reminder to renew). Copy it straight into GitHub's form, nowhere else.
   2. github.com → `AntonSplavnik/language-app` → Settings → **Secrets and variables → Actions** → New repository secret, four times: `VERCEL_TOKEN` (the token); `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (`orgId` and `projectId` from `.vercel/project.json`); `NEON_MIGRATE_URL` (`NEON_DIRECT_URL` from `deploy.env`, copied in an editor).
   3. Your GitHub settings → Notifications → **Actions**: on, "Only notify for failed workflows", for the failure emails.
8. **The push** (Claude): `git push origin main`. You watch github.com → Actions → **CI**: Checks green, then Deploy green (pull, build, "Database is up to date", deploy); a new production deployment in Vercel; `/api/health` again.
9. **A failing check stops the deploy,** tried once on a branch (Claude): on a new branch `ci-trial`, add `ci-trial` beside `main` under `on.push.branches` in `ci.yml` and to the deploy job's `if` (`|| github.ref == 'refs/heads/ci-trial'`), and a test that fails (`server/test/ci-trial.test.ts`, `expect(true).toBe(false)`); commit, `git push -u origin ci-trial`. Expected: Checks red at `pnpm test`, Deploy **skipped**, no new deployment in Vercel, Neon untouched. Then `git switch main`, `git branch -D ci-trial`, `git push origin --delete ci-trial`.
10. **Afterwards** (Claude): `rm deploy.env`. Nothing in it is lost: Neon's strings are in its console, the other secrets in Vercel, GitHub and the password manager. A later script on Neon (`user:set-password`, `user:ai`, `invite:add`) gets a new `deploy.env` with `NEON_DIRECT_URL` from Neon's console. `docs/plan.md` records what went live, and anything found.

**How going live went (2026-10-26),** where it differed from the steps above, and what it confirmed:
- **Neon:** renamed `dingsda` and the password reset; `DROP SCHEMA public` worked as `neondb_owner`. Both strings connected (PostgreSQL 17.11) to an empty `neondb`. The migrations made 15 tables, the `drizzle` schema and `pg_trgm`; the dictionary took 29 s (98,308 entries, 249,020 forms, as on the Mac). `user:claim` gave user 1 the developer's Gmail, verified, with AI on. `migrate.ts` and `import-wiktionary.ts` didn't print `Database: …` as step 3 says; they do since.
- **`vercel link`** also wrote `.env.local` (a short-lived `VERCEL_OIDC_TOKEN`) and appended `.vercel` and `.env*` to `.gitignore` (the latter would match `.env.example`): both undone. `vercel pull` writes `.env.local` again; delete it after.
- **Protection** was already Standard: the API and `vercel project protection` call it `ssoProtection.deploymentType: "all_except_custom_domains"`. The production domain answers without a login; a deployment's own address answers 302 to Vercel's login (not 401).
- **Region:** the project's default function region was `iad1`; set to `fra1` (`PATCH /v9/projects/dingsda`, `serverlessFunctionRegion`). The function runs in `fra1` (`x-vercel-id: fra1::fra1::…`).
- **Variables:** the nine of §18.3 (four sensitive), plus `DAILY_PHOTO_LIMIT=20`, which the Mac's `.env` has instead of the default.
- **The first deployment** came from the Mac (`vercel build --prod`, ≈6 s; `deploy --prebuilt --prod`). Health answers in ≈0.3 s from Berlin.
- **The client's address:** the forged `203.0.113.9` in all three headers was ignored; the rate limit's key held the Mac's public address. `x-vercel-forwarded-for` stays. (A username with `-` is refused with 422 before the password, hence `nobody_here` in step 6.)
- **The iPhone,** on Wi-Fi and on mobile data: password and Google sign-in in Safari, a photo import (Call 1 in 11 s, 44 words, all enriched), a practice session; and Google in the Home Screen app (§16).
- **GitHub's secrets** were set with `gh secret set` (the GitHub CLI, installed 2026-10-26) from the user's own terminal: the ids from `.vercel/project.json`, `NEON_MIGRATE_URL` from `deploy.env`, the token at a hidden prompt; Claude Code's auto mode refused to set them from the session. The Vercel token is `github-actions-dingsda`, scope `lazy-pixel`, valid one year (until ≈2027-10-26): **renew it before then**, or deploys fail.
- **CI:** the first push ran green: Checks 2 min 34 s, Deploy 1 min 4 s ("Database is up to date", a new production deployment). The trial on `ci-trial`: Checks red at `pnpm test`, Deploy skipped, no deployment; the branch was deleted.

**Confirmed before going live, and what only going live confirmed** (all of it, on 2026-10-26):
- **Confirmed** on the Mac: the build and its output, `vercel build` keeping our output (offline, §16), `deploy --prebuilt` needing nothing more than `.vercel/output` (the CLI's source), the bundled function with production's variables (`pnpm test:bundle` and the rehearsal), the migrations and dictionary on a fresh database and after the reset, the workflow's syntax (`actionlint`).
- **Going live:** the token's access for `pull`, `build` and `deploy` (a project-scoped token isn't documented for them on Hobby; a team-scoped one works), Vercel setting `x-vercel-forwarded-for` and overwriting a forged one (step 6), Neon taking `DROP SCHEMA public` from `neondb_owner`, the protection setting, Google's new return address, the Home Screen app's Google sign-in, and the workflow itself (steps 8 and 9).

### 18.9 Going live with backups (M12.5, done 2026-10-28)
The steps in order, done once by the user and Claude together, as in §18.8: **You** marks what the user does by hand (a console, the key, a paste, a GitHub secret); **Claude** marks commands the session can run in the main checkout's root, which print no secret.
- **Secrets** live only in `deploy.env` at the repo root (git-ignored, readable only by you, values single-quoted, read in a subshell `( set -a; . ./deploy.env; set +a; … )`), in GitHub's secrets and, for the private key, in the password manager. Nobody types, prints or pastes a secret into the chat. The private key never touches a file or the session: only the user sees it, and only the public key is shared.
- **The Mac's prerequisites:** `brew install age postgresql@17` (done during the build, 2026-10-27: age 1.3.2, PostgreSQL 17.11, keg-only; never start its server). `gh` is installed and signed in (§18.8).
- **Rehearsed on 2026-10-27** on the Mac, without the accounts: a stand-in for Neon (a database owned by a role that isn't a superuser but can create roles, as `neondb_owner`, with a copy of the dev database's rows), `backup:role` and step 4's URL, `backup-dump.sh` as the workflow runs it (throwaway key pair; the upload skipped), the drill of step 8 (counts equal but for the sign-ins), and the procedure below into the stand-in after its reset (`docs/plan.md`, M12.5).

1. **`deploy.env`** (Claude): the `backup` role's password, made here and never shown.
   ```sh
   umask 077 && touch deploy.env
   printf "BACKUP_ROLE_PASSWORD='%s'\n" "$(openssl rand -hex 32)" >> deploy.env
   ```
2. **The age key pair** (You, in your own terminal; the session never sees the private key):
   1. Make it, with the private key going only to the clipboard (the public key is printed):
      ```sh
      age-keygen | grep '^AGE-SECRET-KEY-1' | pbcopy
      ```
   2. In the password manager, a new entry "Dingsda backups (age key)": paste the private key as its password; the public key (`age1…`) in its notes.
   3. Check what was saved: copy the password from the entry again, then this must print the same `age1…`:
      ```sh
      pbpaste | age-keygen -y
      ```
   4. Empty the clipboard (and delete the entry from a clipboard-history app, if one is on):
      ```sh
      pbcopy < /dev/null
      ```
   5. Tell Claude the public key `age1…` (it isn't secret). No key file was written.
3. **Cloudflare** (You, dash.cloudflare.com):
   1. **R2 Object Storage:** subscribe to R2 (the checkout asks for a card or PayPal, even within the free tier).
   2. **Create bucket:** name `dingsda-app-backups`; Location → **Specify jurisdiction** → **European Union (EU)**; storage class Standard. The jurisdiction can't be changed later.
   3. The bucket → Settings → **Bucket lock rules** → Add rule: name `keep-30-days`, no prefix (the whole bucket), retain for **30 days** → Save.
   4. The bucket → Settings → **Object lifecycle rules** → Add rule: name `delete-after-30-days`, the whole bucket, delete objects **30 days** after upload → Save (leave R2's own rule for unfinished multipart uploads as it is).
   5. R2 → **Manage API tokens** → Create API token: permission **Object Read & Write**, applied to the bucket `dingsda-app-backups` only (the EU jurisdiction), TTL **Forever** (it can only read and add encrypted files, and the lock stops deletes; a failed run would email anyway). Cloudflare shows the **Access Key ID** and **Secret Access Key** once. Copy each in turn; after each copy Claude appends it from the clipboard (nothing printed):
      ```sh
      printf "R2_ACCESS_KEY_ID='%s'\n" "$(pbpaste)" >> deploy.env        # copied: Access Key ID
      printf "R2_SECRET_ACCESS_KEY='%s'\n" "$(pbpaste)" >> deploy.env    # copied: Secret Access Key
      ```
   6. The **Account ID** (R2's overview page, or the S3 endpoint `https://<account id>.eu.r2.cloudflarestorage.com` the token page shows): copy it, then Claude:
      ```sh
      printf "R2_ACCOUNT_ID='%s'\n" "$(pbpaste)" >> deploy.env
      ```
4. **Neon:**
   1. You: Neon's console → `dingsda` → **Connect** (database `neondb`, role `neondb_owner`, **Connection pooling off**) → copy the string. Claude appends it, switches it to `verify-full` (§18.5) and lists the names only:
      ```sh
      printf "NEON_DIRECT_URL='%s'\n" "$(pbpaste)" >> deploy.env
      sed -i '' 's/sslmode=require/sslmode=verify-full/' deploy.env
      grep -o '^[A-Z_0-9]*=' deploy.env
      ```
   2. Claude: the role, as `neondb_owner`; the first line must be Neon's `ep-…` host, the last `Role backup: created`:
      ```sh
      ( set -a; . ./deploy.env; set +a; DATABASE_URL="$NEON_DIRECT_URL" pnpm --filter server backup:role )
      ```
   3. Claude: `NEON_BACKUP_URL`, the direct string with the user `backup` and its password (the rest, `sslmode=verify-full&channel_binding=require` included, as it is):
      ```sh
      ( set -a; . ./deploy.env; set +a; printf "NEON_BACKUP_URL='%s'\n" "$(node -e 'const u = new URL(process.env.NEON_DIRECT_URL); u.username = "backup"; u.password = process.env.BACKUP_ROLE_PASSWORD; console.log(u.href)')" >> deploy.env )
      ```
   4. Claude: both ways the string is used, as `backup`: node-postgres (`db:counts`, the drill's), and libpq with the system's certificate authorities, as the workflow runs it (a schema-only dump to nowhere, which also takes every table's lock):
      ```sh
      ( set -a; . ./deploy.env; set +a; DATABASE_URL="$NEON_BACKUP_URL" pnpm --filter server db:counts )
      ( set -a; . ./deploy.env; set +a; PGSSLROOTCERT=system /opt/homebrew/opt/postgresql@17/bin/pg_dump --schema-only --file=/dev/null --dbname="$NEON_BACKUP_URL" && echo "pg_dump: OK" )
      ```
5. **GitHub** (You, in your own terminal: Claude Code's auto mode refuses `gh secret set`). One command at a time; each reads its value from `deploy.env` and prints only a confirmation. Claude fills in the public key in the last one:
   ```sh
   ( set -a; . ./deploy.env; set +a; printf %s "$NEON_BACKUP_URL" | gh secret set NEON_BACKUP_URL --repo AntonSplavnik/language-app )
   ( set -a; . ./deploy.env; set +a; printf %s "$R2_ACCOUNT_ID" | gh secret set R2_ACCOUNT_ID --repo AntonSplavnik/language-app )
   ( set -a; . ./deploy.env; set +a; printf %s "$R2_ACCESS_KEY_ID" | gh secret set R2_ACCESS_KEY_ID --repo AntonSplavnik/language-app )
   ( set -a; . ./deploy.env; set +a; printf %s "$R2_SECRET_ACCESS_KEY" | gh secret set R2_SECRET_ACCESS_KEY --repo AntonSplavnik/language-app )
   gh variable set AGE_RECIPIENT --repo AntonSplavnik/language-app --body 'age1…'
   ```
   Then Claude: `gh secret list --repo AntonSplavnik/language-app` (eight names: §18.8's four and these four) and `gh variable list --repo AntonSplavnik/language-app` (`AGE_RECIPIENT`).
6. **The push** (Claude), once M12.5's commit has passed review: `git push origin main`. CI runs the checks, now with "Install the PostgreSQL 17 client and age" and "Backup test" (≈30–40 s more; this also proves `backup.yml`'s install step on the runner), then the deploy ("Database is up to date": M12.5 has no migration). The push brings `backup.yml` to `main`, where schedules run.
7. **A backup by hand** (Claude), then its file:
   ```sh
   gh workflow run backup.yml --repo AntonSplavnik/language-app
   gh run watch --repo AntonSplavnik/language-app
   ```
   - The log shows `Dumped: … bytes`, `Checked: 11 tables with data; none for dictionary_entries …`, `Encrypted: …` and `Uploaded: dingsda-app-backups/YYYY-MM-DD-HHMM.dump.age, … bytes`.
   - Claude, right away: Neon's counts at the moment of the backup, for the drill (don't practise until step 8 is done):
     ```sh
     ( set -a; . ./deploy.env; set +a; DATABASE_URL="$NEON_BACKUP_URL" pnpm --filter server db:counts )
     ```
   - You: the bucket → **Objects**: the file is there with that size. Its delete must be refused (the dashboard disables or refuses it for a locked object): try it once.
8. **The drill** (the M12.5 demo):
   1. You: download the file from the bucket's Objects into `~/Downloads`. The dashboard may save it under another name (`R2 Object Storage Oct 28 2026.dump.age` on 2026-10-28): rename it to the object's name, or use the name it has.
   2. Claude: a new, empty database on the Mac:
      ```sh
      docker exec language-app-db-1 createdb -U app language_app_drill
      ```
   3. You, in your own terminal: the restore; `Database: localhost:5432/language_app_drill` first, then paste the private key from the password manager at the hidden prompt, then `pbcopy < /dev/null`:
      ```sh
      DATABASE_URL=postgres://app:app@localhost:5432/language_app_drill pnpm --filter server backup:restore ~/Downloads/<file>.dump.age
      ```
   4. Claude: the restored counts against step 7's, and the migrations' check:
      ```sh
      DATABASE_URL=postgres://app:app@localhost:5432/language_app_drill pnpm --filter server db:counts
      DATABASE_URL=postgres://app:app@localhost:5432/language_app_drill pnpm db:migrate
      ```
      Every table must have Neon's count, but `auth_sessions`, `auth_verifications` and `auth_rate_limits` (0, not in backups); the dictionary's two match Neon's when Neon's was loaded from the same file (98,308 and 249,020). `db:migrate` says "Database is up to date".
9. **The next morning** (Claude): `gh run list --workflow backup.yml --repo AntonSplavnik/language-app --limit 3` shows a `schedule` run, green, started at about 02:17 UTC (GitHub can start schedules late); You: its `YYYY-MM-DD-03xx.dump.age` (Berlin time; `-04xx` in summer) is in the bucket.
10. **Afterwards** (Claude): `rm deploy.env`, `rm ~/Downloads/<file>.dump.age` and `docker exec language-app-db-1 dropdb -U app language_app_drill`. Nothing is lost: the R2 keys and `NEON_BACKUP_URL` are in GitHub (a new R2 token or a new `backup` password, with `backup:role`, replaces them if ever needed), the private key in the password manager. `docs/plan.md` records what went live, and anything found.

**Restoring production into Neon** (written, not drilled; the local stand-in was, §18.9's rehearsal). For damage found within 6 hours, Neon's own history is quicker and loses less (the console → Branches → `main` → **Restore** to a moment before it). Otherwise, from the latest backup before the damage:
1. You: download that file from the bucket into `~/Downloads`. In Neon's console, keep the damaged state first: Branches → **Create branch** from `main` (`damaged-<date>`), deleted once all is well.
2. Claude: a new `deploy.env` with `NEON_DIRECT_URL` (step 4.1 above, or `docs/commands.md`, production steps 1–4).
3. You, Neon's SQL Editor (database `neondb`): empty it, as §18.8 step 2.4 did. From here until step 5 the app answers errors.
   ```sql
   DROP SCHEMA IF EXISTS drizzle CASCADE;
   DROP SCHEMA public CASCADE;
   CREATE SCHEMA public;
   ```
4. You, in your own terminal: the restore as `neondb_owner` (≈30 s for the dictionary over the internet). The first line must be Neon's `ep-…` host; then paste the private key, then `pbcopy < /dev/null`:
   ```sh
   ( set -a; . ./deploy.env; set +a; DATABASE_URL="$NEON_DIRECT_URL" pnpm --filter server backup:restore ~/Downloads/<file>.dump.age )
   ```
5. Claude: the `backup` role's grants again (the reset dropped them and the restore leaves grants out), the migrations' check, Neon's counts and the app:
   ```sh
   ( set -a; . ./deploy.env; set +a; DATABASE_URL="$NEON_DIRECT_URL" pnpm --filter server backup:role )
   ( set -a; . ./deploy.env; set +a; DATABASE_URL="$NEON_DIRECT_URL" pnpm db:migrate )
   ( set -a; . ./deploy.env; set +a; DATABASE_URL="$NEON_DIRECT_URL" pnpm --filter server db:counts )
   curl -s https://dingsda.vercel.app/api/health
   ```
   `backup:role` says "grants renewed"; `db:migrate` "Database is up to date". You: sign in on the iPhone and check the word list.
6. Claude: `rm deploy.env` and the downloaded file. The next nightly backup runs as before.

**What a restore loses:** everything after the backup's time (at most about a day of practice, imports and new accounts), and every sign-in: every device signs in again, with passwords and Google links kept. The rate limits start again from zero. The developer account and every other keep their ids, so nothing else changes.

**How going live went (2026-10-28),** where it differed from the steps above, and what it confirmed:
- **The key pair** was made by the user as step 2 says; the private key is only in the password manager, checked with `age-keygen -y`. `AGE_RECIPIENT` is `age1v7enrset0wljnkk3wpdq6v8wgvc2ct3usd975aarkzr9atu5cs8s2jykcp`.
- **Cloudflare:** the bucket in the EU jurisdiction, the lock rule `keep-30-days`, the lifecycle rule `delete-after-30-days`, and the token (Object Read & Write on the bucket, TTL **Forever**, the user's choice). The user ran the clipboard appends of steps 3.5, 3.6 and 4.1 in their own terminal, which saves a round trip per value. Before GitHub, Claude tried the token with a read-only listing of the bucket on the EU endpoint, the keys going to curl through stdin (`printf 'user = "%s:%s"\n' … | curl -K - --aws-sigv4 "aws:amz:auto:s3" "https://$R2_ACCOUNT_ID.eu.r2.cloudflarestorage.com/dingsda-app-backups?list-type=2"`): 200.
- **Neon:** the owner's direct string was copied again from the console (M12.4's `deploy.env` was deleted, and Vercel and GitHub can't read secrets back). `backup:role` as `neondb_owner`: `Role backup: created`, so Neon takes `CREATE ROLE` and the grants from it. As `backup`, `db:counts` (node-postgres) and `pg_dump --schema-only` (libpq, `PGSSLROOTCERT=system`, `verify-full`) both worked.
- **GitHub:** the four secrets and `AGE_RECIPIENT` set by the user with `gh` from their terminal, as step 5 says.
- **The push** (`a04abf0`): Checks 2 min 56 s, the PostgreSQL 17 client and age installed and `pnpm test:backup` green on the runner; Deploy 1 min 8 s.
- **The backup by hand** (run 40671392730, under a minute): `Dumped: 57294 bytes in 16 s` (Neon waking up; 0.5 s on the Mac), `Checked: 11 tables with data`, `Encrypted: 57494 bytes`, `Uploaded: dingsda-app-backups/2026-10-28-1121.dump.age`, its size and ETag checked. The dashboard refused to delete it.
- **The drill:** the downloaded file was named `R2 Object Storage Oct 28 2026.dump.age` (renamed; step 8.1 says so now). The user ran `backup:restore` in their own terminal: the hidden prompt needs a terminal, and the private key never passes through the session. Every table's count equals Neon's taken right after the backup, apart from `auth_sessions` (1) and `auth_rate_limits` (7), which are 0; the dictionary was reloaded (98,308 entries and 249,020 forms); `db:migrate` up to date. Beyond the runbook, an `md5` of each backed-up table's rows as text was identical on Neon and the restore.
- **Comparing Neon with the Mac:** Neon's `neondb` sorts text as `C.UTF-8`, the Mac's Docker databases as `en_US.utf8`, which order `_` differently (`user_words` before or after `users`). Anything that compares sorted text or sorted lines between the two must sort with `COLLATE "C"`. A first checksum comparison didn't, and its lines paired the wrong tables. Neon's sessions default to `GMT`, the Mac's to `Etc/UTC`; the values print the same.
- **Afterwards:** `deploy.env`, the downloaded file and `language_app_drill` deleted.
- **The first scheduled run, 2026-10-29, never started.** The workflow was active and valid (the run by hand had worked), but by 07:20 UTC GitHub had started no `schedule` run of it, and a run that never starts emails nobody. The likeliest cause was the new `timezone:` key, so the schedule moved to plain UTC (`17 2 * * *`, the user, 2026-10-29). **Still to check:** the first UTC run, 2026-10-30 at about 02:17 UTC (step 9). A dead man's switch (a ping on every successful backup to a service that emails when a day passes without one, e.g. healthchecks.io) would catch a schedule that silently stops; proposed, not decided.

**Confirmed before going live, and what only going live confirms:**
- **Confirmed** on the Mac (2026-10-27): the role's SQL as a non-superuser owner and `pg_dump` as the role it makes (every table locked and read, a table made later too); `backup-dump.sh` with its check and encryption; `backup:restore` from a piped key into an empty database, as the Mac's `app` and as a non-superuser owner after §18.8's reset; the counts equal but for the sign-in tables; `db:migrate` up to date afterwards; the workflow's syntax and its shell (`actionlint` 1.7.12 with shellcheck).
- **Only going live:** the install step on the runner (CI's backup test proves it on the push, step 6); Neon taking `CREATE ROLE` and the grants from `neondb_owner`, and `pg_dump` as `backup` finding nothing it can't read (step 4.4); libpq's `verify-full` against Neon with `PGSSLROOTCERT=system` (step 4.4 on the Mac, step 7 on the runner); the token's access to the EU bucket, the upload with `Content-MD5` and the ETag check (step 7); the lock refusing a delete (step 7); the schedule's time zone (step 9); and the restore into Neon itself, which stays written, not drilled. All but the schedule's time zone were confirmed on 2026-10-28 (above).
