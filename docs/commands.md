# Commands cheat sheet

The commands for running and looking after the app, for the user. Run each one in the repo folder (`cd ~/Documents/Programming/Projects/language-app`), one at a time; every command is one line. The full list, with what each does in detail, is in `CLAUDE.md` (Commands) and `docs/design.md` §14.

## Start and stop on the Mac

### 1. Start the database (Docker Desktop must be open)
```sh
docker compose up -d
```

### 2. Start the app (migrates the dev database first)
```sh
pnpm dev
```
Then open `http://localhost:5173` on the Mac, or `http://<Mac IP>:5173` on the iPhone on the same Wi-Fi. Stop it with Ctrl+C.

### 3. Stop the database when you're done
```sh
docker compose stop
```
`docker compose down` is also safe. **Never** `docker compose down -v`: the `-v` deletes the Mac's databases, its word list and dictionary.

## Accounts on the Mac

These work on the Mac's database (`localhost`). Each prints `Database: <host>/<name>` first.

### Invite someone (needed only while sign-up is invite-only, `SIGNUP_MODE=invite`)
While testing (M12.7) the Mac and production run `SIGNUP_MODE=open`: anyone can create an account, with AI off, and the invite list isn't checked. It stays, for a return to `invite`.
```sh
pnpm --filter server invite:add friend@example.com
```

### See the invite list (who is invited, which invites are used)
```sh
pnpm --filter server invite:list
```

### Take an email off the invite list (an account made with it stays)
```sh
pnpm --filter server invite:remove friend@example.com
```

### Switch an account's AI on (photo and PDF import, Ask AI, example sentences)
```sh
pnpm --filter server user:ai friend@example.com on
```

### Switch it off
```sh
pnpm --filter server user:ai friend@example.com off
```

### Set a new password (asks for it hidden, twice; signs the account out everywhere)
```sh
pnpm --filter server user:set-password lazypixel
```

### See every account (how it signs in, AI, words, when created and last active; only reads)
```sh
pnpm --filter server user:list
```
Times are Berlin time. Last active is when the app was last opened on any device, to within a day; `—` means signed out everywhere.

### Delete an account and everything in it (asks you to type its username back)
```sh
pnpm --filter server user:delete friend@example.com
```
It shows the account and what will go, then asks for its username: type it (any case) and press Return to delete. Anything else, an empty line or Ctrl+C keeps it and says "Not deleted.". There is no undo, and your own account is treated like any other.

Accounts are named by email or username, in any case. A learner can also delete their own account in Settings → Account.

## Accounts in production (`https://dingsda.vercel.app`, Neon)

The same commands with `pnpm prod` in front run on production's database (Neon) instead of the Mac's. Neon's connection string stays in `deploy.env` at the repo root (git-ignored, readable only by you), so it is never typed or shown.

### Once: put Neon's connection string into `deploy.env`
1. In Neon's console: Connect → turn Connection pooling **off** → copy the connection string.
2. Write it from the clipboard into `deploy.env`, readable only by you:
```sh
(umask 077; printf "NEON_DIRECT_URL='%s'\n" "$(pbpaste)" > deploy.env)
```
3. Check it: the first line must say `Database: ep-…neon.tech/neondb`, not `localhost`.
```sh
pnpm prod user:list
```
If Neon's password is ever reset, do these three steps again.

Each command below prints `Database: <host>/<name>` first: check it says `ep-…neon.tech/neondb`. Without `pnpm prod` in front, the same command uses the Mac's database.

### Invite someone (needed only while sign-up is invite-only, `SIGNUP_MODE=invite`)
```sh
pnpm prod invite:add friend@example.com
```

### See the invite list
```sh
pnpm prod invite:list
```

### Take an email off the invite list
```sh
pnpm prod invite:remove friend@example.com
```

### Switch an account's AI on
```sh
pnpm prod user:ai friend@example.com on
```

### Switch it off
```sh
pnpm prod user:ai friend@example.com off
```

### Set a new password (asks for it hidden, twice; signs the account out everywhere)
```sh
pnpm prod user:set-password lazypixel
```

### See every account (only reads)
```sh
pnpm prod user:list
```

### Delete an account and everything in it (asks you to type its username back)
```sh
pnpm prod user:delete friend@example.com
```
Copies remain for a while after it: Neon's history keeps the account for 6 hours, and the nightly backups for up to 30 days (nobody can shorten that).

### Inviting a friend to production, start to finish
While sign-up is open (M12.7, testing) they skip step 1 and just create an account; you need only step 3, to switch their AI on.
1. `pnpm prod invite:add their@email.com`
2. They open `https://dingsda.vercel.app` and create an account, with a password or Continue with Google. New accounts have AI off.
3. If they should have AI: `pnpm prod user:ai their@email.com on`

## Before pushing

### Type check
```sh
pnpm typecheck
```

### Lint and format check
```sh
pnpm check
```

### Fix the formatting it complains about
```sh
pnpm format
```

