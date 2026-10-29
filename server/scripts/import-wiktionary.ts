// Loads the kaikki.org German dictionary into dictionary_entries and its inflected forms into
// dictionary_forms (docs/design.md §7), and the dictionary's themes from the repo's
// server/data/dictionary-themes.tsv into dictionary_themes (§7 Themes), replacing what is there; saved
// words without themes then get the dictionary's. Accepts the German JSONL or the gzipped
// all-languages raw dump. Without the themes file it loads no themes and says so.
//
//   pnpm --filter server import:wiktionary <file.jsonl | file.jsonl.gz> [--themes <file.tsv>]
//
// --themes loads another themes file, e.g. a sample's to try it on a copy of a database.
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadEnvFile, parseConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { DICTIONARY_THEMES_FILE, loadDictionary, themesLine } from "../src/dictionary/load";
import { databaseName } from "./prompt";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { themes: { type: "string" } },
});
const [file] = positionals;
if (!file || positionals.length > 1) {
  console.error("Usage: import:wiktionary <file.jsonl | file.jsonl.gz> [--themes <file.tsv>]");
  process.exit(1);
}
const fromHere = (path: string) => resolve(process.env.INIT_CWD ?? process.cwd(), path);
const themes = values.themes ? fromHere(values.themes) : DICTIONARY_THEMES_FILE;

loadEnvFile();
const { DATABASE_URL } = parseConfig(process.env);
console.log(`Database: ${databaseName(DATABASE_URL)}`);
const db = createDb(DATABASE_URL);
const started = performance.now();
try {
  const result = await loadDictionary(db, fromHere(file), {
    themes,
    onProgress: ({ read, inserted }) => {
      if (inserted % 20_000 === 0)
        console.log(`  ${read} lines read, ${inserted} entries written…`);
    },
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    `\nRead ${result.read} lines, wrote ${result.inserted} entries and ${result.forms} forms in ${seconds} s.`,
  );
  console.log(themesLine(result, themes));
  if (result.invalid > 0) console.log(`Skipped ${result.invalid} lines that were not valid JSON.`);
  console.table(result.byPos);
} finally {
  await db.$client.end();
}
