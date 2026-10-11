import { sql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";
import { createDb, type Db } from "../../src/db/client";
import { SINGLE_USER_ID } from "../../src/user";
import { testDatabaseUrl } from "./env";

/**
 * Gives a test file a connection to the test database and empties it before each test.
 * The seeded single user is kept; everything else is truncated.
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
  await db.execute(sql`DELETE FROM users WHERE id <> ${SINGLE_USER_ID}`);
}
