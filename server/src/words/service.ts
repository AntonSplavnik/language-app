import type {
  DeleteWordResponse,
  UpdateWordRequest,
  WordDetail,
  WordListQuery,
  WordListResponse,
  WordStatus,
} from "@language-app/core";
import { and, asc, count, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { userWords, words, wordTranslations } from "../db/schema";
import { HttpError } from "../http/errors";
import { learnerLanguageOf, wordViewQuery } from "./views";

// The learner's word list: My words, Word detail and Edit word (docs/design.md §9, §10).

/** `%` and `_` in the search are plain characters, not LIKE wildcards. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Matches the German lemma, the stored translation or the learner's own one, ignoring case. */
function searchFilter(q: string | undefined): SQL | undefined {
  const text = q?.trim();
  if (!text) return undefined;
  const pattern = `%${escapeLike(text)}%`;
  return or(
    ilike(words.lemma, pattern),
    ilike(wordTranslations.translation, pattern),
    ilike(userWords.customTranslation, pattern),
  );
}

export async function listWords(
  db: Db,
  userId: number,
  { status, q }: WordListQuery,
): Promise<WordListResponse> {
  const language = await learnerLanguageOf(db, userId);
  const mine = eq(userWords.userId, userId);
  const search = searchFilter(q);

  const list = await wordViewQuery(db, language, {
    status: userWords.status,
    timesSeen: userWords.timesSeen,
    correctStreak: userWords.correctStreak,
  })
    .where(and(mine, search, status ? eq(userWords.status, status) : undefined))
    .orderBy(sql`lower(${words.lemma})`, asc(words.lemma), asc(userWords.id));

  // The same search in every tab, so a word the learner looks for in the wrong tab is still found.
  const perStatus = await db
    .select({ status: userWords.status, n: count() })
    .from(userWords)
    .innerJoin(words, eq(userWords.wordId, words.id))
    .leftJoin(
      wordTranslations,
      and(eq(wordTranslations.wordId, words.id), eq(wordTranslations.language, language)),
    )
    .where(and(mine, search))
    .groupBy(userWords.status);
  const counts: Record<WordStatus, number> = { learning: 0, learned: 0, ignored: 0 };
  for (const row of perStatus) counts[row.status] = row.n;

  return { words: list, counts };
}

export async function getWordDetail(
  db: Db,
  userId: number,
  userWordId: number,
): Promise<WordDetail> {
  const [row] = await wordViewQuery(db, await learnerLanguageOf(db, userId), {
    status: userWords.status,
    formsSource: words.formsSource,
    checkStatus: words.checkStatus,
    timesSeen: userWords.timesSeen,
    timesCorrect: userWords.timesCorrect,
    correctStreak: userWords.correctStreak,
    lastResult: userWords.lastResult,
    lastPracticedAt: userWords.lastPracticedAt,
    addedAt: userWords.addedAt,
  }).where(and(eq(userWords.id, userWordId), eq(userWords.userId, userId)));
  if (!row) throw wordNotFound();

  return {
    ...row,
    lastPracticedAt: row.lastPracticedAt?.toISOString() ?? null,
    addedAt: row.addedAt.toISOString(),
  };
}

/** Trimmed; empty or blank clears the field. `undefined` leaves it unchanged. */
const cleared = (text: string | null | undefined) =>
  text === undefined ? undefined : text?.trim() || null;

/**
 * Changes the learner's own data for a word. Moving a word into `learning` by hand resets its
 * streak, so the next correct answer doesn't mark it learned again at once (§8.5).
 */
export async function updateWord(
  db: Db,
  userId: number,
  userWordId: number,
  { status, customTranslation, note }: UpdateWordRequest,
): Promise<WordDetail> {
  const changes = {
    status,
    // In an UPDATE, the columns on the right are the row's values before the change.
    correctStreak:
      status === "learning"
        ? sql<number>`case when ${userWords.status} = 'learning' then ${userWords.correctStreak} else 0 end`
        : undefined,
    customTranslation: cleared(customTranslation),
    note: cleared(note),
  };

  if (Object.values(changes).some((value) => value !== undefined)) {
    const updated = await db
      .update(userWords)
      .set(changes)
      .where(and(eq(userWords.id, userWordId), eq(userWords.userId, userId)))
      .returning({ id: userWords.id });
    if (updated.length === 0) throw wordNotFound();
  }
  return getWordDetail(db, userId, userWordId);
}

/**
 * Removes the word from the learner's list; its answers (`card_results`) go with it. The shared
 * `words` row stays, so a later import offers the word again as new, with its details ready.
 */
export async function deleteWord(
  db: Db,
  userId: number,
  userWordId: number,
): Promise<DeleteWordResponse> {
  const deleted = await db
    .delete(userWords)
    .where(and(eq(userWords.id, userWordId), eq(userWords.userId, userId)))
    .returning({ id: userWords.id });
  if (deleted.length === 0) throw wordNotFound();
  return { deleted: true };
}

const wordNotFound = () => new HttpError(404, "word_not_found", "Word not found");
