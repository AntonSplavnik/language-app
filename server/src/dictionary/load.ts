import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import type { Pos } from "@language-app/core";
import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { dictionaryEntries, dictionaryForms } from "../db/schema";
import { type DictionaryRow, type FormRow, mapLine } from "./kaikki";

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
};

/**
 * Replaces dictionary_entries and dictionary_forms with the contents of a kaikki.org JSONL file
 * (`.jsonl` or `.jsonl.gz`), in one transaction: readers see either the old tables or the new
 * ones (§7).
 */
export async function loadDictionary(
  db: Db,
  path: string,
  onProgress?: (result: LoadResult) => void,
): Promise<LoadResult> {
  const result: LoadResult = { read: 0, inserted: 0, forms: 0, invalid: 0, byPos: {} };

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
  });

  return result;
}
