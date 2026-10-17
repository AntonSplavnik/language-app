import { readdirSync, readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { imports } from "../../src/db/schema";
import { SINGLE_USER_ID } from "../../src/user";
import { first, useTestDb } from "../helpers/db";

// The migration for typed words (docs/design.md §5, §7): imports.source, the forms table and the
// trigram index, which needs the pg_trgm extension. The test database is built from every
// migration before any test runs.

const db = useTestDb();

const drizzleDir = new URL("../../drizzle/", import.meta.url);
const migrationFile = readdirSync(drizzleDir).find((name) => name.endsWith("_typed-words.sql"));
const migration = migrationFile ? readFileSync(new URL(migrationFile, drizzleDir), "utf8") : "";

describe("migration: typed words", () => {
  it("creates pg_trgm before the trigram index that needs it", () => {
    const extension = migration.indexOf("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    expect(extension).toBeGreaterThanOrEqual(0);
    expect(extension).toBeLessThan(migration.indexOf("gin_trgm_ops"));
  });

  it("installs pg_trgm, so similarity() works", async () => {
    const { rows } = await db.execute<{ score: number }>(
      sql`SELECT similarity('regenschrim', 'regenschirm') AS score`,
    );
    expect(first(rows).score).toBeCloseTo(0.5);
  });

  it("an import written without a source photographed pages", async () => {
    // As every import before M10 was written: the column didn't exist.
    const { rows } = await db.execute<{ id: number }>(
      sql`INSERT INTO imports (user_id) VALUES (${SINGLE_USER_ID}) RETURNING id`,
    );
    const [row] = await db
      .select({ source: imports.source })
      .from(imports)
      .where(eq(imports.id, first(rows).id));
    expect(row?.source).toBe("photos");
  });
});
