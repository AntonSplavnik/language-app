import { readdirSync, readFileSync } from "node:fs";
import { asc, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { imports, sessions, users } from "../../src/db/schema";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";

// The migration that adds sessions.import_id also turns the earlier `last_import` sessions into
// `import` ones (docs/design.md §5). The test database is built from every migration before any
// test runs, so this runs the migration's own data statements again on sessions written the old way.

const db = useTestDb();

const drizzleDir = new URL("../../drizzle/", import.meta.url);
const migrationFile = readdirSync(drizzleDir).find((name) => name.endsWith("_past-imports.sql"));
const dataStatements = migrationFile
  ? readFileSync(new URL(migrationFile, drizzleDir), "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter((statement) => statement.includes("'last_import'"))
  : [];

const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 11, hour, minute));

async function seedImport(userId: number, completedAt: Date | null) {
  return first(
    await db
      .insert(imports)
      .values({ userId, status: completedAt ? "done" : "reviewing", photoCount: 1, completedAt })
      .returning({ id: imports.id }),
  ).id;
}

/** A session as the code before M9 wrote it; `last_import` is no longer a valid source. */
async function seedOldSession(userId: number, source: string, startedAt: Date) {
  const { rows } = await db.execute<{ id: number }>(
    sql`INSERT INTO sessions (user_id, source, started_at) VALUES (${userId}, ${source}, ${startedAt.toISOString()}) RETURNING id`,
  );
  return first(rows).id;
}

describe("migration: last_import sessions become import sessions", () => {
  it("has a data statement for the old sessions", () => {
    expect(migrationFile).toBeDefined();
    expect(dataStatements).toHaveLength(1);
  });

  it("gives each one the most recent done import completed when it started", async () => {
    const other = first(
      await db
        .insert(users)
        .values({ name: "Other", learnerLanguage: "en", targetLanguage: "de" })
        .returning({ id: users.id }),
    ).id;
    const morning = await seedImport(LEARNER_ID, at(10));
    const noon = await seedImport(LEARNER_ID, at(12));
    await seedImport(LEARNER_ID, null);
    const theirs = await seedImport(other, at(11));

    const beforeAny = await seedOldSession(LEARNER_ID, "last_import", at(9));
    const afterMorning = await seedOldSession(LEARNER_ID, "last_import", at(11, 30));
    const atNoon = await seedOldSession(LEARNER_ID, "last_import", at(12));
    const afternoon = await seedOldSession(LEARNER_ID, "last_import", at(15));
    const notLearned = await seedOldSession(LEARNER_ID, "not_learned", at(15));
    const theirSession = await seedOldSession(other, "last_import", at(11, 30));

    for (const statement of dataStatements) await db.execute(sql.raw(statement));

    const rows = await db
      .select({ id: sessions.id, source: sessions.source, importId: sessions.importId })
      .from(sessions)
      .orderBy(asc(sessions.id));
    expect(rows).toEqual([
      // No import was done yet: nothing to point to.
      { id: beforeAny, source: "import", importId: null },
      { id: afterMorning, source: "import", importId: morning },
      { id: atNoon, source: "import", importId: noon },
      { id: afternoon, source: "import", importId: noon },
      { id: notLearned, source: "not_learned", importId: null },
      { id: theirSession, source: "import", importId: theirs },
    ]);
  });
});
