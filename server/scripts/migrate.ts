// Applies pending migrations to DATABASE_URL. Runs before `pnpm dev`.
import { loadEnvFile, parseConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";

loadEnvFile();
const db = createDb(parseConfig(process.env).DATABASE_URL);
try {
  await runMigrations(db);
  console.log("Database is up to date");
} finally {
  await db.$client.end();
}
