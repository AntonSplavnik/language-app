import type { WordView } from "@language-app/core";
import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "../db/client";
import { users, userWords, words, wordTranslations } from "../db/schema";

export async function learnerLanguageOf(db: Executor, userId: number): Promise<string> {
  const [user] = await db
    .select({ learnerLanguage: users.learnerLanguage })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new Error(`user ${userId} not found`);
  return user.learnerLanguage;
}

/**
 * A query for the learner's words as `WordView`s: their `user_words` row, the shared word and its
 * translation in the learner's language. Add joins, a where clause and an order to it.
 */
export function wordViewQuery(db: Executor, language: string) {
  return db
    .select({
      userWordId: userWords.id,
      lemma: words.lemma,
      pos: words.pos,
      article: words.article,
      plural: words.plural,
      forms: words.forms,
      translation: sql<string>`coalesce(${wordTranslations.translation}, '')`,
      customTranslation: userWords.customTranslation,
      exampleDe: words.exampleDe,
      exampleTranslation: wordTranslations.exampleTranslation,
      note: userWords.note,
      enriched: sql<boolean>`${words.enrichedAt} is not null`,
    })
    .from(userWords)
    .innerJoin(words, eq(userWords.wordId, words.id))
    .leftJoin(
      wordTranslations,
      and(eq(wordTranslations.wordId, words.id), eq(wordTranslations.language, language)),
    )
    .$dynamic();
}

/** Checks at compile time that the query's rows are WordViews. */
export type WordViewRow = Awaited<ReturnType<typeof wordViewQuery>>[number];
const _rowsAreWordViews = (row: WordViewRow): WordView => row;
