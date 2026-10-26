import type { EnrichInputWord, EnrichOutput, VerbForms } from "@language-app/core";
import { and, count, eq, inArray, isNull, ne } from "drizzle-orm";
import type { AiClient } from "../ai/types";
import type { Learner } from "../auth/learner";
import type { Db } from "../db/client";
import { userWords, words, wordTranslations } from "../db/schema";
import { type DictionaryEntry, entriesForWord, lookupWords, wordKey } from "../dictionary/lookup";
import { pronunciationOf } from "./pronunciation";

// Enrichment (docs/design.md §6.6): example sentences for every word, plus the plural or verb
// forms the dictionary doesn't have; the pronunciation comes from the dictionary only.

export const ENRICH_BATCH_SIZE = 30;
/** Batches sent to the AI at the same time. */
export const ENRICH_PARALLEL_BATCHES = 3;

type Log = { warn: (details: object, message: string) => void };
export type EnrichDeps = { db: Db; ai: AiClient; log?: Log };
export type EnrichResult = { enriched: number; pending: number };

type Forms = { plural: string | null; forms: VerbForms | null };
type PendingWord = Awaited<ReturnType<typeof loadPending>>[number];

/**
 * Enriches the given words that are not enriched yet. Never throws for a failed AI call: those
 * words stay pending (`enriched_at` NULL) and can be retried. `pending` counts the given words
 * still without details afterwards.
 *
 * For an account without AI only the first step runs, the dictionary's forms and pronunciation;
 * the words stay unenriched, so an account with AI that adds them later gets their example
 * sentences, and `pending` is 0: there is nothing this account could add them with (§6.7).
 */
export async function enrichWords(
  { db, ai, log }: EnrichDeps,
  {
    learner,
    importId = null,
    wordIds,
  }: { learner: Learner; importId?: number | null; wordIds: number[] },
): Promise<EnrichResult> {
  if (wordIds.length === 0) return { enriched: 0, pending: 0 };

  // Translations and the AI's example translations are in the learner's language (§6.6).
  const language = learner.learnerLanguage;

  const pendingWords = await loadPending(db, wordIds, language);
  if (pendingWords.length === 0) return { enriched: 0, pending: 0 };

  // 1. Dictionary first: forms and pronunciation. Copied now, so a word keeps them even if the AI
  // fails. A word typed from a dictionary entry already has that entry's facts (§6.7): one whose
  // forms_source is set is left as it is, and a pronunciation it has is kept.
  const dictionary = await lookupWords(db, pendingWords);
  const fromDictionary = new Map<number, Forms>();
  for (const word of pendingWords) {
    if (word.formsSource) continue;
    const entries = entriesForWord(word, dictionary.get(wordKey(word)) ?? []);
    const forms = dictionaryForms(word, entries);
    const pronunciation = word.ipa || word.audioUrl ? null : pronunciationOf(entries);
    if (forms) fromDictionary.set(word.id, forms);
    if (!forms && !pronunciation) continue;
    await db
      .update(words)
      .set({ ...(forms ? { ...forms, formsSource: "dictionary" as const } : {}), ...pronunciation })
      .where(and(eq(words.id, word.id), isNull(words.enrichedAt)));
  }
  if (!learner.aiEnabled) return { enriched: 0, pending: 0 };

  // 2. The AI writes every example sentence, and the forms the dictionary didn't have.
  let enriched = 0;
  await forEachLimited(
    chunk(pendingWords, ENRICH_BATCH_SIZE),
    ENRICH_PARALLEL_BATCHES,
    async (batch) => {
      const input: EnrichInputWord[] = batch.map((word, ref) => ({
        ref,
        lemma: word.lemma,
        pos: word.pos,
        article: word.article,
        translation: word.translation ?? word.lemma,
        needsForms:
          (word.pos === "noun" || word.pos === "verb") &&
          !word.formsSource &&
          !fromDictionary.has(word.id),
      }));

      let output: EnrichOutput;
      try {
        output = await ai.enrichWords(input, {
          userId: learner.id,
          importId,
          learnerLanguage: language,
        });
      } catch (error) {
        log?.warn({ err: error }, `Enrichment of ${batch.length} words failed; they stay pending`);
        return;
      }

      for (const result of output.words) {
        const word = batch[result.ref];
        const sent = input[result.ref];
        // Only trust an entry that names the word it was meant for.
        if (!word || !sent || result.lemma.trim() !== word.lemma) continue;

        const aiForms: Forms | null = sent.needsForms
          ? word.pos === "noun"
            ? { plural: result.plural, forms: null }
            : { plural: null, forms: result.forms }
          : null;

        // 3. Done. `enriched_at IS NULL` keeps a concurrent run from writing the same word twice.
        const updated = await db
          .update(words)
          .set({
            exampleDe: result.exampleDe,
            enrichedAt: new Date(),
            ...(aiForms ? { ...aiForms, formsSource: "ai" as const } : {}),
          })
          .where(and(eq(words.id, word.id), isNull(words.enrichedAt)))
          .returning({ id: words.id });
        if (updated.length === 0) continue;

        enriched++;
        await db
          .update(wordTranslations)
          .set({ exampleTranslation: result.exampleTranslation })
          .where(
            and(eq(wordTranslations.wordId, word.id), eq(wordTranslations.language, language)),
          );
      }
    },
  );

  const [left] = await db
    .select({ n: count() })
    .from(words)
    .where(and(inArray(words.id, wordIds), isNull(words.enrichedAt)));
  return { enriched, pending: left?.n ?? 0 };
}

/** Retries enrichment for every word of the learner that has no details yet (§9). */
export async function enrichPendingForUser(
  deps: EnrichDeps,
  learner: Learner,
): Promise<EnrichResult> {
  return enrichWords(deps, { learner, wordIds: await pendingWordIds(deps.db, learner.id) });
}

/** The learner's words still waiting for details; ignored words never become cards, so not those. */
export async function pendingWordIds(db: Db, userId: number): Promise<number[]> {
  const rows = await db
    .select({ id: words.id })
    .from(userWords)
    .innerJoin(words, eq(userWords.wordId, words.id))
    .where(
      and(eq(userWords.userId, userId), ne(userWords.status, "ignored"), isNull(words.enrichedAt)),
    );
  return rows.map((r) => r.id);
}

async function loadPending(db: Db, wordIds: number[], language: string) {
  return db
    .select({
      id: words.id,
      lemma: words.lemma,
      pos: words.pos,
      article: words.article,
      formsSource: words.formsSource,
      ipa: words.ipa,
      audioUrl: words.audioUrl,
      translation: wordTranslations.translation,
    })
    .from(words)
    .leftJoin(
      wordTranslations,
      and(eq(wordTranslations.wordId, words.id), eq(wordTranslations.language, language)),
    )
    .where(and(inArray(words.id, wordIds), isNull(words.enrichedAt)))
    .orderBy(words.id);
}

/**
 * Forms the dictionary has for a word, from the entries that describe it (`entriesForWord`): a
 * noun's plural from an entry with the word's own gender (der Band → Bände, die Band → Bands), a
 * verb's forms from its entry.
 */
function dictionaryForms(word: PendingWord, entries: DictionaryEntry[]): Forms | null {
  if (word.pos === "noun") {
    const plural = entries.find((e) => e.plurals.length > 0)?.plurals[0];
    return plural ? { plural, forms: null } : null;
  }
  if (word.pos === "verb") {
    const forms = entries.find((e) => e.forms)?.forms;
    return forms ? { plural: null, forms } : null;
  }
  return null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Runs `work` for every item, at most `limit` at a time. */
async function forEachLimited<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
