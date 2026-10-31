import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DUMP_SCRIPT,
  excludedTables,
  formatCounts,
  pg17Bin,
  restoreBackup,
  setUpBackupRole,
  type TableCount,
  tableCounts,
} from "../../scripts/backup";
import { databaseName } from "../../scripts/prompt";
import { createDb, type Db } from "../../src/db/client";
import { runMigrations } from "../../src/db/migrate";
import { loadDictionary } from "../../src/dictionary/load";
import { testAuth } from "../helpers/app";
import { testDatabaseUrl } from "../helpers/env";

// A backup's round trip (docs/design.md §18.6), shaped as on Neon: a database owned by a role that
// isn't a superuser (neondb_owner) and migrated by it, dumped by backup-dump.sh as a read-only role
// with backup:role's grants, encrypted to a throwaway age key, then restored by backup:restore into
// an empty database of the same owner. Needs age and PostgreSQL 17's client: `pnpm test:backup`.

const SERVER = fileURLToPath(new URL("../../", import.meta.url));
const SAMPLE = fileURLToPath(new URL("../fixtures/kaikki-sample.jsonl", import.meta.url));
const THEMES = fileURLToPath(new URL("../fixtures/dictionary-themes-sample.tsv", import.meta.url));
const JOURNAL = fileURLToPath(new URL("../../drizzle/meta/_journal.json", import.meta.url));
const admin = createDb(testDatabaseUrl());
const prefix = `${new URL(testDatabaseUrl()).pathname.slice(1)}_backup`;
const OWNER = `${prefix}_owner`;
const READER = `${prefix}_reader`;
const SOURCE = `${prefix}_source`;
const TARGET = `${prefix}_target`;
const PASSWORD = "0123456789abcdef0123456789abcdef";

