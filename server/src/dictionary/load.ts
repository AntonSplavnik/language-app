import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";
import type { Pos } from "@language-app/core";
import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { dictionaryEntries, dictionaryForms } from "../db/schema";
import { type DictionaryRow, type FormRow, mapLine } from "./kaikki";
import { parseThemesFile, replaceDictionaryThemes, themesFromDictionary } from "./themes";

/** The dictionary run's result (§7 Themes), committed to the repo; see themes.ts for its format. */
export const DICTIONARY_THEMES_FILE = fileURLToPath(
  new URL("../../data/dictionary-themes.tsv", import.meta.url),
);

/**
 * Rows per INSERT: as many as PostgreSQL's 65,535 parameters allow with room to spare (an entry
 * has 9 columns, a form 3), so the ≈350k rows take few round trips.
 */
const ENTRY_BATCH = 5000;
const FORM_BATCH = 15000;

export type LoadResult = {
  /** Lines read from the file. */
  read: number;
  /** Rows written to dictionary_entries. */
  inserted: number;
  /** Rows written to dictionary_forms: each form once per base word. */
  forms: number;
  /** Lines that were not valid JSON. */
  invalid: number;
  byPos: Partial<Record<Pos, number>>;
  /** Rows written to dictionary_themes; null when there was no themes file to load (§7 Themes). */
  themes: number | null;
  /** Existing words without themes that got the dictionary's. */
  wordsThemed: number;
};

export type LoadOptions = {
  /**
   * The dictionary's themes file (`DICTIONARY_THEMES_FILE`, §7 Themes). When it is missing, or not
   * given, dictionary_themes and the words are left as they are.
   */
  themes?: string;
  onProgress?: (result: LoadResult) => void;
};

/**
 * What a load did with the themes, for the scripts that load the dictionary (import:wiktionary,
 * backup:restore): how many it loaded, or a note that there was no file.
 */
export function themesLine(result: LoadResult, file: string): string {
  if (result.themes === null) {
    return (
      `Themes: none loaded, no file at ${file}. It comes from the dictionary run ` +
      "(themes:classify, docs/design.md §7 Themes); dictionary_themes and the words are unchanged."
    );
  }
  const words = result.wordsThemed === 1 ? "word" : "words";
  return `Themes: ${result.themes} dictionary words; ${result.wordsThemed} saved ${words} without themes got them.`;
}

/**
 * Replaces dictionary_entries and dictionary_forms with the contents of a kaikki.org JSONL file
 * (`.jsonl` or `.jsonl.gz`), and dictionary_themes with the themes file, in one transaction:
 * readers see either the old tables or the new ones (§7). Then the words still without themes get
 * the dictionary's, in the same transaction (§7 Themes).
 */
export async function loadDictionary(
  db: Db,
  path: string,
  { themes: themesFile, onProgress }: LoadOptions = {},
): Promise<LoadResult> {
  const result: LoadResult = {
    read: 0,
    inserted: 0,
    forms: 0,
    invalid: 0,
    byPos: {},
    themes: null,
    wordsThemed: 0,
  };
  // Read first, so a file that can't be read stops the load before anything changes.
  const themes =
    themesFile && existsSync(themesFile)
      ? parseThemesFile(await readFile(themesFile, "utf8"))
      : null;

  await db.transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE ${dictionaryEntries}, ${dictionaryForms} RESTART IDENTITY`);

    // Building an index once over the loaded rows is far quicker than keeping it up to date row
    // by row (the trigram index most of all: ≈11 s of the load). So the indexes that no
    // constraint needs are dropped here and made again from their own definitions at the end.
    const { rows: indexes } = await tx.execute<{ name: string; definition: string }>(sql`
      SELECT i.indexname AS name, i.indexdef AS definition
      FROM pg_indexes i
      WHERE i.schemaname = current_schema()
        AND i.tablename IN ('dictionary_entries', 'dictionary_forms')
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          WHERE c.conindid = format('%I.%I', i.schemaname, i.indexname)::regclass
        )`);
    for (const index of indexes) await tx.execute(sql`DROP INDEX ${sql.identifier(index.name)}`);

    // Open the file only now and iterate straight away: lines (and the end of the file) emitted
    // before the iterator exists are lost, which would leave the loop waiting forever.
    const file = createReadStream(path);
    const input = path.endsWith(".gz") ? file.pipe(createGunzip()) : file;
    const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });

    let entries: DictionaryRow[] = [];
    let forms: FormRow[] = [];
    // A form can come from several entries (schneller: comparative, and inflected): keep it once.
    const seenForms = new Set<string>();

    const flushEntries = async () => {
      if (entries.length === 0) return;
      await tx.insert(dictionaryEntries).values(entries);
      result.inserted += entries.length;
      entries = [];
      onProgress?.(result);
    };
    // ≈250k forms: three array parameters per batch, so no INSERT with 45,000 values is built.
    const flushForms = async () => {
      if (forms.length === 0) return;
      const column = (pick: (form: FormRow) => string) => sql.param(forms.map(pick));
      await tx.execute(sql`
        INSERT INTO ${dictionaryForms} (form, lemma, pos)
        SELECT * FROM unnest(
          ${column((f) => f.form)}::text[],
          ${column((f) => f.lemma)}::text[],
          ${column((f) => f.pos)}::text[]
        )`);
      result.forms += forms.length;
      forms = [];
    };

    for await (const line of lines) {
      if (!line.trim()) continue;
      result.read++;
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        result.invalid++;
        continue;
      }
      const mapped = mapLine(raw);
      if (mapped.entry) {
        result.byPos[mapped.entry.pos] = (result.byPos[mapped.entry.pos] ?? 0) + 1;
        entries.push(mapped.entry);
        if (entries.length >= ENTRY_BATCH) await flushEntries();
      }
      for (const form of mapped.forms) {
        const key = `${form.form}\u0000${form.lemma}\u0000${form.pos}`;
        if (seenForms.has(key)) continue;
        seenForms.add(key);
        forms.push(form);
        if (forms.length >= FORM_BATCH) await flushForms();
      }
    }
    await flushEntries();
    await flushForms();

    for (const index of indexes) await tx.execute(sql.raw(index.definition));

    if (themes) {
      await replaceDictionaryThemes(tx, themes);
      result.themes = themes.length;
      result.wordsThemed = await themesFromDictionary(tx);
    }
  });

  return result;
}
