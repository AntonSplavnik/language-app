import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import pg from "pg";
import { createDb, type Db } from "../src/db/client";
import { DICTIONARY_THEMES_FILE, loadDictionary, themesLine } from "../src/dictionary/load";

// The nightly backups' tooling on the Mac (docs/design.md §18.6): the read-only role the dump runs
// as, restoring a backup, and the row counts a restore is compared by. The dump itself is
// backup-dump.sh, which the workflow runs.

/** The script the nightly workflow runs: dump, check, encrypt. */
export const DUMP_SCRIPT = fileURLToPath(new URL("./backup-dump.sh", import.meta.url));

/** The dictionary backup:restore loads when no other file is given (§7). */
export const DEFAULT_DICTIONARY = fileURLToPath(
  new URL("../../data/kaikki/kaikki.org-dictionary-German.jsonl", import.meta.url),
);

/** The tables backed up without their data, as backup-dump.sh lists them (its one list). */
export function excludedTables(): string[] {
  const line = /^EXCLUDED_TABLES="([^"]*)"$/m.exec(readFileSync(DUMP_SCRIPT, "utf8"));
  if (!line?.[1]) throw new Error(`No EXCLUDED_TABLES in ${DUMP_SCRIPT}`);
  return line[1].split(" ");
}

// age's X25519 identity: Bech32, upper-case, 32 bytes. age-keygen's default (not its -pq keys,
// which the runner's age 1.1 can't use).
const AGE_SECRET_KEY = /^AGE-SECRET-KEY-1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{58}$/;

/** The private key as pasted, trimmed; an error that never repeats what was pasted. */
export function parseAgeKey(text: string): string {
  const key = text.trim();
  if (AGE_SECRET_KEY.test(key)) return key;
  if (key.startsWith("age1")) {
    throw new Error("That is the public key (age1…); the private one starts AGE-SECRET-KEY-1");
  }
  throw new Error(
    "That isn't an age private key: one line, AGE-SECRET-KEY-1 and 58 more letters and digits",
  );
}

/**
 * How libpq's tools (pg_restore) connect to a database URL: the URL without its password, which
 * goes into the environment instead of the command line. Neon's strings carry
 * `sslmode=verify-full`, which libpq checks against `~/.postgresql/root.crt` unless told to use the
 * system's certificates; node-postgres can't take `sslrootcert=system` in the URL (it reads it as a
 * file), so it is set here, for libpq only.
 */
export function libpqTarget(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): { dbname: string; env: Record<string, string> } {
  const target = new URL(url);
  const extra: Record<string, string> = {};
  if (target.password) extra.PGPASSWORD = decodeURIComponent(target.password);
  target.password = "";
  const verifyFull = target.searchParams.get("sslmode") === "verify-full";
  if (verifyFull && !target.searchParams.has("sslrootcert") && !env.PGSSLROOTCERT) {
    extra.PGSSLROOTCERT = "system";
  }
  return { dbname: target.href, env: extra };
}

/** Where PostgreSQL 17's client is: Homebrew's keg-only postgresql@17, the runner's, or PATH. */
export function pg17Bin(env: NodeJS.ProcessEnv = process.env): string {
  const dirs = [
    "/opt/homebrew/opt/postgresql@17/bin",
    "/usr/local/opt/postgresql@17/bin",
    "/usr/lib/postgresql/17/bin",
    ...(env.PATH ?? "").split(delimiter),
  ];
  for (const dir of dirs) {
    const tool = join(dir, "pg_restore");
    if (
      dir &&
      existsSync(tool) &&
      / 17\.\d+/.test(execFileSync(tool, ["--version"], { encoding: "utf8" }))
    ) {
      return dir;
    }
  }
  throw new Error("Needs PostgreSQL 17's pg_restore: brew install postgresql@17");
}

