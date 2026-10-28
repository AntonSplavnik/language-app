# M12 research: working examples and commands

Kept so the M12 build doesn't redo the research of 2026-10-24 and 2026-10-25. The decisions are in `docs/plan.md` (M12) and `docs/design.md` (accounts in §4 Accounts and the sections §17 lists, deployment in §18); §16 summarises what was found. This file holds the code that was actually tried and the commands for the steps that come later. Everything here was a throwaway probe: rewrite it to the repo's standards rather than copying it as is.

**Status (2026-10-27;** a bare § here is a section of this file):
- **Built and confirmed:** §1 in M12.1–M12.3b (on Better Auth 1.7.7; what the build found beyond the probe is in `docs/design.md` §16, "Built on 1.7.7" and "Found in M12.2" to "Found in M12.3b"); §2 and §3's checks and deploy in M12.4, live since 2026-10-26 (`docs/design.md` §18, "How going live went" in §18.8); §3's nightly backup and Neon's read-only role built in M12.5 (2026-10-27, `docs/design.md` §18.6; what differs from the notes below is there and in §16, "Backups (M12.5)"), going live with §18.9.
- **Still to come:** §4, Web Push (Later, push notifications); §1's phone-app note.

## 1. Better Auth probe (M12.1–M12.3)

Better Auth 1.7.13 with `@better-auth/drizzle-adapter` 1.7.13, drizzle-orm 0.45.3 (`casing: "snake_case"`), Fastify 5.12.5, bundled with esbuild 0.28.2 (`--bundle --platform=node --format=esm`) and run against PGlite, an in-memory Postgres. **Not** tried: node-postgres against a real database, Vercel's client-IP header, scrypt time on Vercel. (The first two were settled by the build: node-postgres with Better Auth from M12.1 on the Mac's database and from M12.4 on Neon, the header in M12.4, below.)

### Schema (Drizzle)
The existing `users` table plus Better Auth's columns, and its tables with explicit names (our practice `sessions` must not clash):

```ts
const id = () => integer().primaryKey().generatedAlwaysAsIdentity();
const tz = () => timestamp({ withTimezone: true });

const users = pgTable("users", {
  id: id(),
  name: text().notNull(),
  learnerLanguage: text().notNull(),
  targetLanguage: text().notNull(),
  createdAt: tz().notNull().defaultNow(),
  // added for Better Auth
  email: text().unique(), // nullable, so user 1 exists before it is claimed
  emailVerified: boolean().notNull().default(false),
  image: text(),
  updatedAt: tz().notNull().defaultNow(),
  username: text().unique(),
  displayUsername: text(),
  aiEnabled: boolean().notNull().default(false),
});
const authSessions = pgTable("auth_sessions", {
  id: id(),
  userId: integer().notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text().notNull().unique(),
  expiresAt: tz().notNull(),
  ipAddress: text(),
  userAgent: text(),
  createdAt: tz().notNull().defaultNow(),
  updatedAt: tz().notNull().defaultNow(),
});
const authAccounts = pgTable("auth_accounts", {
  id: id(),
  userId: integer().notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text().notNull(),
  providerId: text().notNull(),
  accessToken: text(),
  refreshToken: text(),
  accessTokenExpiresAt: tz(),
  refreshTokenExpiresAt: tz(),
  scope: text(),
  idToken: text(),
  password: text(),
  createdAt: tz().notNull().defaultNow(),
  updatedAt: tz().notNull().defaultNow(),
});
const authVerifications = pgTable("auth_verifications", {
  id: id(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: tz().notNull(),
  createdAt: tz().notNull().defaultNow(),
  updatedAt: tz().notNull().defaultNow(),
});
const authRateLimits = pgTable("auth_rate_limits", {
  id: id(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});
```

Generate a reference schema with the current CLI, `npx auth@latest generate --adapter drizzle --dialect postgresql --output <file>` (the old `@better-auth/cli` package stopped at 1.4.21), and check ours with `npx auth@latest check schema --config <auth file>`; migrations stay `pnpm db:generate` (drizzle-kit).

