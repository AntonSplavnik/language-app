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

### Invite someone (sign-up is invite-only)
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

Accounts are named by email or username, in any case. Listing all accounts (`user:list`) and deleting one by script (`user:delete`) are planned (M12.6, `docs/plan.md`); until then an account is deleted by its owner in Settings → Account.

## Accounts in production (`https://dingsda.vercel.app`, Neon)

The same commands, run from the Mac against Neon. Neon's connection string goes into a temporary, git-ignored `deploy.env`, so it is never typed or shown.

### 1. In Neon's console: Connect → turn Connection pooling **off** → copy the connection string

### 2. Write it from the clipboard into `deploy.env`
```sh
printf "NEON_DIRECT_URL='%s'\n" "$(pbpaste)" > deploy.env
```

### 3. Make the file readable only by you
```sh
chmod 600 deploy.env
```

### 4. Switch the connection to `verify-full`
```sh
sed -i '' 's/sslmode=require/sslmode=verify-full/' deploy.env
```

### 5. Run the command you need, for example an invite
```sh
( set -a; . ./deploy.env; set +a; DATABASE_URL="$NEON_DIRECT_URL" pnpm --filter server invite:add friend@example.com )
```
Check that the first line says `Database: ep-…neon.tech/neondb`, not `localhost`. Any account command works the same way: replace `invite:add friend@example.com` with, for example, `user:ai friend@example.com on`, `invite:list` or `user:set-password lazypixel`.

### 6. Delete `deploy.env` when you're done
```sh
rm deploy.env
```

### Inviting a friend to production, start to finish
1. Steps 1–4 above.
2. `invite:add` with their email (step 5).
3. They open `https://dingsda.vercel.app` and create an account, with a password or Continue with Google. New accounts have AI off.
4. If they should have AI: step 5 with `user:ai their@email.com on`.
5. Step 6.

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

## Deploying to production

A push to `main` deploys: GitHub runs the checks (≈2.5 min), then Neon's migrations and the Vercel deploy (≈1 min). A push that changes only `*.md` files or `docs/` runs nothing. Nothing is deployed by hand.

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

### Reload the dictionary into the Mac's database (≈14 s)
```sh
pnpm --filter server import:wiktionary data/kaikki/kaikki.org-dictionary-German.jsonl
```

## Dates to remember

- **≈2027-10-26:** the Vercel token GitHub deploys with (`github-actions-dingsda`) expires. Before then: vercel.com → Account Settings → Tokens → create a new one, then `gh secret set VERCEL_TOKEN --repo AntonSplavnik/language-app` and paste it.
