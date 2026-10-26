// Sets a new password for an account, typed at the prompt (hidden, twice) or piped in, and ends
// all of its sign-ins (docs/design.md §14). The way to reset a forgotten password until the email
// service exists; an account without a password (Google only) gets one.
//
//   pnpm --filter server user:set-password <email|username>
//   echo 'new password' | pnpm --filter server user:set-password <email|username>
//
// Works on DATABASE_URL from .env (or the environment). Needs BETTER_AUTH_SECRET.
import { setPassword } from "../src/auth/accounts";
import { createAuth } from "../src/auth/auth";
import { authSecret, loadEnvFile, parseConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { askPassword, databaseName } from "./prompt";

const [login] = process.argv.slice(2);
if (!login) {
  console.error("Usage: user:set-password <email|username>");
  process.exit(1);
}

loadEnvFile();
const config = parseConfig(process.env);
const db = createDb(config.DATABASE_URL);
const auth = createAuth({
  db,
  secret: authSecret(config),
  signupMode: config.SIGNUP_MODE,
  webPort: config.WEB_PORT,
  rateLimit: false,
});

try {
  console.log(`Database: ${databaseName(config.DATABASE_URL)}`);
  const password = await askPassword();
  const { account, added, sessionsEnded } = await setPassword(auth, db, login, password);
  const who = account.displayUsername ?? account.username ?? account.email;
  console.log(`User ${account.id} (${who}, ${account.email ?? "no email"}):`);
  console.log(`  password:  ${added ? "added (it had none)" : "changed"}`);
  console.log(
    `  sign-ins:  ${sessionsEnded} ended${sessionsEnded > 0 ? "; every device signs in again" : ""}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
