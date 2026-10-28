import { count, eq, or } from "drizzle-orm";
import type { Db } from "../../src/db/client";
import {
  aiUsage,
  authAccounts,
  authSessions,
  cardResults,
  imports,
  invites,
  sessions,
  users,
  userWords,
  words,
  wordTranslations,
} from "../../src/db/schema";
import { first } from "./db";

// What an account owns, for the tests of both ways to delete one (docs/design.md §4 Accounts,
// §14): Delete account in the app and `user:delete`. Both are held to the same list.

/** The tables whose rows belong to one account (card results through its sessions and words). */
export const ACCOUNT_TABLES = [
  "imports",
  "user_words",
  "sessions",
  "card_results",
  "ai_usage",
  "auth_sessions",
  "auth_accounts",
  "invites",
  "users",
] as const;

/** Every kind of row a learner owns, plus a shared word with its translation; the word's id. */
export async function giveData(db: Db, userId: number, lemma: string): Promise<number> {
  const word = first(
    await db
      .insert(words)
      .values({ language: "de", lemma, pos: "noun", article: "der", checkStatus: "match" })
      .returning({ id: words.id }),
  );
  await db.insert(wordTranslations).values({ wordId: word.id, language: "en", translation: lemma });
  const lesson = first(
    await db
      .insert(imports)
      .values({ userId, status: "done", name: "Lesson 4" })
      .returning({ id: imports.id }),
  );
  const userWord = first(
    await db
      .insert(userWords)
      .values({ userId, wordId: word.id, status: "learning", importId: lesson.id })
      .returning({ id: userWords.id }),
  );
  const practice = first(
    await db
      .insert(sessions)
      .values({ userId, source: "import", importId: lesson.id })
      .returning({ id: sessions.id }),
  );
  await db.insert(cardResults).values({
    sessionId: practice.id,
    userWordId: userWord.id,
    result: "knew",
    flipped: true,
    answerMs: 900,
  });
  await db.insert(aiUsage).values({
    userId,
    importId: lesson.id,
    callType: "extract",
    model: "claude-haiku-5-5",
    ok: true,
  });
  return word.id;
}

/**
 * How many rows of each of `ACCOUNT_TABLES` belong to the user: card results through its
 * sessions or its words, invites linked to it or for its email.
 */
export async function rowsOf(db: Db, userId: number, email?: string) {
  const n = async (query: Promise<Array<{ n: number }>>) => first(await query).n;
  return {
    imports: await n(db.select({ n: count() }).from(imports).where(eq(imports.userId, userId))),
    user_words: await n(
      db.select({ n: count() }).from(userWords).where(eq(userWords.userId, userId)),
    ),
    sessions: await n(db.select({ n: count() }).from(sessions).where(eq(sessions.userId, userId))),
    card_results: await n(
      db
        .select({ n: count() })
        .from(cardResults)
        .leftJoin(sessions, eq(cardResults.sessionId, sessions.id))
        .leftJoin(userWords, eq(cardResults.userWordId, userWords.id))
        .where(or(eq(sessions.userId, userId), eq(userWords.userId, userId))),
    ),
    ai_usage: await n(db.select({ n: count() }).from(aiUsage).where(eq(aiUsage.userId, userId))),
    auth_sessions: await n(
      db.select({ n: count() }).from(authSessions).where(eq(authSessions.userId, userId)),
    ),
    auth_accounts: await n(
      db.select({ n: count() }).from(authAccounts).where(eq(authAccounts.userId, userId)),
    ),
    invites: await n(
      db
        .select({ n: count() })
        .from(invites)
        .where(
          email
            ? or(eq(invites.userId, userId), eq(invites.email, email))
            : eq(invites.userId, userId),
        ),
    ),
    users: await n(db.select({ n: count() }).from(users).where(eq(users.id, userId))),
  } satisfies Record<(typeof ACCOUNT_TABLES)[number], number>;
}

/** What `rowsOf` says of an account that is gone. */
export const NOTHING_LEFT = Object.fromEntries(ACCOUNT_TABLES.map((table) => [table, 0]));
