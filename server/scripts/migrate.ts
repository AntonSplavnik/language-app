// Applies pending migrations to DATABASE_URL. Runs before `pnpm dev`.
import { loadEnvFile, parseConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { databaseName } from "./prompt";

loadEnvFile();
const { DATABASE_URL } = parseConfig(process.env);
console.log(`Database: ${databaseName(DATABASE_URL)}`);
const db = createDb(DATABASE_URL);
try {
  await runMigrations(db);
  console.log("Database is up to date");
} finally {
  await db.$client.end();
}
