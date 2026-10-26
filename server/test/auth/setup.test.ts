import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../src/db/client";
import { runMigrations } from "../../src/db/migrate";
import * as schema from "../../src/db/schema";
import { TEST_SECRET, testAuth } from "../helpers/app";
import { first, useTestDb } from "../helpers/db";
import { testDatabaseUrl } from "../helpers/env";

// Better Auth on our schema, and the migration that adds accounts (docs/design.md §5, §17.2).
// That a sign-up and a session read work on the migrated test database is shown in
// sign-up.test.ts.

const db = useTestDb();

describe("Better Auth's schema check", () => {
  it("passes on our tables", async () => {
    const ctx = await testAuth(db).$context;
    expect(ctx.checkSchema).toBeTypeOf("function");
    await expect(Promise.resolve(ctx.checkSchema?.())).resolves.toBeUndefined();
  });

  it("fails while a required users column it never writes is undeclared", async () => {
    // Without the additional fields: every auth request would fail this way (§16).
    const bare = betterAuth({
      secret: TEST_SECRET,
      baseURL: "http://localhost:5173",
      database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
      advanced: { database: { generateId: "serial" } },
      user: { modelName: "users" },
      session: { modelName: "authSessions" },
      account: { modelName: "authAccounts" },
      verification: { modelName: "authVerifications" },
      plugins: [username()],
      logger: { disabled: true },
      telemetry: { enabled: false },
    });
    const ctx = await bare.$context;
    await expect(Promise.resolve(ctx.checkSchema?.())).rejects.toThrow(/learnerLanguage/);
  });
});

describe("migration: accounts", async () => {
  const drizzleDir = fileURLToPath(new URL("../../drizzle/", import.meta.url));
  const journal = JSON.parse(readFileSync(join(drizzleDir, "meta/_journal.json"), "utf8")) as {
    entries: Array<{ tag: string }>;
  };
  const accounts = journal.entries.findIndex((entry) => entry.tag.endsWith("_accounts"));

  // A database of its own, migrated to just before accounts, filled the old way, then migrated on.
  const url = new URL(testDatabaseUrl());
  const name = `${url.pathname.slice(1)}_accounts_migration`;
  url.pathname = `/${name}`;
  await db.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}"`));
  await db.execute(sql.raw(`CREATE DATABASE "${name}"`));
  const old: Db = createDb(url.toString());
  const folder = mkdtempSync(join(tmpdir(), "migrations-before-accounts-"));

  afterAll(async () => {
    await old.$client.end();
    await db.execute(sql.raw(`DROP DATABASE IF EXISTS "${name}"`));
    rmSync(folder, { recursive: true, force: true });
  });

  const count = async (table: string) =>
    Number(
      first((await old.execute<{ n: string }>(sql.raw(`SELECT count(*) AS n FROM ${table}`))).rows)
        .n,
    );
  const userOne = async () =>
    first((await old.execute<Record<string, unknown>>(sql`SELECT * FROM users WHERE id = 1`)).rows);

  it("is in the journal, after the migrations it builds on", () => {
    expect(accounts).toBeGreaterThan(0);
  });

  it("adds the columns and tables and leaves user 1's data alone", async () => {
    mkdirSync(join(folder, "meta"));
    const before = journal.entries.slice(0, accounts);
    for (const entry of before) {
      copyFileSync(join(drizzleDir, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    }
    writeFileSync(
      join(folder, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: before }),
    );
    await migrate(old, { migrationsFolder: folder });

    // The prototype's data, as the code before M12 wrote it.
    await old.execute(sql`
      INSERT INTO words (language, lemma, pos, article, check_status)
      VALUES ('de', 'Tisch', 'noun', 'der', 'match')`);
    await old.execute(
      sql`INSERT INTO imports (user_id, name, status) VALUES (1, 'Lesson 4', 'done')`,
    );
    await old.execute(sql`
      INSERT INTO user_words (user_id, word_id, status, import_id, times_seen)
      VALUES (1, 1, 'learning', 1, 3)`);
    await old.execute(sql`INSERT INTO sessions (user_id, source) VALUES (1, 'not_learned')`);
    await old.execute(sql`
      INSERT INTO card_results (session_id, user_word_id, result, flipped, answer_ms)
      VALUES (1, 1, 'knew', true, 900)`);
    await old.execute(sql`
      INSERT INTO ai_usage (user_id, import_id, call_type, model, ok)
      VALUES (1, 1, 'extract', 'claude-haiku-5-5', true)`);
    const learnerBefore = await userOne();

    await runMigrations(old);

    const learner = await userOne();
    expect(learner).toMatchObject(learnerBefore);
    expect(learner).toMatchObject({
      name: "Learner",
      learner_language: "en",
      target_language: "de",
      email: null,
      email_verified: false,
      image: null,
      username: null,
      display_username: null,
      ai_enabled: false,
    });
    expect(learner.updated_at).toEqual(expect.any(String));
    for (const table of [
      "words",
      "imports",
      "user_words",
      "sessions",
      "card_results",
      "ai_usage",
    ]) {
      expect(await count(table), table).toBe(1);
    }
    for (const table of [
      "auth_sessions",
      "auth_accounts",
      "auth_verifications",
      "auth_rate_limits",
      "invites",
    ]) {
      expect(await count(table), table).toBe(0);
    }
  });

  it("deleting a user deletes their data, and only theirs, in one statement", async () => {
    await old.execute(sql`DELETE FROM users WHERE id = 1`);

    for (const table of ["imports", "user_words", "sessions", "card_results", "ai_usage"]) {
      expect(await count(table), table).toBe(0);
    }
    // The shared word facts stay.
    expect(await count("words")).toBe(1);
  });
});
