// Switches an account's AI features on or off (docs/design.md §4 Accounts, §14): photo and PDF
// import, Ask AI, example sentences. Counts from the account's next request; nobody has to sign in
// again.
//
//   pnpm --filter server user:ai <email|username> on|off
//
// Works on DATABASE_URL from .env (or the environment).
import { setAiEnabled } from "../src/auth/accounts";
import { loadEnvFile, parseConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { databaseName } from "./prompt";

const [login, switchArg] = process.argv.slice(2);
if (!login || (switchArg !== "on" && switchArg !== "off")) {
  console.error("Usage: user:ai <email|username> on|off");
  process.exit(1);
}

loadEnvFile();
const config = parseConfig(process.env);
const db = createDb(config.DATABASE_URL);
const word = (on: boolean) => (on ? "on" : "off");

try {
  console.log(`Database: ${databaseName(config.DATABASE_URL)}`);
  const { account, was } = await setAiEnabled(db, login, switchArg === "on");
  const who = account.displayUsername ?? account.username ?? account.email;
  console.log(
    account.aiEnabled === was
      ? `User ${account.id} (${who}): AI was already ${word(was)}; nothing changed`
      : `User ${account.id} (${who}): AI ${word(was)} → ${word(account.aiEnabled)}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
