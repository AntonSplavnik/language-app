import {
  applyResult,
  type CardResultRequest,
  type CardResultResponse,
  type SessionResponse,
  type SessionSummary,
} from "@language-app/core";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { Db, Executor } from "../db/client";
import { cardResults, imports, sessions, userWords } from "../db/schema";
import { HttpError } from "../http/errors";
import { learnerLanguageOf, wordViewQuery } from "../words/views";
import { type SessionChoice, selectCards } from "./select";

// Practice sessions (docs/design.md §8).

export async function startSession(
  db: Db,
  userId: number,
  choice: SessionChoice,
): Promise<SessionResponse> {
  const { source, importId } = choice;
  // Only a finished import of the learner's can be practised (§9).
  if (importId !== undefined) {
    const [found] = await db
      .select({ id: imports.id })
      .from(imports)
      .where(and(eq(imports.id, importId), eq(imports.userId, userId), eq(imports.status, "done")));
    if (!found) throw new HttpError(404, "import_not_found", "Import not found");
  }

  const cards = await selectCards(db, userId, choice);
  if (cards.length === 0) {
    throw new HttpError(400, "no_words", "No words to practise from this source");
  }
  const [session] = await db
    .insert(sessions)
    .values({ userId, source, importId: importId ?? null })
    .returning();
  if (!session) throw new Error("insert returned no row");
  return { id: session.id, source, cards };
}

/**
 * Records one answer and applies it to the word's progress (§8.4–8.5). A card can be answered once
 * per session, so a retried request changes nothing and returns `recorded: false`.
 */
export async function recordResult(
  db: Db,
  userId: number,
  sessionId: number,
  answer: CardResultRequest,
): Promise<CardResultResponse> {
  return db.transaction(async (tx) => {
    await findSession(tx, userId, sessionId);
    const [word] = await tx
      .select()
      .from(userWords)
      .where(and(eq(userWords.id, answer.userWordId), eq(userWords.userId, userId)))
      .for("update");
    if (!word) throw new HttpError(404, "word_not_found", "Word not found");

    const inserted = await tx
      .insert(cardResults)
      .values({
        sessionId,
        userWordId: word.id,
        result: answer.result,
        flipped: answer.flipped,
        flipMs: answer.flipped ? answer.flipMs : null,
        answerMs: answer.answerMs,
      })
      .onConflictDoNothing()
      .returning({ id: cardResults.id });
    if (inserted.length === 0) return { recorded: false };

    const next = applyResult(word, answer.result, new Date());
    if (next !== word) {
      await tx
        .update(userWords)
        .set({
          status: next.status,
          timesSeen: next.timesSeen,
          timesCorrect: next.timesCorrect,
          correctStreak: next.correctStreak,
          lastResult: next.lastResult,
          lastPracticedAt: next.lastPracticedAt,
        })
        .where(eq(userWords.id, word.id));
    }
    return { recorded: true };
  });
}

/** Marks the session finished (the first time) and summarises its answers (§8.6). */
export async function finishSession(
  db: Db,
  userId: number,
  sessionId: number,
): Promise<SessionSummary> {
  await findSession(db, userId, sessionId);
  await db
    .update(sessions)
    .set({ finishedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.finishedAt)));

  const counts = await db
    .select({ result: cardResults.result, n: count() })
    .from(cardResults)
    .where(eq(cardResults.sessionId, sessionId))
    .groupBy(cardResults.result);
  const countOf = (result: string) => counts.find((c) => c.result === result)?.n ?? 0;

  const missed = await wordViewQuery(db, await learnerLanguageOf(db, userId))
    .innerJoin(cardResults, eq(cardResults.userWordId, userWords.id))
    .where(and(eq(cardResults.sessionId, sessionId), eq(cardResults.result, "didnt_know")))
    .orderBy(asc(cardResults.id));

  return {
    knew: countOf("knew"),
    didntKnow: countOf("didnt_know"),
    skipped: countOf("skipped"),
    missed,
  };
}

async function findSession(db: Executor, userId: number, sessionId: number) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  if (!session) throw new HttpError(404, "session_not_found", "Session not found");
  return session;
}