### All tests (never calls Claude)
```sh
pnpm test
```

### The Vercel bundle test (builds, then runs the bundled API on the test database)
```sh
pnpm test:bundle
```

### The backup test (a backup's round trip on throwaway databases)
```sh
pnpm test:backup
```

## Deploying to production

A push to `main` deploys: GitHub runs the checks (≈3 min with the backup test), then Neon's migrations and the Vercel deploy (≈1 min). A push that changes only `*.md` files or `docs/` runs nothing. Nothing is deployed by hand.

### Push
```sh
git push origin main
```

### See the latest CI runs
```sh
gh run list --repo AntonSplavnik/language-app --limit 5
```

### Follow the newest run until it finishes
```sh
gh run watch --repo AntonSplavnik/language-app
```

### Show only the failed steps' log of a run (the number from `gh run list`)
```sh
gh run view <run-id> --repo AntonSplavnik/language-app --log-failed
```

### Is production up?
```sh
curl -s https://dingsda.vercel.app/api/health
```
It answers `{"status":"ok"}`. Production's server logs (one hour on Hobby) are in Vercel's dashboard → `dingsda` → Logs.

### Production's row counts (every table; only reads)
```sh
pnpm prod db:counts
```

## Backups

Every night at 02:17 UTC (03:17 in Berlin in winter, 04:17 in summer) GitHub backs up production's database, encrypted with your `age` key, to the Cloudflare R2 bucket `dingsda-app-backups`, where each file stays 30 days and can't be deleted sooner. A failed backup emails you. The full story is in `docs/design.md` §18.6, the first setup and the restore into Neon in §18.9.

### 1. Run a backup now (before something risky)
```sh
gh workflow run backup.yml --repo AntonSplavnik/language-app
```

### 2. Follow it until it finishes
```sh
gh run watch --repo AntonSplavnik/language-app
```

### 3. See the latest backup runs (nightly ones say `schedule`)
```sh
gh run list --workflow backup.yml --repo AntonSplavnik/language-app --limit 5
```
The files themselves are in Cloudflare's dashboard → R2 → `dingsda-app-backups` → Objects, named `YYYY-MM-DD-HHMM.dump.age`.

### Restore a backup on the Mac, to look at it (download the file from R2 first)
Cloudflare's download may get another name, such as `R2 Object Storage Oct 28 2026.dump.age`: use the name it has in `~/Downloads`.

#### 1. Make an empty database for it
```sh
docker exec language-app-db-1 createdb -U app language_app_drill
```

#### 2. Restore into it (asks for the private key from the password manager, hidden)
```sh
DATABASE_URL=postgres://app:app@localhost:5432/language_app_drill pnpm --filter server backup:restore ~/Downloads/<file>.dump.age
```
It restores only into an empty database: it refuses the Mac's own database and changes nothing there. Afterwards, empty the clipboard: `pbcopy < /dev/null`.

#### 3. Its row counts (the same command shows any database's)
```sh
DATABASE_URL=postgres://app:app@localhost:5432/language_app_drill pnpm --filter server db:counts
```

#### 4. Delete it when you're done
```sh
docker exec language-app-db-1 dropdb -U app language_app_drill
```

Restoring production itself after a disaster is a longer procedure, done with Claude: `docs/design.md` §18.9, "Restoring production into Neon".

## AI (costs money)

### Real Claude calls, after changing anything under `server/src/ai` (≈1¢ on Haiku)
```sh
pnpm test:live
```

### Try the photo reading on one photo (words, tokens, time, cost)
```sh
pnpm --filter server ai:try extract path/to/photo.jpg
```

## Dictionary

### What the dictionary has for a word
```sh
pnpm --filter server dict:lookup Bank noun die
```

### Reload the dictionary into the Mac's database (≈15 s)
It also loads the dictionary's themes from `server/data/dictionary-themes.tsv` and gives your saved words without themes theirs; until that file exists it says so and loads none.
```sh
pnpm --filter server import:wiktionary data/kaikki/kaikki.org-dictionary-German.jsonl
```

### Reload the dictionary into production's database (≈30 s; after `server/data/dictionary-themes.tsv` changes)
```sh
pnpm prod import:wiktionary data/kaikki/kaikki.org-dictionary-German.jsonl
```

### Estimate the dictionary's themes run (free: counts tokens, runs no model)
```sh
pnpm --filter server themes:classify --estimate
```

### Theme the whole dictionary (costs money, ≈$1; once, done together)
Writes `server/data/dictionary-themes.tsv`. Takes a few minutes to an hour (the Batches API); if it stops, run the same command again and it goes on where it was.
```sh
pnpm --filter server themes:classify
```

## Dates to remember

- **≈2027-10-26:** the Vercel token GitHub deploys with (`github-actions-dingsda`) expires. Before then: vercel.com → Account Settings → Tokens → create a new one, then `gh secret set VERCEL_TOKEN --repo AntonSplavnik/language-app` and paste it.