/** age's version, or an error saying how to get it. */
export function ageVersion(): string {
  try {
    return execFileSync("age", ["--version"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error("Needs age: brew install age");
  }
}

/**
 * What makes a database not empty for a restore: any table, view or sequence outside PostgreSQL's
 * own schemas, and a `drizzle` schema (pg_restore creates it).
 */
export async function databaseContents(db: Db): Promise<string[]> {
  const { rows } = await db.execute<{ name: string }>(sql`
    SELECT format('%I.%I', n.nspname, c.relname) AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      AND n.nspname <> 'information_schema' AND n.nspname NOT LIKE 'pg\_%'
    UNION ALL
    SELECT format('schema %I', nspname) FROM pg_namespace WHERE nspname = 'drizzle'
    ORDER BY name`);
  return rows.map((row) => row.name);
}

export type TableCount = { table: string; rows: number };

/**
 * The exact row count of every table in `public` and `drizzle` (`drizzle.__drizzle_migrations`),
 * in one read-only transaction, so the counts belong together.
 */
export async function tableCounts(db: Db): Promise<TableCount[]> {
  return db.transaction(
    async (tx) => {
      const { rows: tables } = await tx.execute<{ schema: string; name: string }>(sql`
        SELECT schemaname AS schema, tablename AS name FROM pg_tables
        WHERE schemaname IN ('public', 'drizzle')
        ORDER BY schemaname = 'drizzle', tablename`);
      const counts: TableCount[] = [];
      for (const { schema, name } of tables) {
        const { rows } = await tx.execute<{ n: number }>(
          sql`SELECT count(*)::int AS n FROM ${sql.identifier(schema)}.${sql.identifier(name)}`,
        );
        counts.push({
          table: schema === "public" ? name : `${schema}.${name}`,
          rows: rows[0]?.n ?? 0,
        });
      }
      return counts;
    },
    { accessMode: "read only" },
  );
}

/** One line per table, the excluded ones marked, for comparing two databases by eye or `diff`. */
export function formatCounts(counts: TableCount[], excluded = excludedTables()): string[] {
  const width = Math.max(...counts.map((count) => count.table.length));
  return counts.map(({ table, rows }) => {
    const line = `  ${table.padEnd(width)}  ${String(rows).padStart(9)}`;
    return excluded.includes(table) ? `${line}  (not in backups)` : line;
  });
}

export type RestoreOptions = {
  /** The encrypted backup, `YYYY-MM-DD-HHMM.dump.age`. */
  file: string;
  /** An empty database. */
  databaseUrl: string;
  /** The kaikki.org file to load the dictionary from. */
  dictionary: string;
  /** The dictionary's themes (§7 Themes); the repo's file unless another is given. */
  themes?: string;
  /** The private key, asked for only once the database is known to be empty. */
  askKey: () => Promise<string>;
  log?: (line: string) => void;
};

/**
 * Restores a backup into an empty database (§18.6): decrypted by age with the key on its stdin and
 * streamed straight into PostgreSQL 17's pg_restore, so no plain dump or key is ever on disk, in one
 * transaction; then the dictionary is loaded. Refuses, changing nothing, a database that isn't
 * empty. Returns the row counts of the restored database.
 */
export async function restoreBackup(options: RestoreOptions): Promise<TableCount[]> {
  const log = options.log ?? (() => {});
  if (!existsSync(options.file)) throw new Error(`No such file: ${options.file}`);
  if (!existsSync(options.dictionary)) {
    throw new Error(`No dictionary at ${options.dictionary} (§7: the kaikki.org German JSONL)`);
  }
  const db = createDb(options.databaseUrl);
  try {
    const contents = await databaseContents(db);
    if (contents.length > 0) {
      const some = contents.slice(0, 3).join(", ");
      throw new Error(
        `The database isn't empty (${contents.length} objects, such as ${some}); ` +
          "backup:restore restores only into an empty database. Nothing was changed.",
      );
    }
    const bin = pg17Bin();
    ageVersion();
    const key = parseAgeKey(await options.askKey());

    let started = performance.now();
    await decryptAndRestore(options.file, key, join(bin, "pg_restore"), options.databaseUrl);
    log(`Restored in ${seconds(started)} s`);

    started = performance.now();
    const themes = options.themes ?? DICTIONARY_THEMES_FILE;
    const dictionary = await loadDictionary(db, options.dictionary, { themes });
    log(
      `Dictionary: ${dictionary.inserted} entries and ${dictionary.forms} forms in ${seconds(started)} s`,
    );
    log(themesLine(dictionary, themes));
    return await tableCounts(db);
  } finally {
    await db.$client.end();
  }
}

const seconds = (since: number) => ((performance.now() - since) / 1000).toFixed(1);

/**
 * `age --decrypt --identity -` (the key on stdin) piped into `pg_restore`. pg_restore leaves out
 * owners and grants (the restoring role owns everything, as `neondb_owner` does on Neon) and runs in
 * one transaction, so a failure leaves the database empty again.
 */
function decryptAndRestore(
  file: string,
  key: string,
  pgRestore: string,
  databaseUrl: string,
): Promise<void> {
  const target = libpqTarget(databaseUrl);
  const age = spawn("age", ["--decrypt", "--identity", "-", file], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const restore = spawn(
    pgRestore,
    [
      "--no-owner",
      "--no-acl",
      "--single-transaction",
      "--exit-on-error",
      `--dbname=${target.dbname}`,
    ],
    { stdio: [age.stdout, "ignore", "pipe"], env: { ...process.env, ...target.env } },
  );
  // pg_restore has its own end of the pipe now. Without closing ours, age would never count as
  // closed, nor stop writing if pg_restore stopped reading.
  age.stdout.destroy();
  age.stdin.end(`${key}\n`);

  const finished = (child: ChildProcess) =>
    new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });
      child.once("error", reject);
      child.once("close", (code) => resolve({ code, stderr: stderr.trim() }));
    });

  return Promise.all([finished(age), finished(restore)]).then(([decrypted, restored]) => {
    if (decrypted.code !== 0) {
      throw new Error(
        `Couldn't decrypt the backup: ${decrypted.stderr || `age exit ${decrypted.code}`}`,
      );
    }
    if (restored.code !== 0) {
      throw new Error(
        `pg_restore failed, and its transaction was rolled back: ${restored.stderr || `exit ${restored.code}`}`,
      );
    }
  });
}

