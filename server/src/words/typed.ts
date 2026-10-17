import type {
  AddedWord,
  CheckStatus,
  DescribeInput,
  DescribeOutput,
  DescribeRequest,
  DescribeResponse,
  TypedImportResponse,
  TypedWord,
} from "@language-app/core";
import { and, eq, inArray } from "drizzle-orm";
import { type AiClient, AiError } from "../ai/types";
import { countCallsToday } from "../ai/usage";
import type { Db, Executor } from "../db/client";
import { dictionaryEntries, imports, userWords, wordTranslations } from "../db/schema";
import { checkWord } from "../dictionary/check";
import { type DictionaryEntry, lookupWords, wordKey } from "../dictionary/lookup";
import { HttpError } from "../http/errors";
import { candidateKey, type WordIdentity } from "../imports/candidates";
import { findOrCreateWordRow } from "../imports/service";
import { type EnrichDeps, enrichWords } from "./enrich";
import { pronunciationOf } from "./pronunciation";
import { learnerLanguageOf } from "./views";

// Words typed by hand (docs/design.md §6.7, §9.3): saved one at a time or as a typed list, and
// Ask AI (Call 3, §11.6).

type Planned = WordIdentity & {
  key: string;
  translation: string;
  /** The entry it was chosen from, when that entry still has this word; otherwise by hand. */
  entry: DictionaryEntry | null;
};

/**
 * Saves typed words (§6.7): each becomes a shared `words` row (found or created) and a `learning`
 * row in the learner's list; a word already in the list is left as it is. With `asImport` the
 * words are one `done` import with `source = typed`, made only when something was added. Then
 * enrichment runs as for imported words; it never fails the save.
 */
export async function saveTypedWords(
  deps: EnrichDeps,
  userId: number,
  typed: TypedWord[],
  { asImport }: { asImport: boolean },
): Promise<TypedImportResponse> {
  const { db } = deps;
  const saved = await db.transaction(async (tx) => {
    const planned = await plan(tx, typed);
    const language = await learnerLanguageOf(tx, userId);
    const checks = await handChecks(tx, [...planned.values()]);

    const importId = asImport
      ? (
          await tx
            .insert(imports)
            .values({ userId, status: "done", source: "typed", completedAt: new Date() })
            .returning({ id: imports.id })
        )[0]?.id
      : null;
    if (importId === undefined) throw new Error("insert returned no import");

    // Shared words in a fixed order, so concurrent saves lock rows in the same order.
    const addedByKey = new Map<string, AddedWord & { wordId: number }>();
    let alreadyInList = 0;
    for (const word of [...planned.values()].sort((a, b) => a.key.localeCompare(b.key))) {
      const { id: wordId, created } = await findOrCreateWordRow(
        tx,
        word,
        word.entry ? factsOf(word, word.entry) : { checkStatus: checks.get(word.key) ?? "match" },
      );
      const customTranslation = await translationFor(tx, wordId, language, word.translation, {
        created,
      });

      const inserted = await tx
        .insert(userWords)
        .values({ userId, wordId, status: "learning", importId, customTranslation })
        .onConflictDoNothing()
        .returning({ id: userWords.id });
      const userWordId = inserted[0]?.id;
      // An existing row means the learner already has this word: nothing changes.
      if (userWordId === undefined) {
        alreadyInList++;
        continue;
      }
      addedByKey.set(word.key, { userWordId, lemma: word.lemma, article: word.article, wordId });
    }

    // Nothing added: no import (§6.7).
    if (importId !== null && addedByKey.size === 0) {
      await tx.delete(imports).where(eq(imports.id, importId));
    }
    // In the order sent.
    const added = [...planned.keys()].flatMap((key) => {
      const word = addedByKey.get(key);
      return word ? [word] : [];
    });
    return { importId: added.length > 0 ? importId : null, added, alreadyInList };
  });

  const { pending } = await enrichWords(deps, {
    userId,
    importId: saved.importId,
    wordIds: saved.added.map((w) => w.wordId),
  });
  return {
    importId: saved.importId,
    added: saved.added.map(({ userWordId, lemma, article }) => ({ userWordId, lemma, article })),
    alreadyInList: saved.alreadyInList,
    detailsPending: pending,
  };
}

/**
 * The words to save, keyed by identity: an article only on a noun, a repeat counted once (the
 * first), and the entry each was chosen from, if it still has that lemma, part of speech and
 * gender (§9.3). An entry that doesn't fit makes the word one entered by hand.
 */
async function plan(tx: Executor, typed: TypedWord[]): Promise<Map<string, Planned>> {
  const entryIds = [...new Set(typed.flatMap((w) => (w.entryId === undefined ? [] : [w.entryId])))];
  const entries = new Map(
    entryIds.length === 0
      ? []
      : (
          await tx.select().from(dictionaryEntries).where(inArray(dictionaryEntries.id, entryIds))
        ).map((e) => [e.id, e]),
  );

  const planned = new Map<string, Planned>();
  for (const word of typed) {
    const identity = {
      lemma: word.lemma,
      pos: word.pos,
      article: word.pos === "noun" ? word.article : null,
    };
    const key = candidateKey(identity);
    if (planned.has(key)) continue;
    const entry = word.entryId === undefined ? undefined : entries.get(word.entryId);
    planned.set(key, {
      ...identity,
      key,
      translation: word.translation,
      entry: entry && entryHas(entry, identity) ? entry : null,
    });
  }
  return planned;
}