const urlOf = (database: string, role: string) => {
  const url = new URL(testDatabaseUrl());
  url.pathname = `/${database}`;
  url.username = role;
  url.password = PASSWORD;
  return url.toString();
};
const dir = mkdtempSync(join(tmpdir(), "backup-test-"));
const backup = join(dir, "2026-10-27-0317.dump.age");
const env = { ...process.env, PATH: `${pg17Bin()}${delimiter}${process.env.PATH}` };
const ageKeyPair = () => {
  const key = execFileSync("age-keygen", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    .split("\n")
    .find((line) => line.startsWith("AGE-SECRET-KEY-1"));
  if (!key) throw new Error("age-keygen printed no key");
  return {
    key,
    recipient: execFileSync("age-keygen", ["-y"], { input: key, encoding: "utf8" }).trim(),
  };
};
const { key, recipient } = ageKeyPair();

let source: Db;
let target: Db;
let sourceCounts: TableCount[];

const dropAll = async () => {
  for (const database of [SOURCE, TARGET])
    await admin.execute(sql.raw(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`));
  for (const role of [READER, OWNER]) await admin.execute(sql.raw(`DROP ROLE IF EXISTS "${role}"`));
};

beforeAll(async () => {
  await dropAll();
  await admin.execute(sql.raw(`CREATE ROLE "${OWNER}" LOGIN CREATEROLE PASSWORD '${PASSWORD}'`));
  for (const database of [SOURCE, TARGET])
    await admin.execute(sql.raw(`CREATE DATABASE "${database}" OWNER "${OWNER}"`));
  source = createDb(urlOf(SOURCE, OWNER));
  target = createDb(urlOf(TARGET, OWNER));

  // As on Neon after §18.8: public belongs to the owner, who migrates (pg_trgm included) and
  // can create roles (neon_superuser), but isn't a superuser.
  await source.execute(sql`DROP SCHEMA public CASCADE`);
  await source.execute(sql`CREATE SCHEMA public`);
  await target.execute(sql`DROP SCHEMA public CASCADE`);
  await target.execute(sql`CREATE SCHEMA public`);
  await runMigrations(source);
  await loadDictionary(source, SAMPLE, { themes: THEMES });
  await source.execute(sql`
    INSERT INTO users (name, learner_language, target_language, email, username, ai_enabled)
    VALUES ('Friend', 'en', 'de', 'friend@example.com', 'friend', false)`);
  await source.execute(sql`
    INSERT INTO words (language, lemma, pos, article, check_status, themes)
    VALUES ('de', 'Tisch', 'noun', 'der', 'match', '{home}'),
           ('de', 'gehen', 'verb', NULL, 'match', NULL)`);
  await source.execute(sql`
    INSERT INTO word_translations (word_id, language, translation) VALUES (1, 'en', 'table')`);
  await source.execute(
    sql`INSERT INTO imports (user_id, name, status) VALUES (1, 'Lesson 4', 'done')`,
  );
  await source.execute(sql`
    INSERT INTO user_words (user_id, word_id, status, import_id, times_seen, themes)
    VALUES (1, 1, 'learning', 1, 3, '{work}'), (1, 2, 'learned', 1, 5, NULL),
           (2, 1, 'learning', NULL, 0, NULL)`);
  await source.execute(sql`INSERT INTO groups (user_id, name) VALUES (1, 'Hard ones')`);
  await source.execute(sql`INSERT INTO group_words (group_id, user_word_id) VALUES (1, 1)`);
  await source.execute(sql`
    INSERT INTO sessions (user_id, source, group_id) VALUES (1, 'not_learned', NULL), (1, 'group', 1)`);
  await source.execute(sql`
    INSERT INTO card_results (session_id, user_word_id, result, flipped, answer_ms, round)
    VALUES (1, 1, 'didnt_know', true, 900, 1), (1, 1, 'knew', true, 700, 2)`);
  await source.execute(sql`
    INSERT INTO ai_usage (user_id, import_id, call_type, model, ok)
    VALUES (1, 1, 'extract', 'claude-haiku-5-5', true)`);
  await source.execute(sql`
    INSERT INTO invites (email, used_at, user_id) VALUES ('friend@example.com', now(), 2)`);
  await source.execute(sql`
    INSERT INTO auth_accounts (user_id, account_id, provider_id, password)
    VALUES (2, '2', 'credential', 'a password hash')`);
  await source.execute(sql`
    INSERT INTO auth_sessions (user_id, token, expires_at) VALUES (2, 'a session token', now() + interval '1 day')`);
  await source.execute(sql`
    INSERT INTO auth_verifications (identifier, value, expires_at) VALUES ('x', 'y', now())`);
  await source.execute(sql`
    INSERT INTO auth_rate_limits (key, count, last_request) VALUES ('203.0.113.9|/sign-in/username', 1, 0)`);
  await setUpBackupRole(source, READER, PASSWORD);
  sourceCounts = await tableCounts(source);
});

// An ended pool's connections close a moment later. DROP … WITH (FORCE) would kill one still
// closing, and its FATAL then reaches a client nobody listens to any more (an unhandled error).
const untilClosed = async (databases: string[]) => {
  for (let tries = 0; tries < 50; tries++) {
    const { rows } = await admin.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname::text IN ${databases}`);
    if (rows[0]?.n === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

afterAll(async () => {
  await source?.$client.end();
  await target?.$client.end();
  await untilClosed([SOURCE, TARGET]);
  await dropAll();
  await admin.$client.end();
  rmSync(dir, { recursive: true, force: true });
});

const dump = (environment: Record<string, string | undefined>) =>
  spawnSync("bash", [DUMP_SCRIPT, backup], { env: { ...env, ...environment }, encoding: "utf8" });

describe("backup-dump.sh (the workflow's dump, check and encryption)", () => {
  it("refuses to start without an age public key, writing nothing", () => {
    const run = dump({ DATABASE_URL: urlOf(SOURCE, READER), AGE_RECIPIENT: "" });

    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/AGE_RECIPIENT is not an age public key/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("dumps as the read-only role and leaves only the encrypted file", () => {
    const run = dump({ DATABASE_URL: urlOf(SOURCE, READER), AGE_RECIPIENT: recipient });

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/^Dumped: \d+ bytes/m);
    expect(run.stdout).toMatch(/^Checked: \d+ tables with data; none for dictionary_entries/m);
    expect(run.stdout).toMatch(/^Encrypted: \d+ bytes/m);
    expect(run.stdout).not.toContain(PASSWORD);
    expect(readdirSync(dir)).toEqual(["2026-10-27-0317.dump.age"]);
    expect(readFileSync(backup).subarray(0, 21).toString()).toBe("age-encryption.org/v1");
  });
});

describe("backup:restore", () => {
  it("with another key: can't decrypt, and the database stays empty", async () => {
    await expect(
      restoreBackup({
        file: backup,
        databaseUrl: urlOf(TARGET, OWNER),
        dictionary: SAMPLE,
        askKey: async () => ageKeyPair().key,
      }),
    ).rejects.toThrow(/Couldn't decrypt the backup: .*no identity matched/);

    const { rows } = await target.execute(
      sql`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname IN ('public', 'drizzle')`,
    );
    expect(rows).toEqual([{ n: 0 }]);
  });

  it("restores every table's rows, the excluded tables empty but there, the dictionary loaded", async () => {
    // As the script, with the key piped in as its first line.
    const run = spawnSync(
      join(SERVER, "node_modules/.bin/tsx"),
      ["scripts/backup-restore.ts", backup, SAMPLE, THEMES],
      {
        cwd: SERVER,
        input: `${key}\n`,
        env: { ...env, DATABASE_URL: urlOf(TARGET, OWNER) },
        encoding: "utf8",
      },
    );

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    const lines = run.stdout.split("\n");
    expect(lines.slice(0, 6)).toEqual([
      `Database: ${databaseName(urlOf(TARGET, OWNER))}`,
      expect.stringMatching(/^Restored in [\d.]+ s$/),
      expect.stringMatching(/^Dictionary: \d+ entries and \d+ forms in [\d.]+ s$/),
      // gehen had none: the restored dictionary gives it its themes (none, decided).
      "Themes: 13 dictionary words; 1 saved word without themes got them.",
      "",
      "Rows per table:",
    ]);
    expect(run.stdout).not.toContain(key);
    expect(run.stdout).not.toContain(PASSWORD);
    const counts = await tableCounts(target);
    expect(lines.slice(6, -1)).toEqual(formatCounts(counts));
    const signIns = ["auth_sessions", "auth_verifications", "auth_rate_limits"];
    expect(counts).toEqual(
      sourceCounts.map(({ table, rows }) => ({ table, rows: signIns.includes(table) ? 0 : rows })),
    );
    // Each table had rows to lose, the excluded ones included.
    for (const { table, rows } of sourceCounts) expect(rows, table).toBeGreaterThan(0);
    expect(excludedTables().filter((table) => !signIns.includes(table))).toEqual([
      "dictionary_entries",
      "dictionary_forms",
      "dictionary_themes",
    ]);
    // The words' themes and the learner's own come back with the words; a word without themes
    // gets the dictionary's as it loads.
    const { rows: themes } = await target.execute(sql`
      SELECT w.lemma, w.themes, uw.themes AS own FROM user_words uw JOIN words w ON w.id = uw.word_id
      WHERE uw.user_id = 1 ORDER BY lower(w.lemma)`);
    expect(themes).toEqual([
      { lemma: "gehen", themes: [], own: null },
      { lemma: "Tisch", themes: ["home"], own: ["work"] },
    ]);
    // A word's answers in two rounds both come back, each with its round.
    const { rows: answers } = await target.execute(sql`
      SELECT user_word_id, round, result FROM card_results ORDER BY round`);
    expect(answers).toEqual([
      { user_word_id: 1, round: 1, result: "didnt_know" },
      { user_word_id: 1, round: 2, result: "knew" },
    ]);
  });

  it("leaves a database the app takes as it is", async () => {
    const journal = JSON.parse(readFileSync(JOURNAL, "utf8")) as { entries: unknown[] };
    const migrations = async () =>
      (await target.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)).rows;

    // Every migration recorded, so `pnpm db:migrate` finds nothing to do.
    expect(await migrations()).toEqual([{ n: journal.entries.length }]);
    await runMigrations(target);
    expect(await migrations()).toEqual([{ n: journal.entries.length }]);
    // Better Auth's schema check, pg_trgm, and ids that go on from the backup's.
    const ctx = await testAuth(target).$context;
    await expect(Promise.resolve(ctx.checkSchema?.())).resolves.toBeUndefined();
    const { rows: similar } = await target.execute(sql`
      SELECT lemma FROM dictionary_entries WHERE lower(lemma) % 'tisch' ORDER BY lemma LIMIT 1`);
    expect(similar).toEqual([{ lemma: "Tisch" }]);
    const { rows: created } = await target.execute(sql`
      INSERT INTO users (name, learner_language, target_language) VALUES ('New', 'en', 'de')
      RETURNING id`);
    expect(created).toEqual([{ id: 3 }]);
  });

  it("refuses to restore again into the database it filled", async () => {
    await expect(
      restoreBackup({
        file: backup,
        databaseUrl: urlOf(TARGET, OWNER),
        dictionary: SAMPLE,
        askKey: async () => key,
      }),
    ).rejects.toThrow(/The database isn't empty/);
  });
});