/**
 * Creates the read-only role the nightly dump runs as (§18.5), or gives it a new password, and
 * grants it what pg_dump needs: CONNECT, USAGE on `public` and `drizzle`, SELECT on their tables and
 * sequences, and the same on the tables and sequences the role running this creates later (the
 * owner, who also migrates). Without a password, an existing role only gets its grants again (after
 * a restore, which leaves grants out). The password goes to the server in the statement, over the
 * connection, and nowhere else.
 */
export async function setUpBackupRole(
  db: Db,
  role: string,
  password: string | undefined,
): Promise<"created" | "password changed" | "grants renewed"> {
  if (password !== undefined && password.length < 32) {
    throw new Error("The password must be at least 32 characters (openssl rand -hex 32)");
  }
  const name = pg.escapeIdentifier(role);
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`SELECT 1 FROM pg_roles WHERE rolname = ${role}`);
    const exists = rows.length > 0;
    if (!exists && password === undefined) {
      throw new Error(`There is no role ${role} yet: set BACKUP_ROLE_PASSWORD to create it`);
    }
    const { rows: schemas } = await tx.execute(
      sql`SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle'`,
    );
    if (schemas.length === 0) throw new Error("No drizzle schema: run the migrations first");
    const run = (statement: string) => tx.execute(sql.raw(statement));

    if (password !== undefined) {
      const verb = exists ? "ALTER" : "CREATE";
      await run(`${verb} ROLE ${name} LOGIN PASSWORD ${pg.escapeLiteral(password)}`);
    }
    const { rows: database } = await tx.execute<{ name: string }>(
      sql`SELECT current_database() AS name`,
    );
    await run(
      `GRANT CONNECT ON DATABASE ${pg.escapeIdentifier(String(database[0]?.name))} TO ${name}`,
    );
    await run(`GRANT USAGE ON SCHEMA public, drizzle TO ${name}`);
    await run(`GRANT SELECT ON ALL TABLES IN SCHEMA public, drizzle TO ${name}`);
    await run(`GRANT SELECT ON ALL SEQUENCES IN SCHEMA public, drizzle TO ${name}`);
    await run(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public, drizzle GRANT SELECT ON TABLES TO ${name}`,
    );
    await run(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public, drizzle GRANT SELECT ON SEQUENCES TO ${name}`,
    );
    return exists ? (password === undefined ? "grants renewed" : "password changed") : "created";
  });
}
