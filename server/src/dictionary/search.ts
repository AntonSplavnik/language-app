import { type Article, type EntryView, type LookupResponse, SUGGEST_MIN } from "@language-app/core";
import { and, asc, eq, inArray, notInArray, type SQL, sql } from "drizzle-orm";
import type { Executor } from "../db/client";
import { dictionaryEntries, dictionaryForms, userWords, words } from "../db/schema";
import { candidateKey } from "../imports/candidates";
import type { DictionaryEntry } from "./lookup";

// Finding typed words in the dictionary (docs/design.md §6.7, §7 search, §9.3): suggestions while
// typing, and the lookup of one typed word: exact → forms → similar.

/** Most suggestions while typing. */
export const SUGGESTIONS_MAX = 8;
/** Suggestions are topped up with similar words when the letters start fewer than this. */
export const SUGGESTIONS_TOP_UP_BELOW = 3;
/** Most similar entries a lookup offers ("Did you mean…?"). */
export const SIMILAR_MAX = 5;
/** The least trigram similarity (`pg_trgm`'s `similarity()`) for a similar word. */
export const SIMILARITY_MIN = 0.3;
/** Glosses an entry view carries. */
export const GLOSSES_MAX = 3;

const TARGET_LANGUAGE = "de";
const lowerLemma = sql`lower(${dictionaryEntries.lemma})`;

/** `%` and `_` in the typed letters are plain characters, not LIKE wildcards. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Suggestions for the letters typed so far: the entries whose lemma starts with them, ignoring
 * case (an exact match first, then shorter lemmas, then alphabetical), topped up with similar
 * words when there are fewer than 3; at most 8 views. Under 2 letters, none.
 */
export async function suggest(db: Executor, userId: number, q: string): Promise<EntryView[]> {
  if (q.length < SUGGEST_MIN) return [];

  const prefix = await db
    .select()
    .from(dictionaryEntries)
    .where(sql`${lowerLemma} LIKE lower(${escapeLike(q)}) || '%'`)
    .orderBy(
      sql`${lowerLemma} = lower(${q}) DESC`,
      sql`${dictionaryEntries.lemma} = ${q} DESC`,
      sql`length(${dictionaryEntries.lemma})`,
      lowerLemma,
      asc(dictionaryEntries.lemma),
      asc(dictionaryEntries.id),
    )
    .limit(SUGGESTIONS_MAX);

  let found = prefix;
  if (viewCount(prefix) < SUGGESTIONS_TOP_UP_BELOW) {
    const ids = prefix.map((e) => e.id);
    found = [...prefix, ...(await similarEntries(db, q, SUGGESTIONS_MAX, ids))];
  }
  return (await entryViews(db, userId, found)).slice(0, SUGGESTIONS_MAX);
}

/**
 * The lookup of one typed word (§6.7 step 1), the first of these that finds something: the
 * entries whose lemma is the text, ignoring case (the exact case first); the base words it is a
 * form of, each with its entries of that part of speech; up to 5 similar words.
 */
export async function lookup(db: Executor, userId: number, q: string): Promise<LookupResponse> {
  const exact = await db
    .select()
    .from(dictionaryEntries)
    .where(sql`${lowerLemma} = lower(${q})`)
    .orderBy(sql`${dictionaryEntries.lemma} = ${q} DESC`, asc(dictionaryEntries.id));
  if (exact.length > 0) {
    return { entries: await entryViews(db, userId, exact), forms: [], similar: [] };
  }

  const bases = await db
    .selectDistinct({ lemma: dictionaryForms.lemma, pos: dictionaryForms.pos })
    .from(dictionaryForms)
    .where(sql`lower(${dictionaryForms.form}) = lower(${q})`)
    .orderBy(asc(dictionaryForms.lemma), asc(dictionaryForms.pos));
  if (bases.length > 0) {
    const entries = await db
      .select()
      .from(dictionaryEntries)
      .where(inArray(dictionaryEntries.lemma, [...new Set(bases.map((b) => b.lemma))]))
      .orderBy(asc(dictionaryEntries.id));
    const mine = await inMyWords(db, userId, entries);
    // A base word the dictionary has no entry for (of that part of speech) has nothing to show.
    const forms = bases
      .map((base) => ({
        ...base,
        entries: toViews(
          entries.filter((e) => e.lemma === base.lemma && e.pos === base.pos),
          mine,
        ),
      }))
      .filter((form) => form.entries.length > 0);
    if (forms.length > 0) return { entries: [], forms, similar: [] };
  }

  const similar = await similarEntries(db, q, SIMILAR_MAX);
  return { entries: [], forms: [], similar: await entryViews(db, userId, similar) };
}

