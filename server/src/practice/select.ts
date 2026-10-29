import {
  type CreateSessionRequest,
  SESSION_SIZE,
  type SessionSource,
  type WordView,
} from "@language-app/core";
import { and, count, desc, eq, gte, inArray, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { userWords, words } from "../db/schema";
import { groupCounts, inGroup } from "../groups/service";
import { listPastImports } from "../imports/past";
import { hasTheme, listThemes } from "../words/service";
import { learnerLanguageOf, wordViewQuery } from "../words/views";

// Which words a practice session takes (docs/design.md §8.1).

export const SOURCES: SessionSource[] = ["import", "group", "theme", "last_7_days", "not_learned"];
const RECENT_DAYS = 7;

/**
 * A source with what it needs: `import` names the import to practise, `group` the group, `theme`
 * the theme.
 */
export type SessionChoice = CreateSessionRequest;

/**
 * The words a source takes from the learner's list. Never ignored ones. A filter on a word's
 * themes reads `words` too, which every query here joins.
 */
function sourceFilter(
  userId: number,
  { source, importId, groupId, theme }: SessionChoice,
  now: Date,
): SQL {
  const mine = eq(userWords.userId, userId);
  const practisable = inArray(userWords.status, ["learning", "learned"]);

  // `and` of defined conditions is never undefined.
  switch (source) {
    case "import":
      // CreateSessionRequest makes sure `import` comes with its importId.
      if (importId === undefined) throw new Error("The import source needs an importId");
      // The words the import created (§8.1); a word it found already in the list is not one.
      return and(mine, practisable, eq(userWords.importId, importId)) as SQL;
    case "group":
      // CreateSessionRequest makes sure `group` comes with its groupId.
      if (groupId === undefined) throw new Error("The group source needs a groupId");
      return and(mine, practisable, inGroup(userId, groupId)) as SQL;
    case "theme":
      // CreateSessionRequest makes sure `theme` comes with its key.
      if (theme === undefined) throw new Error("The theme source needs a theme");
      // The learner's own themes replace the word's (§5).
      return and(mine, practisable, hasTheme(theme)) as SQL;
    case "last_7_days": {
      const since = new Date(now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000);
      return and(mine, practisable, gte(userWords.addedAt, since)) as SQL;
    }
    case "not_learned":
      return and(mine, eq(userWords.status, "learning")) as SQL;
  }
}

/**
 * How many words each source has (§8.1: shown on each option). `import` counts the most recent
 * past import's words, the one Practice setup's menu starts on (§9.2), `group` the newest group's
 * with words to practise, and `theme` the theme's with the most words to practise, the ones their
 * menus start on; 0 when there is none.
 */
export async function countSources(
  db: Db,
  userId: number,
  now: Date = new Date(),
): Promise<Record<SessionSource, number>> {
  const countOf = async (filter: SQL) =>
    (
      await db
        .select({ n: count() })
        .from(userWords)
        .innerJoin(words, eq(userWords.wordId, words.id))
        .where(filter)
    )[0]?.n ?? 0;
  const [latest] = await listPastImports(db, userId);
  const { themes } = await listThemes(db, userId);
  // Newest first, so the first with words to practise is the newest such group.
  const groups = await groupCounts(db, userId);
  return {
    import: latest?.wordCount ?? 0,
    group: groups.find((group) => group.practisable > 0)?.practisable ?? 0,
    theme: Math.max(0, ...themes.map((theme) => theme.practisable)),
    last_7_days: await countOf(sourceFilter(userId, { source: "last_7_days" }, now)),
    not_learned: await countOf(sourceFilter(userId, { source: "not_learned" }, now)),
  };
}

/**
 * Up to {@link SESSION_SIZE} cards from a source. `import`, `group`, `theme` and `last_7_days` are
 * shuffled;
 * not_learned puts missed words first, most recently practised first, then the rest newest first.
 */
export async function selectCards(
  db: Db,
  userId: number,
  choice: SessionChoice,
  now: Date = new Date(),
): Promise<WordView[]> {
  const missedFirst = sql`case when ${userWords.lastResult} = 'didnt_know' then 0 else 1 end`;
  const order: SQL[] =
    choice.source === "not_learned"
      ? [
          missedFirst,
          sql`case when ${userWords.lastResult} = 'didnt_know' then ${userWords.lastPracticedAt} end desc nulls last`,
          desc(userWords.addedAt),
          desc(userWords.id),
        ]
      : [sql`random()`];

  return wordViewQuery(db, await learnerLanguageOf(db, userId))
    .where(sourceFilter(userId, choice, now))
    .orderBy(...order)
    .limit(SESSION_SIZE);
}
