// Deletes an account and everything it owns (docs/design.md §14), as Delete account does (§4
// Accounts), in one transaction. It prints the account and what will go, then asks for the
// username to be typed back: visibly on a terminal, or piped in (the first line). Anything else
// deletes nothing. No flag skips the question, and every account is treated alike, user 1 included.
//
//   pnpm --filter server user:delete <email|username>
//
// Works on DATABASE_URL from .env (or the environment); the times are in APP_TIME_ZONE.
import {
  accountContents,
  accountOf,
  accountTable,
  confirmsDeletion,
  deleteAccount,
  formatContents,
  listAccounts,
} from "../src/auth/accounts";
import { loadEnvFile, parseConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { askLine, databaseName } from "./prompt";

const args = process.argv.slice(2);
const [login] = args;
if (args.length !== 1 || !login || login.startsWith("-")) {
  console.error("Usage: user:delete <email|username> (asks for the username to be typed back)");
  process.exit(1);
}

loadEnvFile();
const config = parseConfig(process.env);
const db = createDb(config.DATABASE_URL);

/** The copies a deleted account outlives in (§4 Accounts, Backups). */
const COPIES =
  "On Neon (production), copies remain for a while: Neon's history keeps the account for " +
  "6 hours, and the nightly backups for up to 30 days, which the bucket's lock doesn't let " +
  "anyone shorten (docs/design.md §18.6).";

try {
  console.log(`Database: ${databaseName(config.DATABASE_URL)}`);
  const account = await accountOf(db, login);
  for (const line of accountTable(await listAccounts(db, account.id), config.APP_TIME_ZONE)) {
    console.log(line);
  }
  console.log("Deleting it deletes all of this:");
  for (const line of formatContents(await accountContents(db, account))) console.log(line);

  const typed = await askLine("Type its username to delete it (anything else keeps it): ");
  if (!confirmsDeletion(account, typed)) {
    console.log("Not deleted.");
    process.exitCode = 1;
  } else {
    const deleted = await deleteAccount(db, account);
    const who = account.displayUsername ?? account.username;
    console.log(`Deleted user ${account.id} (${who}, ${account.email ?? "no email"}):`);
    for (const line of formatContents(deleted)) console.log(line);
    console.log(COPIES);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  // A failed statement's own reason (its transaction rolled back, so nothing was deleted).
  if (error instanceof Error && error.cause instanceof Error) console.error(error.cause.message);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