/**
 * Entries whose lower-cased lemma is at least {@link SIMILARITY_MIN} similar to the text's, the
 * most similar first. `%` lets the trigram index find them (its threshold is pg_trgm's default,
 * 0.3); the explicit check keeps the threshold ours.
 */
async function similarEntries(
  db: Executor,
  q: string,
  limit: number,
  exclude: number[] = [],
): Promise<DictionaryEntry[]> {
  const score: SQL<number> = sql`similarity(${lowerLemma}, lower(${q}))`;
  return db
    .select()
    .from(dictionaryEntries)
    .where(
      and(
        sql`${lowerLemma} % lower(${q})`,
        sql`${score} >= ${SIMILARITY_MIN}`,
        exclude.length > 0 ? notInArray(dictionaryEntries.id, exclude) : undefined,
      ),
    )
    .orderBy(
      sql`${score} DESC`,
      sql`length(${dictionaryEntries.lemma})`,
      lowerLemma,
      asc(dictionaryEntries.id),
    )
    .limit(limit);
}

/** The views of these entries, each marked when the learner has that word. */
async function entryViews(
  db: Executor,
  userId: number,
  entries: DictionaryEntry[],
): Promise<EntryView[]> {
  return toViews(entries, await inMyWords(db, userId, entries));
}

/** A noun with several genders gives one view per gender; one without a gender, one view. */
const articlesOf = (entry: DictionaryEntry): Array<Article | null> =>
  entry.pos === "noun" && entry.genders.length > 0 ? entry.genders : [null];

const viewCount = (entries: DictionaryEntry[]) =>
  entries.reduce((sum, entry) => sum + articlesOf(entry).length, 0);

function toViews(entries: DictionaryEntry[], mine: Map<string, number>): EntryView[] {
  return entries.flatMap((entry) =>
    articlesOf(entry).map((article) => ({
      entryId: entry.id,
      lemma: entry.lemma,
      pos: entry.pos,
      article,
      plural: entry.pos === "noun" ? (entry.plurals[0] ?? null) : null,
      forms: entry.pos === "verb" ? entry.forms : null,
      glosses: entry.glossesEn.slice(0, GLOSSES_MAX),
      ipa: entry.ipa,
      audioUrl: entry.audioUrl,
      inMyWords: mine.get(candidateKey({ lemma: entry.lemma, pos: entry.pos, article })) ?? null,
    })),
  );
}

/** The learner's words (any status) with these entries' lemmas: identity key → userWordId. */
async function inMyWords(
  db: Executor,
  userId: number,
  entries: DictionaryEntry[],
): Promise<Map<string, number>> {
  if (entries.length === 0) return new Map();
  const rows = await db
    .select({
      userWordId: userWords.id,
      lemma: words.lemma,
      pos: words.pos,
      article: words.article,
    })
    .from(userWords)
    .innerJoin(words, eq(userWords.wordId, words.id))
    .where(
      and(
        eq(userWords.userId, userId),
        eq(words.language, TARGET_LANGUAGE),
        inArray(words.lemma, [...new Set(entries.map((e) => e.lemma))]),
      ),
    );
  return new Map(rows.map((row) => [candidateKey(row), row.userWordId]));
}
