import { sql } from "drizzle-orm";
import { createDb } from "../../src/db/client";
import { runMigrations } from "../../src/db/migrate";
import { testDatabaseUrl } from "./env";

/** Rebuilds the test database from the migrations once per test run. */
export default async function setup(): Promise<void> {
  const db = createDb(testDatabaseUrl());
  try {
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`DROP SCHEMA public CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
    await runMigrations(db);
  } finally {
    await db.$client.end();
  }
}
