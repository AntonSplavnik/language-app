// Loads the kaikki.org German dictionary into dictionary_entries and its inflected forms into
// dictionary_forms (docs/design.md §7), replacing what is there. Accepts the German JSONL or the
// gzipped all-languages raw dump.
//
//   pnpm --filter server import:wiktionary <file.jsonl | file.jsonl.gz>
import { resolve } from "node:path";
import { loadEnvFile, parseConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { loadDictionary } from "../src/dictionary/load";

const file = process.argv[2];
if (!file) {
  console.error("Usage: import:wiktionary <file.jsonl | file.jsonl.gz>");
  process.exit(1);
}

loadEnvFile();
const db = createDb(parseConfig(process.env).DATABASE_URL);
const started = performance.now();
try {
  const result = await loadDictionary(
    db,
    resolve(process.env.INIT_CWD ?? process.cwd(), file),
    ({ read, inserted }) => {
      if (inserted % 20_000 === 0)
        console.log(`  ${read} lines read, ${inserted} entries written…`);
    },
  );
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    `\nRead ${result.read} lines, wrote ${result.inserted} entries and ${result.forms} forms in ${seconds} s.`,
  );
  if (result.invalid > 0) console.log(`Skipped ${result.invalid} lines that were not valid JSON.`);
  console.table(result.byPos);
} finally {
  await db.$client.end();
}
