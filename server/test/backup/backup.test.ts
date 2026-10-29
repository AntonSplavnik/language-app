import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  excludedTables,
  formatCounts,
  libpqTarget,
  parseAgeKey,
  restoreBackup,
  setUpBackupRole,
  tableCounts,
} from "../../scripts/backup";
import { databaseName } from "../../scripts/prompt";
import { createDb } from "../../src/db/client";
import * as schema from "../../src/db/schema";
import { words } from "../../src/db/schema";
import { useTestDb } from "../helpers/db";
import { testDatabaseUrl } from "../helpers/env";

// The nightly backups' tooling that needs neither age nor pg_dump (docs/design.md §18.6): which
// tables a backup leaves out, the key, libpq's connection, the row counts, the read-only role, and
// backup:restore refusing a database that isn't empty. The round trip is backup.backup.test.ts.

const db = useTestDb();
const SERVER = fileURLToPath(new URL("../../", import.meta.url));
const SAMPLE = fileURLToPath(new URL("../fixtures/kaikki-sample.jsonl", import.meta.url));
// Shaped as age's keys; a real pair checked in would look like a leaked secret to scanners.
const KEY = `AGE-SECRET-KEY-1${"QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L".repeat(2).slice(0, 58)}`;
const PUBLIC_KEY = `age1${"q".repeat(58)}`;

const schemaTables = Object.values(schema)
  .filter((value) => is(value, PgTable))
  .map((table) => getTableName(table))
  .sort();

/** Every table a backup keeps with its data; a new table must be added here or to the exclusions. */
const BACKED_UP = [
  "ai_usage",
  "auth_accounts",
  "card_results",
  "group_words",
  "groups",
  "imports",
  "invites",
  "sessions",
  "user_words",
  "users",
  "word_translations",
  "words",
];

describe("the tables a backup leaves the data of (backup-dump.sh)", () => {
  it("are the dictionary and the sign-ins, each a table of the schema", () => {
    expect(excludedTables()).toEqual([
      "dictionary_entries",
      "dictionary_forms",
      "dictionary_themes",
      "auth_sessions",
      "auth_verifications",
      "auth_rate_limits",
    ]);
    for (const table of excludedTables()) expect(schemaTables, table).toContain(table);
  });

  it("with the tables kept whole, cover the schema, each table once", () => {
    expect([...BACKED_UP, ...excludedTables()].sort()).toEqual(schemaTables);
  });

  it("are the workflow's: backup.yml runs backup-dump.sh and lists no table of its own", () => {
    const workflow = readFileSync(
      fileURLToPath(new URL("../../../.github/workflows/backup.yml", import.meta.url)),
      "utf8",
    );
    expect(workflow).toContain("server/scripts/backup-dump.sh");
    expect(workflow).not.toMatch(/exclude-table/);
  });
});

