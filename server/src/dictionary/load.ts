import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import type { Pos } from "@language-app/core";
import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { dictionaryEntries } from "../db/schema";
import { type DictionaryRow, mapEntry } from "./kaikki";

const BATCH_SIZE = 1000;

export type LoadResult = {
  /** Lines read from the file. */
  read: number;
  /** Rows written to dictionary_entries. */
  inserted: number;
  /** Lines that were not valid JSON. */
  invalid: number;
  byPos: Partial<Record<Pos, number>>;
};

/**
 * Replaces dictionary_entries with the contents of a kaikki.org JSONL file (`.jsonl` or
 * `.jsonl.gz`), in one transaction: readers see either the old table or the new one (§7).
 */
export async function loadDictionary(
  db: Db,
  path: string,
  onProgress?: (result: LoadResult) => void,
): Promise<LoadResult> {
  const result: LoadResult = { read: 0, inserted: 0, invalid: 0, byPos: {} };

  await db.transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE ${dictionaryEntries} RESTART IDENTITY`);

    // Open the file only now and iterate straight away: lines (and the end of the file) emitted
    // before the iterator exists are lost, which would leave the loop waiting forever.
    const file = createReadStream(path);
    const input = path.endsWith(".gz") ? file.pipe(createGunzip()) : file;
    const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });

    let batch: DictionaryRow[] = [];
    const flush = async () => {
      if (batch.length === 0) return;
      await tx.insert(dictionaryEntries).values(batch);
      result.inserted += batch.length;
      batch = [];
      onProgress?.(result);
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
      const row = mapEntry(raw);
      if (!row) continue;
      result.byPos[row.pos] = (result.byPos[row.pos] ?? 0) + 1;
      batch.push(row);
      if (batch.length >= BATCH_SIZE) await flush();
    }
    await flush();
  });

  return result;
}