### Configuration
```ts
const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  // Production: a static "https://<name>.vercel.app". The Mac: several origins over plain HTTP.
  baseURL: {
    allowedHosts: ["localhost:5173", "192.168.*.*:5173", "*.local"],
    protocol: "auto",
    fallback: "http://localhost:5173", // needed for server-side auth.api.* calls (scripts)
  },
  trustedOrigins: ["http://localhost:5173", "http://192.168.*.*:5173"],
  database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
  advanced: { database: { generateId: "serial" } }, // ids come back as strings
  user: {
    modelName: "users",
    additionalFields: {
      learnerLanguage: { type: "string", required: false, defaultValue: "en", input: false },
      targetLanguage: { type: "string", required: false, defaultValue: "de", input: false },
      aiEnabled: { type: "boolean", required: false, defaultValue: false, input: false },
    },
    validateUserInfo: async ({ user, source }) => {
      if (source.action === "sign-in") return;
      if (!(await isInvited(user.email))) {
        return { error: "not_invited", errorDescription: "This email is not on the invite list" };
      }
    },
    deleteUser: { enabled: true }, // our tables cascade from users (design §5)
  },
  session: { modelName: "authSessions", expiresIn: 60 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  account: { modelName: "authAccounts" },
  verification: { modelName: "authVerifications" },
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "authRateLimits",
    customRules: { "/sign-in/email": { window: 60, max: 5 }, "/sign-in/username": { window: 60, max: 5 }, "/sign-up/email": { window: 60, max: 5 } },
  },
  emailAndPassword: { enabled: true }, // 8–128 characters, autoSignIn on (needed for the not_invited answer)
  socialProviders: { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } },
  plugins: [username()],
  disabledPaths: ["/is-username-available"],
});
```

Never start the Mac's server with `NODE_ENV=production` or an `https` baseURL: cookies would become `Secure` and sign-in over the LAN's plain HTTP would stop working.

### Mounting in Fastify, and reading the session
```ts
import { fromNodeHeaders } from "better-auth/node";

app.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  async handler(request, reply) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const response = await auth.handler(
      new Request(url, {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      }),
    );
    reply.status(response.status);
    response.headers.forEach((value, key) => reply.header(key, value)); // keeps both Set-Cookie headers
    return reply.send(response.body ? await response.text() : null);
  },
});

// in the hook in front of our own routes
const found = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
// found: { session, user } | null; found.user.id is a string ("2")
```

### Claiming user 1 and setting passwords (scripts)
```ts
const ctx = await auth.$context;
await ctx.internalAdapter.updateUser("1", { email, username: "anton", displayUsername: "Anton", emailVerified: true, aiEnabled: true });
await ctx.internalAdapter.linkAccount({ userId: "1", providerId: "credential", accountId: "1", password: await ctx.password.hash(password) });
// a later reset: ctx.internalAdapter.updatePassword("1", await ctx.password.hash(password)), then end its sessions
```
`internalAdapter.createUser` outside an endpoint throws once `validateUserInfo` is set; `auth.api.signUpEmail({ body })` works from a script (it goes through the invite check).

### What the probe showed
| # | Tried | Result |
|---|---|---|
| 1 | Sign-up of an invited email with username "New.User" | 200, signed in; `username` "new.user", `displayUsername` "New.User"; cookie `better-auth.session_token; HttpOnly; SameSite=Lax; Max-Age=604800` (no `Secure` over HTTP) |
| 2 | Sign-up of an email not on the list | 403 `{"code":"not_invited",…}`, no user |
| 3 | Sign-up sending `aiEnabled: true` | 200, stored `false` (`input: false`) |
| 4 | Sign-in by username in another case ("NEW.user"), then a route reading the session | 200; `user.id` and `session.userId` are strings |
| 4b | Two `Set-Cookie` headers in one answer | both kept by the handler above |
| 5 | User 1 given email, username and password from a script | signs in by username; its credential account has `account_id` "1" |
| 6 | `auth.api.signUpEmail` from a script | works (needs `fallback` with a dynamic baseURL) |
| 7 | `internalAdapter.createUser` from a script | throws `validation_context_missing` |
| 8 | `POST /sign-in/social` for Google without the client library | 200 `{ url, redirect: true }`, a `Location` header and a 5-minute state cookie; the `redirect_uri` follows the request's host |
| 9 | Four wrong sign-ins from one IP within 10 s (default rule 3 per 10 s) | the 4th got 429; counters in the rate-limit table |
| 10 | Deleting user 1 with its password | 200; user, accounts and sessions gone (our own rows need cascades or `beforeDelete`) |
| 11 | Sign-in from an untrusted origin | 403 `INVALID_ORIGIN` |
| — | `learner_language` / `target_language` NOT NULL but not declared | every request fails: "Drizzle schema mismatch – Required columns Better Auth never writes" |
| — | `NODE_ENV=production` with a dynamic baseURL | cookie `__Secure-better-auth.session_token; Secure` |

