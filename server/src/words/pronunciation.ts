import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { words } from "../db/schema";
import type { Pronunciation } from "../dictionary/kaikki";
import { type DictionaryEntry, entriesForWord, lookupWords, wordKey } from "../dictionary/lookup";

// A word's pronunciation (IPA and a recording on Wikimedia Commons) comes from the dictionary
// (docs/design.md §6.6, §7). Enrichment copies it to new words; the backfill below fills the
// words saved before it existed.

/**
 * The pronunciation of the first entry that has a recording, otherwise of the first one with IPA;
 * null when none has either. Pass the entries that describe the word (`entriesForWord`).
 */
export function pronunciationOf(entries: DictionaryEntry[]): Pronunciation | null {
  const entry = entries.find((e) => e.audioUrl) ?? entries.find((e) => e.ipa);
  if (!entry) return null;
  return { ipa: entry.ipa, audioFile: entry.audioFile, audioUrl: entry.audioUrl };
}

export type BackfillResult = {
  /** Words that had neither IPA nor a recording. */
  checked: number;
  /** Of those, the ones the dictionary had a pronunciation for. */
  updated: number;
};

/**
 * Copies the dictionary pronunciation to every German word that has none, choosing the entry as
 * enrichment does. Already-enriched words never pass through enrichment again, so this is how
 * they get one. Safe to run again: a word that has a pronunciation is never touched.
 */
export async function backfillPronunciation(db: Db): Promise<BackfillResult> {
  const missing = await db
    .select({ id: words.id, lemma: words.lemma, pos: words.pos, article: words.article })
    .from(words)
    .where(and(eq(words.language, "de"), isNull(words.ipa), isNull(words.audioUrl)))
    .orderBy(words.id);
  if (missing.length === 0) return { checked: 0, updated: 0 };

  const dictionary = await lookupWords(db, missing);
  let updated = 0;
  for (const word of missing) {
    const found = pronunciationOf(entriesForWord(word, dictionary.get(wordKey(word)) ?? []));
    if (!found) continue;
    const rows = await db
      .update(words)
      .set(found)
      .where(and(eq(words.id, word.id), isNull(words.ipa), isNull(words.audioUrl)))
      .returning({ id: words.id });
    updated += rows.length;
  }
  return { checked: missing.length, updated };
}
