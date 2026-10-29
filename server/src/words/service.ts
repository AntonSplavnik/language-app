import {
  type DeleteWordResponse,
  knownThemes,
  THEME_KEYS,
  type ThemeKey,
  type ThemeListResponse,
  type UpdateWordRequest,
  type WordDetail,
  type WordListQuery,
  type WordListResponse,
  type WordStatus,
} from "@language-app/core";
import { and, asc, count, desc, eq, ilike, inArray, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { userWords, words, wordTranslations } from "../db/schema";
import { inGroup } from "../groups/service";
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

/**
 * A word's effective themes (§5): the learner's own when they chose, otherwise the word's. Null
 * when neither has any, which is under no theme.
 */
const effectiveThemes = sql<string[] | null>`coalesce(${userWords.themes}, ${words.themes})`;

/** The learner's words with this theme among their effective ones. */
export const hasTheme = (theme: ThemeKey): SQL => sql`${theme} = any(${effectiveThemes})`;

/**
 * The learner's words (§9.1): one status or all, searched, from one import, one theme, one group
 * or all, A–Z or newest first. The counts per status cover the same search, import, theme and
 * group, whatever status was asked for. The filters it gets apply together (the app sends one).
 */
export async function listWords(
  db: Db,
  userId: number,
  { status, q, importId, theme, groupId, sort = "az" }: WordListQuery,
): Promise<WordListResponse> {
  const language = await learnerLanguageOf(db, userId);
  // The words the import created; an import of another learner's has none of this learner's, and
  // neither has a group of theirs.
  const mine = and(
    eq(userWords.userId, userId),
    importId === undefined ? undefined : eq(userWords.importId, importId),
    theme === undefined ? undefined : hasTheme(theme),
    groupId === undefined ? undefined : inGroup(userId, groupId),
  );
  const search = searchFilter(q);
  const order =
    sort === "newest"
      ? [desc(userWords.addedAt), desc(userWords.id)]
      : [sql`lower(${words.lemma})`, asc(words.lemma), asc(userWords.id)];

  const rows = await wordViewQuery(db, language, {
    status: userWords.status,
    timesSeen: userWords.timesSeen,
    correctStreak: userWords.correctStreak,
    addedAt: userWords.addedAt,
    ownThemes: userWords.themes,
    wordThemes: words.themes,
  })
    .where(and(mine, search, status ? eq(userWords.status, status) : undefined))
    .orderBy(...order);
  const list = rows.map(({ ownThemes, wordThemes, ...row }) => ({
    ...row,
    addedAt: row.addedAt.toISOString(),
    themes: knownThemes(ownThemes ?? wordThemes ?? []),
  }));

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

/**
 * The learner's themes that have words (§9.1), in THEMES order: their words in every status, and
 * those a session can take (`learning` + `learned`). A word in two themes counts in both; a key
 * no longer in THEMES is left out.
 */
export async function listThemes(db: Db, userId: number): Promise<ThemeListResponse> {
  // One row per word and theme.
  const themed = db
    .select({ key: sql<string>`unnest(${effectiveThemes})`.as("key"), status: userWords.status })
    .from(userWords)
    .innerJoin(words, eq(userWords.wordId, words.id))
    .where(eq(userWords.userId, userId))
    .as("themed");
  const practisable = inArray(themed.status, ["learning", "learned"]);
  const rows = await db
    .select({
      key: themed.key,
      words: count(),
      practisable: sql<number>`(count(*) filter (where ${practisable}))::int`,
    })
    .from(themed)
    .groupBy(themed.key);
  const counts = new Map(rows.map((row) => [row.key, row]));
  return {
    themes: THEME_KEYS.flatMap((theme) => {
      const row = counts.get(theme);
      return row ? [{ key: theme, words: row.words, practisable: row.practisable }] : [];
    }),
  };
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
    ownThemes: userWords.themes,
    wordThemes: words.themes,
  }).where(and(eq(userWords.id, userWordId), eq(userWords.userId, userId)));
  if (!row) throw wordNotFound();

  const { ownThemes, wordThemes, ...word } = row;
  const suggestedThemes = knownThemes(wordThemes ?? []);
  return {
    ...word,
    lastPracticedAt: row.lastPracticedAt?.toISOString() ?? null,
    addedAt: row.addedAt.toISOString(),
    // The learner's own choice replaces the word's for them (§5).
    themes: ownThemes ? knownThemes(ownThemes) : suggestedThemes,
    suggestedThemes,
    themesOwn: ownThemes !== null,
  };
}

/** Trimmed; empty or blank clears the field. `undefined` leaves it unchanged. */
const cleared = (text: string | null | undefined) =>
  text === undefined ? undefined : text?.trim() || null;

/**
 * Changes the learner's own data for a word. Moving a word into `learning` by hand resets its
 * streak, so the next correct answer doesn't mark it learned again at once (§8.5). Their own
 * themes replace the word's for them only; `null` goes back to the word's (§5).
 */
export async function updateWord(
  db: Db,
  userId: number,
  userWordId: number,
  { status, customTranslation, note, themes }: UpdateWordRequest,
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
    themes,
  };

  // A field set to null is a change too (themes: null), so only `undefined` counts as left out.
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