/** Whether the entry describes this word: same lemma and part of speech, and a noun's gender. */
function entryHas(entry: DictionaryEntry, word: WordIdentity): boolean {
  if (entry.lemma !== word.lemma || entry.pos !== word.pos) return false;
  if (word.pos !== "noun") return true;
  return word.article ? entry.genders.includes(word.article) : entry.genders.length === 0;
}

/**
 * A new word chosen from an entry gets that entry's plural, forms and pronunciation at once
 * (`forms_source = dictionary` when it has forms) and `check_status = match` (§6.7).
 */
function factsOf(word: WordIdentity, entry: DictionaryEntry) {
  const plural = word.pos === "noun" ? (entry.plurals[0] ?? null) : null;
  const forms = word.pos === "verb" ? entry.forms : null;
  return {
    checkStatus: "match" as const,
    plural,
    forms,
    formsSource: plural || forms ? ("dictionary" as const) : null,
    ...(pronunciationOf([entry]) ?? {}),
  };
}

/** Words entered by hand (or by the AI) are checked like a candidate (§6.3). */
async function handChecks(tx: Executor, planned: Planned[]): Promise<Map<string, CheckStatus>> {
  const byHand = planned.filter((w) => !w.entry);
  const found = await lookupWords(tx, byHand);
  const checks = new Map<string, CheckStatus>();
  for (const word of byHand) {
    const check = checkWord(word, found.get(wordKey(word)) ?? []);
    checks.set(
      word.key,
      check.status === "match"
        ? "match"
        : check.status === "mismatch"
          ? "mismatch_kept"
          : "not_in_dictionary",
    );
  }
  return checks;
}

/**
 * Stores the chosen translation: a new word (or one without a translation in this language) gets
 * it as its `word_translations` row; for a reused word that has another one, it becomes the
 * learner's `custom_translation`, returned here (§6.7).
 */
async function translationFor(
  tx: Executor,
  wordId: number,
  language: string,
  translation: string,
  { created }: { created: boolean },
): Promise<string | null> {
  if (!created) {
    const [stored] = await tx
      .select({ translation: wordTranslations.translation })
      .from(wordTranslations)
      .where(and(eq(wordTranslations.wordId, wordId), eq(wordTranslations.language, language)));
    if (stored) return stored.translation === translation ? null : translation;
  }
  await tx.insert(wordTranslations).values({ wordId, language, translation }).onConflictDoNothing();
  return null;
}

export type DescribeDeps = { db: Db; ai: AiClient; dailyDescribeLimit: number };

/** How a failed Ask AI reaches the client (§12 Adding words); not the photo wording of §12 Import. */
const DESCRIBE_ERRORS: Record<AiError["code"], { status: number; code: string; message: string }> =
  {
    busy: { status: 503, code: "ai_busy", message: "AI is busy, try again" },
    refused: {
      status: 422,
      code: "ai_refused",
      message: "The AI declined to answer for this word",
    },
    invalid_output: {
      status: 422,
      code: "ai_invalid_output",
      message: "The AI's answer was unusable, try again",
    },
    too_long: {
      status: 422,
      code: "ai_invalid_output",
      message: "The AI's answer was unusable, try again",
    },
  };

/**
 * Ask AI (Call 3, §11.6): the word the learner meant by the text, or with `entryId` a translation
 * in that entry's sense, keeping the entry's word. Counted against the daily Ask AI limit.
 */
export async function describeWord(
  { db, ai, dailyDescribeLimit }: DescribeDeps,
  userId: number,
  { text, entryId }: DescribeRequest,
): Promise<DescribeResponse> {
  let entry: DictionaryEntry | undefined;
  if (entryId !== undefined) {
    [entry] = await db.select().from(dictionaryEntries).where(eq(dictionaryEntries.id, entryId));
    if (!entry) throw new HttpError(404, "entry_not_found", "Dictionary entry not found");
  }
  if ((await countCallsToday(db, userId, "describe")) >= dailyDescribeLimit) {
    throw new HttpError(429, "daily_limit", "Daily AI limit reached");
  }

  // A noun entry with several genders (der/das Liter) has one meaning: its first gender stands in.
  const article = entry?.pos === "noun" ? (entry.genders[0] ?? null) : null;
  const input: DescribeInput = entry
    ? {
        text,
        entry: {
          lemma: entry.lemma,
          pos: entry.pos,
          article,
          glosses: entry.glossesEn.slice(0, 3),
        },
      }
    : { text };

  let output: DescribeOutput;
  try {
    output = await ai.describeWord(input, { userId, importId: null });
  } catch (error) {
    if (!(error instanceof AiError)) throw error;
    const mapped = DESCRIBE_ERRORS[error.code];
    throw new HttpError(mapped.status, mapped.code, mapped.message);
  }

  const translation = output.translation.trim();
  if (entry) {
    if (!translation) throw unusable();
    return { lemma: entry.lemma, pos: entry.pos, article, translation };
  }
  if (!output.german) {
    throw new HttpError(422, "not_german", "That doesn't look like a German word");
  }
  const lemma = output.lemma.trim();
  if (!lemma || !translation) throw unusable();
  return {
    lemma,
    pos: output.pos,
    article: output.pos === "noun" ? output.article : null,
    translation,
  };
}

const unusable = () => {
  const { status, code, message } = DESCRIBE_ERRORS.invalid_output;
  return new HttpError(status, code, message);
};