describe("parseAgeKey", () => {
  it("takes a private key, trimmed", () => {
    expect(parseAgeKey(`  ${KEY}\n`)).toBe(KEY);
  });

  it.each([
    ["nothing", ""],
    ["a key cut short", KEY.slice(0, -1)],
    ["a key in lower case", KEY.toLowerCase()],
    ["a key with a letter Bech32 doesn't have", `${KEY.slice(0, -1)}B`],
    ["a whole key file", `# created: 2026-10-27\n# public key: ${PUBLIC_KEY}\n${KEY}`],
  ])("refuses %s, without repeating it", (_, text) => {
    expect(() => parseAgeKey(text)).toThrow(/isn't an age private key/);
    try {
      parseAgeKey(text);
    } catch (error) {
      expect(String(error)).not.toContain(KEY.slice(20));
    }
  });

  it("says so when given the public key", () => {
    expect(() => parseAgeKey(PUBLIC_KEY)).toThrow(/That is the public key/);
  });
});

describe("libpqTarget: how pg_restore connects", () => {
  it("moves the password from the URL into PGPASSWORD", () => {
    expect(libpqTarget("postgres://app:p%40ss@localhost:5432/drill", {})).toEqual({
      dbname: "postgres://app@localhost:5432/drill",
      env: { PGPASSWORD: "p@ss" },
    });
  });

  it("checks Neon's certificate against the system's authorities with verify-full", () => {
    const neon =
      "postgresql://neondb_owner:secret@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require";
    expect(libpqTarget(neon, {})).toEqual({
      dbname:
        "postgresql://neondb_owner@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require",
      env: { PGPASSWORD: "secret", PGSSLROOTCERT: "system" },
    });
    // Unless a root certificate is already chosen, in the URL or the environment.
    expect(libpqTarget(`${neon}&sslrootcert=/ca.pem`, {}).env).toEqual({ PGPASSWORD: "secret" });
    expect(libpqTarget(neon, { PGSSLROOTCERT: "/ca.pem" }).env).toEqual({ PGPASSWORD: "secret" });
  });
});

describe("tableCounts (db:counts)", () => {
  it("counts every table of public and drizzle exactly, the excluded ones marked", async () => {
    await db.insert(words).values([
      { language: "de", lemma: "Tisch", pos: "noun", article: "der", checkStatus: "match" },
      { language: "de", lemma: "gehen", pos: "verb", checkStatus: "match" },
    ]);

    const counts = await tableCounts(db);

    expect(counts.map((count) => count.table)).toEqual([
      ...schemaTables,
      "drizzle.__drizzle_migrations",
    ]);
    const rows = Object.fromEntries(counts.map((count) => [count.table, count.rows]));
    expect(rows).toMatchObject({ words: 2, users: 1, user_words: 0 });
    expect(rows["drizzle.__drizzle_migrations"]).toBeGreaterThan(0);

    const lines = formatCounts(counts);
    expect(lines.find((line) => line.trimStart().startsWith("words "))).toMatch(/ 2$/);
    expect(lines.find((line) => line.includes("auth_sessions"))).toMatch(
      / 0 {2}\(not in backups\)$/,
    );
  });
});

describe("setUpBackupRole (backup:role)", () => {
  const role = `${new URL(testDatabaseUrl()).pathname.slice(1)}_backup_reader`;
  const password = "0123456789abcdef0123456789abcdef";
  const asRole = () => {
    const url = new URL(testDatabaseUrl());
    url.username = role;
    url.password = password;
    return createDb(url.toString());
  };

  afterAll(async () => {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS backup_probe`));
    await db.execute(sql.raw(`DROP OWNED BY ${role}`)).catch(() => {});
    await db.execute(sql.raw(`DROP ROLE IF EXISTS ${role}`));
  });

  it("makes a role that reads every table and sequence, now and later, and writes nothing", async () => {
    await db.execute(sql.raw(`DROP ROLE IF EXISTS ${role}`));
    expect(await setUpBackupRole(db, role, password)).toBe("created");
    // A table made after the grants, as a later migration would.
    await db.execute(sql`CREATE TABLE backup_probe (id serial PRIMARY KEY)`);

    const reader = asRole();
    try {
      await expect(tableCounts(reader)).resolves.toContainEqual({ table: "users", rows: 1 });
      await expect(reader.execute(sql`SELECT * FROM backup_probe_id_seq`)).resolves.toBeTruthy();
      // Straight through node-postgres, whose errors are PostgreSQL's own.
      await expect(reader.$client.query("DELETE FROM users")).rejects.toThrow(/permission denied/);
      await expect(reader.$client.query("CREATE TABLE intruder (id int)")).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await reader.$client.end();
    }
  });

  it("gives a new password, or only the grants again, and won't create a role without one", async () => {
    expect(await setUpBackupRole(db, role, `${password}0`)).toBe("password changed");
    expect(await setUpBackupRole(db, role, undefined)).toBe("grants renewed");
    await expect(setUpBackupRole(db, `${role}_none`, undefined)).rejects.toThrow(
      /set BACKUP_ROLE_PASSWORD/,
    );
    await expect(setUpBackupRole(db, role, "short")).rejects.toThrow(/at least 32 characters/);
  });
});

describe("backup:restore refuses a database that isn't empty", () => {
  it("before asking for the key, changing nothing", async () => {
    await db
      .insert(words)
      .values({ language: "de", lemma: "Tisch", pos: "noun", checkStatus: "match" });
    const before = await tableCounts(db);
    const askKey = vi.fn(async () => KEY);

    await expect(
      restoreBackup({ file: SAMPLE, databaseUrl: testDatabaseUrl(), dictionary: SAMPLE, askKey }),
    ).rejects.toThrow(/The database isn't empty \(\d+ objects, such as .*\).*Nothing was changed/);

    expect(askKey).not.toHaveBeenCalled();
    expect(await tableCounts(db)).toEqual(before);
  });

  it("as the script: the database first, then the refusal, exit code 1", () => {
    const run = spawnSync(
      `${SERVER}node_modules/.bin/tsx`,
      ["scripts/backup-restore.ts", SAMPLE, SAMPLE],
      { cwd: SERVER, env: { ...process.env, DATABASE_URL: testDatabaseUrl() }, encoding: "utf8" },
    );

    expect(run.status).toBe(1);
    expect(run.stdout).toBe(`Database: ${databaseName(testDatabaseUrl())}\n`);
    expect(run.stderr).toMatch(/The database isn't empty/);
  });
});
