// Turns user 1, the prototype's single learner who owns the word list, into the developer account
// (docs/design.md §17.6): its email, username, a password typed at the prompt, email verified and
// AI on. Runs once per database; refuses a user 1 that already has an email.
//
//   pnpm --filter server user:claim <email> <username>
//
// Works on DATABASE_URL from .env (or the environment). Needs BETTER_AUTH_SECRET.
import { createAuth } from "../src/auth/auth";
import { claimFirstUser } from "../src/auth/claim";
import { authSecret, loadEnvFile, parseConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { askPassword, databaseName } from "./prompt";

const [email, username] = process.argv.slice(2);
if (!email || !username) {
  console.error("Usage: user:claim <email> <username>");
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
  const claimed = await claimFirstUser(auth, { email, username, password });
  console.log(`User 1 ("${claimed.name}") is now the developer account:`);
  console.log(`  email:     ${claimed.email} (verified)`);
  console.log(`  username:  ${claimed.username} (shown as ${claimed.displayUsername})`);
  console.log("  password:  set");
  console.log("  AI:        on");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