### Still to work out in the build
- **A username for Google sign-ups:** done in M12.3 as planned (`databaseHooks.user.create.before`, `server/src/auth/usernames.ts`; the rule is in `docs/design.md` §4 Accounts).
- **Vercel's client-IP header** for the rate limits (`advanced.ipAddress.ipAddressHeaders`); without one, all users share one counter per path. Done in M12.4: `x-vercel-forwarded-for`, which Vercel sets and overwrites when a client forges it (checked going live, `docs/design.md` §16 and §18.8).
- **A future phone app:** `@better-auth/expo`, or the `bearer` plugin (the `set-auth-token` header, then `Authorization: Bearer`). Not built (no phone app yet).

## 2. Vercel deploy probe (M12.4)

Deployed from a clean copy of the repo on 2026-10-24 (results in `docs/plan.md`, M12, "Check first"). M12.4 rewrites these in TypeScript, with the pool, Better Auth and request-id changes of §18.2. **Built in M12.4** (2026-10-26) as `server/scripts/vercel-output.ts` and `build-vercel.ts`, `server/src/vercel.ts` with `setup.ts`, `vercel.json` and `.github/workflows/ci.yml`; the commands for going live, with the CLI pinned at 63.1.2, are in `docs/design.md` §18.8. The probe's code below is kept as it was tried.

