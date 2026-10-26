import { sql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";
import { createDb, type Db } from "../../src/db/client";
import { testDatabaseUrl } from "./env";

/**
 * The learner the route tests act as: user 1, created by the seed migration (the prototype's
 * single learner, claimed as the developer account by `user:claim`).
 */
export const LEARNER_ID = 1;

/**
 * Gives a test file a connection to the test database and empties it before each test.
 * User 1 is kept, signed out and unclaimed but with AI on, as the developer account has it (the
 * route tests use the AI routes as user 1); everything else is truncated.
 */
export function useTestDb(): Db {
  const db = createDb(testDatabaseUrl());
  beforeEach(() => resetDb(db));
  afterAll(() => db.$client.end());
  return db;
}

/** The single row an `insert … returning` produced. */
export function first<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error("Expected a row, got none");
  return row;
}

async function resetDb(db: Db): Promise<void> {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'users'`,
  );
  const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`));
  await db.execute(sql`DELETE FROM users WHERE id <> ${LEARNER_ID}`);
  await db.execute(sql`
    UPDATE users
    SET name = 'Learner', learner_language = 'en', target_language = 'de', email = NULL,
        email_verified = false, image = NULL, username = NULL, display_username = NULL,
        ai_enabled = true
    WHERE id = ${LEARNER_ID}`);
}
