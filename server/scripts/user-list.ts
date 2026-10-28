// Lists every account, one line each, sorted by id (docs/design.md §14): its username and email,
// how it signs in, AI on or off, the words in its list, when it was created and when it was last
// active, then the total. Only reads, and never shows a password hash, a token or a session id.
//
//   pnpm --filter server user:list
//
// Works on DATABASE_URL from .env (or the environment); the times are in APP_TIME_ZONE.
import { accountTable, accountTotal, listAccounts } from "../src/auth/accounts";
import { loadEnvFile, parseConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { databaseName } from "./prompt";

if (process.argv.length > 2) {
  console.error("Usage: user:list (every account; there is no filter)");
  process.exit(1);
}

loadEnvFile();
const config = parseConfig(process.env);
const db = createDb(config.DATABASE_URL);

try {
  console.log(`Database: ${databaseName(config.DATABASE_URL)}`);
  const accounts = await listAccounts(db);
  if (accounts.length > 0) {
    for (const line of accountTable(accounts, config.APP_TIME_ZONE)) console.log(line);
  }
  console.log(accountTotal(accounts));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