`server/scripts/vercel-build.mjs` (run after `vite build`):
```js
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
const out = `${root}.vercel/output`;
const fn = `${out}/functions/api.func`;
rmSync(out, { recursive: true, force: true });
cpSync(`${root}web/dist`, `${out}/static`, { recursive: true });
mkdirSync(fn, { recursive: true });

await build({
  entryPoints: [`${root}server/src/vercel.ts`],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile: `${fn}/index.mjs`,
  // pg loads pg-native only when asked to; the CommonJS libraries need a real require().
  external: ["pg-native"],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify({
  runtime: "nodejs24.x", handler: "index.mjs", launcherType: "Nodejs", maxDuration: 300, regions: ["fra1"],
}));
writeFileSync(`${out}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { src: "^/api(?:/.*)?$", dest: "/api" },
    { handle: "filesystem" },
    { src: "^/(.*)$", dest: "/index.html" },
  ],
}));
```

`server/src/vercel.ts`: `main.ts` without `listen()`:
```ts
const config = parseConfig(process.env);
const db = createDb(config.DATABASE_URL);
// … the learner check, createClaudeAi, buildApp as in main.ts …
const app = buildApp(deps, { logger: true });
await app.ready();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  app.server.emit("request", req, res);
}
```

`vercel.json` of the probe (M12.4 adds `"git": { "deploymentEnabled": false }`):
```json
{
  "framework": null,
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm --filter @language-app/web build && node server/scripts/vercel-build.mjs",
  "regions": ["fra1"]
}
```

### Vercel CLI notes
- Pin a CLI version at least a week old (`npx -y vercel@<version>`); it prints an `EBADENGINE` warning on Node 26, which is harmless.
- `vercel link --yes --project <name>` creates `.vercel/project.json` with `projectId` and `orgId`: these are `VERCEL_PROJECT_ID` and `VERCEL_ORG_ID` for GitHub Actions.
- Variables without a prompt: `printf %s "$VALUE" | vercel env add NAME production --sensitive --yes --non-interactive`. Without `--yes --non-interactive`, adding a Preview variable stops at a "Git branch?" prompt.
- A project's **first deployment becomes production**. Standard protection guards the deployment URLs but leaves the production `<project>.vercel.app` alias public. For the probe, `vercel api /v9/projects/<name> -X PATCH --input -` with `{"ssoProtection":{"deploymentType":"all"}}` closed it.
- A protected deployment: `vercel curl <path> --deployment <url> -- <curl options>`. Logs: `vercel logs --deployment <url> --since 15m --json` (Hobby keeps an hour).
- `vercel project rm` has no `--yes`; `vercel api /v9/projects/<name> -X DELETE --dangerously-skip-permissions` deletes without a prompt.
- Tokens: a project-scoped token ("Limited to a single project") is preferred; whether it works for `pull/build/deploy` on Hobby isn't documented, so fall back to a team-scoped one.

## 3. GitHub Actions, R2 and age (M12.4, M12.5)

### Checks and deploy
**Built in M12.4** as `.github/workflows/ci.yml` (`docs/design.md` §18.4), live since 2026-10-26; the notes below are as researched.

- pnpm 11: `pnpm/action-setup` reads `packageManager` from `package.json` (or `corepack enable`); Node 24 with `actions/setup-node`.
- PostgreSQL for the tests:
  ```yaml
  services:
    postgres:
      image: postgres:17
      env: { POSTGRES_USER: app, POSTGRES_PASSWORD: app, POSTGRES_DB: language_app_test }
      ports: ["5432:5432"]
      options: >-
        --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
  ```
- Deploy (Vercel's guide): `vercel pull --yes --environment=production --token=$VERCEL_TOKEN`, `vercel build --prod --token=…`, `vercel deploy --prebuilt --prod --token=…`, with `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` in the environment. `concurrency: deploy` so deploys run one at a time.
- Failure emails go to whoever created the workflow, only if Actions notifications are on in their GitHub settings (Settings → Notifications → Actions, "only failed workflows").
- Schedules are in UTC unless `timezone:` is set, can run late at busy times (avoid minute 0), and may be dropped under load.

### The nightly backup
**Built in M12.5** (2026-10-27) as `.github/workflows/backup.yml`, `server/scripts/backup-dump.sh` and `backup:role` / `backup:restore` / `db:counts` (`docs/design.md` §18.6, going live §18.9); the notes below are as researched. The build differs: the dump is checked before it is encrypted; the role also gets `drizzle`'s default privileges; libpq needs `PGSSLROOTCERT=system` for `verify-full`; the restore streams `age --identity -` into `pg_restore` rather than decrypting to a file.

- `pg_dump` 17: `ubuntu-latest` has PostgreSQL 16, and `pg_dump` refuses newer servers. Install the 17 client from PGDG (`sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y`, then `sudo apt-get install -y postgresql-client-17`, binaries in `/usr/lib/postgresql/17/bin`) or run it in the image: `docker run --rm postgres:17 pg_dump …`.
- Dump: `pg_dump -Fc --exclude-table-data=dictionary_entries --exclude-table-data=dictionary_forms -d "$NEON_BACKUP_URL" -f backup.dump` (the direct connection, never the `-pooler` one).
- `age`: `sudo apt-get install -y age`; encrypt `age -r "$AGE_RECIPIENT" -o "$(date +%F).dump.age" backup.dump`. The key pair is made once on the Mac with `age-keygen -o key.txt` (it prints the public key `age1…`); `key.txt` goes to the password manager, never to GitHub. Decrypt: `age --decrypt -i key.txt file.dump.age > backup.dump`.
- R2 upload with the AWS CLI already on the runner: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, region `auto`, `aws s3 cp <file> s3://<bucket>/ --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (an EU-jurisdiction bucket uses `<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`).
- R2 setup: an R2 subscription (checkout, a card or PayPal); a bucket; an API token with **Object Read & Write** scoped to that bucket (its secret is shown once); a lifecycle rule deleting objects after 30 days (dashboard → the bucket → Object lifecycle rules, or `npx wrangler r2 bucket lifecycle add`). Free: 10 GB-month, 1 M writes, 10 M reads a month, no egress fees.
- Neon's read-only role, as `neondb_owner` (console-made roles get `neon_superuser`, so it's made in SQL):
  ```sql
  CREATE ROLE backup LOGIN PASSWORD '…';
  GRANT CONNECT ON DATABASE neondb TO backup;
  GRANT USAGE ON SCHEMA public, drizzle TO backup;
  GRANT SELECT ON ALL TABLES IN SCHEMA public, drizzle TO backup;
  GRANT SELECT ON ALL SEQUENCES IN SCHEMA public, drizzle TO backup;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO backup;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO backup;
  ```
  (`GRANT pg_read_all_data` probably isn't allowed on Neon; not tried.)
- Neon's pg_dump advice: the client version should match the server's (17).

### Neon connection settings
Neon suggests `connectionTimeoutMillis: 10000` for node-postgres; with Vercel's Fluid compute, a `Pool` plus `attachDatabasePool(pool)` from `@vercel/functions` on the pooled (`-pooler`) string. Its strings carry `sslmode=require&channel_binding=require` (node-postgres warns that `require` is treated as `verify-full`).

## 4. Web Push on iOS (the push-notification milestone)
**Not built yet** (`docs/plan.md`, Later: push notifications).

WebKit and Apple: Web Push works for Home Screen web apps from iOS 16.4 (a manifest with `display: standalone`); permission can only be asked in direct response to a tap, and the subscribe call must run straight from that gesture's handler; the server must be able to reach `https://*.push.apple.com`; no Apple Developer account is needed. It uses a service worker, so it needs HTTPS (on the LAN: `docs/design.md` §18.7).
