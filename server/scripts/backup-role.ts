// Creates the read-only role the nightly backup dumps as (docs/design.md §18.5, §18.6), or gives it
// a new password, with the grants pg_dump needs. Run as the database's owner (on Neon,
// `neondb_owner` on the direct connection), with the password in BACKUP_ROLE_PASSWORD read from
// deploy.env, so it is never typed, shown, or kept in an SQL editor's history. Without
// BACKUP_ROLE_PASSWORD an existing role only gets its grants again (after a restore, §18.9).
//
//   BACKUP_ROLE_PASSWORD=… pnpm --filter server backup:role [role]      (the role: backup)
//   pnpm prod backup:role [role]      (on Neon: DATABASE_URL and BACKUP_ROLE_PASSWORD from deploy.env, §18.3)
//
// Works on DATABASE_URL from .env (or the environment).
import { loadEnvFile, parseConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { setUpBackupRole } from "./backup";
import { databaseName } from "./prompt";

const role = process.argv[2] ?? "backup";

loadEnvFile();
const { DATABASE_URL } = parseConfig(process.env);
console.log(`Database: ${databaseName(DATABASE_URL)}`);
const db = createDb(DATABASE_URL);
try {
  const done = await setUpBackupRole(db, role, process.env.BACKUP_ROLE_PASSWORD || undefined);
  console.log(`Role ${role}: ${done}; it reads every table and sequence in public and drizzle`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
