// Prints the exact row count of every table in DATABASE_URL (`public` and `drizzle`), read-only,
// marking the tables whose data backups leave out. The restore drill compares a restored database
// with Neon this way (docs/design.md §18.6, §18.9).
//
//   pnpm --filter server db:counts
//
// Works on DATABASE_URL from .env (or the environment); on Neon the read-only `backup` role is
// enough.
import { loadEnvFile, parseConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { formatCounts, tableCounts } from "./backup";
import { databaseName } from "./prompt";

loadEnvFile();
const { DATABASE_URL } = parseConfig(process.env);
console.log(`Database: ${databaseName(DATABASE_URL)}`);
const db = createDb(DATABASE_URL);
try {
  for (const line of formatCounts(await tableCounts(db))) console.log(line);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
