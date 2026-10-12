import { SESSION_SIZE, type SessionSource, type WordView } from "@language-app/core";
import { and, count, desc, eq, gte, inArray, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { imports, userWords } from "../db/schema";
import { learnerLanguageOf, wordViewQuery } from "../words/views";

// Which words a practice session takes (docs/design.md §8.1).

export const SOURCES: SessionSource[] = ["last_import", "last_7_days", "not_learned"];
const RECENT_DAYS = 7;

/** The filter for a source, or null when it can have no words (no finished import yet). */
async function sourceFilter(
  db: Db,
  userId: number,
  source: SessionSource,
  now: Date,
): Promise<SQL | null> {
  const mine = eq(userWords.userId, userId);
  const practisable = inArray(userWords.status, ["learning", "learned"]);

  switch (source) {
    case "last_import": {
      const [latest] = await db
        .select({ id: imports.id })
        .from(imports)
        .where(and(eq(imports.userId, userId), eq(imports.status, "done")))
        .orderBy(sql`${imports.completedAt} desc nulls last`, desc(imports.id))
        .limit(1);
      return latest ? (and(mine, practisable, eq(userWords.importId, latest.id)) ?? null) : null;
    }
    case "last_7_days": {
      const since = new Date(now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000);
      return and(mine, practisable, gte(userWords.addedAt, since)) ?? null;
    }
    case "not_learned":
      return and(mine, eq(userWords.status, "learning")) ?? null;
  }
}

/** How many words each source has (§8.1: shown on each option). */
export async function countSources(
  db: Db,
  userId: number,
  now: Date = new Date(),
): Promise<Record<SessionSource, number>> {
  const counts = {} as Record<SessionSource, number>;
  for (const source of SOURCES) {
    const filter = await sourceFilter(db, userId, source, now);
    counts[source] = filter
      ? ((await db.select({ n: count() }).from(userWords).where(filter))[0]?.n ?? 0)
      : 0;
  }
  return counts;
}

/**
 * Up to {@link SESSION_SIZE} cards from a source. The two "recent" sources are shuffled;
 * not_learned puts missed words first, most recently practised first, then the rest newest first.
 */
export async function selectCards(
  db: Db,
  userId: number,
  source: SessionSource,
  now: Date = new Date(),
): Promise<WordView[]> {
  const filter = await sourceFilter(db, userId, source, now);
  if (!filter) return [];

  const missedFirst = sql`case when ${userWords.lastResult} = 'didnt_know' then 0 else 1 end`;
  const order: SQL[] =
    source === "not_learned"
      ? [
          missedFirst,
          sql`case when ${userWords.lastResult} = 'didnt_know' then ${userWords.lastPracticedAt} end desc nulls last`,
          desc(userWords.addedAt),
          desc(userWords.id),
        ]
      : [sql`random()`];

  return wordViewQuery(db, await learnerLanguageOf(db, userId))
    .where(filter)
    .orderBy(...order)
    .limit(SESSION_SIZE);
}
