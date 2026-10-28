// Restores a nightly backup (docs/design.md §18.6) into DATABASE_URL, which must be empty: asks for
// the private age key (typed hidden, or the first line piped in; never written anywhere), decrypts
// the file straight into PostgreSQL 17's pg_restore, loads the dictionary as import:wiktionary does,
// then prints every table's row count. Refuses a database that isn't empty, changing nothing.
//
//   pnpm --filter server backup:restore <file.dump.age> [dictionary.jsonl]
//
// Works on DATABASE_URL from .env (or the environment). The Mac's dev database isn't empty, so a
// restore goes into a new one (§18.9). Needs age and PostgreSQL 17's client (§14).
import { resolve } from "node:path";
import { loadEnvFile, parseConfig } from "../src/config";
import { DEFAULT_DICTIONARY, formatCounts, restoreBackup } from "./backup";
import { askSecret, databaseName } from "./prompt";

const [file, dictionary] = process.argv.slice(2);
if (!file) {
  console.error("Usage: backup:restore <file.dump.age> [dictionary.jsonl]");
  process.exit(1);
}
const fromHere = (path: string) => resolve(process.env.INIT_CWD ?? process.cwd(), path);

loadEnvFile();
const { DATABASE_URL } = parseConfig(process.env);
try {
  console.log(`Database: ${databaseName(DATABASE_URL)}`);
  const counts = await restoreBackup({
    file: fromHere(file),
    databaseUrl: DATABASE_URL,
    dictionary: dictionary ? fromHere(dictionary) : DEFAULT_DICTIONARY,
    askKey: () => askSecret("Private key (AGE-SECRET-KEY-1…, hidden): "),
    log: (line) => console.log(line),
  });
  console.log("\nRows per table:");
  for (const line of formatCounts(counts)) console.log(line);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
