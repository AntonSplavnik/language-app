import type { Pos } from "@language-app/core";
import { inArray, sql } from "drizzle-orm";
import type { Executor } from "../db/client";
import { dictionaryEntries } from "../db/schema";

export type DictionaryEntry = typeof dictionaryEntries.$inferSelect;
export type WordKey = { lemma: string; pos: Pos };

export const wordKey = ({ lemma, pos }: WordKey) => `${lemma}|${pos}`;

/**
 * Dictionary entries for many words in one query, keyed by `lemma|pos` (§6.3). For each word, the
 * first non-empty of:
 *   1. entries with the same part of speech and the exact lemma;
 *   2. the same part of speech, lemma ignoring case;
 *   3. for words other than nouns, entries of any other non-noun part of speech with that lemma
 *      (exact case first). Small words are labelled differently by different sources: Claude
 *      calls "nicht" a particle, Wiktionary an adverb. Nouns never fall back: their gender comes
 *      from the noun entry.
 * Every requested key is present in the result, with an empty list when nothing was found.
 */
export async function lookupWords(
  db: Executor,
  words: WordKey[],
): Promise<Map<string, DictionaryEntry[]>> {
  const result = new Map<string, DictionaryEntry[]>(words.map((w) => [wordKey(w), []]));
  if (words.length === 0) return result;

  const lowered = [...new Set(words.map((w) => w.lemma.toLowerCase()))];
  const rows = await db
    .select()
    .from(dictionaryEntries)
    .where(inArray(sql`lower(${dictionaryEntries.lemma})`, lowered))
    .orderBy(dictionaryEntries.id);

  for (const word of words) {
    const sameLemma = rows.filter((r) => r.lemma.toLowerCase() === word.lemma.toLowerCase());
    const exactFirst = (entries: DictionaryEntry[]) => {
      const exact = entries.filter((r) => r.lemma === word.lemma);
      return exact.length > 0 ? exact : entries;
    };

    let found = exactFirst(sameLemma.filter((r) => r.pos === word.pos));
    if (found.length === 0 && word.pos !== "noun") {
      found = exactFirst(sameLemma.filter((r) => r.pos !== "noun"));
    }
    result.set(wordKey(word), found);
  }
  return result;
}

/** Entries for one word; see {@link lookupWords}. */
export async function lookupWord(db: Executor, word: WordKey): Promise<DictionaryEntry[]> {
  return (await lookupWords(db, [word])).get(wordKey(word)) ?? [];
}
