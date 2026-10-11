import type {
  Candidate,
  CheckStatus,
  ImportView,
  PhotoUploadResponse,
  SaveDecision,
  SaveResponse,
} from "@language-app/core";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AiClient } from "../ai/types";
import { countExtractCallsToday } from "../ai/usage";
import type { Db, Executor } from "../db/client";
import { imports, users, userWords, words, wordTranslations } from "../db/schema";
import { checkWord } from "../dictionary/check";
import { lookupWords, wordKey } from "../dictionary/lookup";
import { HttpError } from "../http/errors";
import { candidateKey, newCandidateWords, type WordIdentity } from "./candidates";

// The import flow (docs/design.md §6): photos → candidates → review → save.

const TARGET_LANGUAGE = "de";

export type ImportDeps = { db: Db; ai: AiClient; dailyPhotoLimit: number };
type ImportRow = typeof imports.$inferSelect;

export async function createImport(db: Db, userId: number, name?: string): Promise<ImportView> {
  const [row] = await db
    .insert(imports)
    .values({ userId, name: name || null })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return toView(db, userId, row);
}

export async function getImport(db: Db, userId: number, id: number): Promise<ImportView> {
  return toView(db, userId, await findImport(db, userId, id));
}

/** Moves the import to `reviewing`: no more photos (§9). */
export async function startReview(db: Db, userId: number, id: number): Promise<ImportView> {
  const row = await findImport(db, userId, id);
  if (row.status === "done") throw importClosed();
  const [updated] = await db
    .update(imports)
    .set({ status: "reviewing" })
    .where(eq(imports.id, row.id))
    .returning();
  return toView(db, userId, updated ?? row);
}

/** One photo: extract (§11.2), then merge, compare and check the new words (§6.3). */
export async function addPhoto(
  { db, ai, dailyPhotoLimit }: ImportDeps,
  userId: number,
  id: number,
  jpeg: Uint8Array,
): Promise<PhotoUploadResponse> {
  const row = await findImport(db, userId, id);
  if (row.status !== "collecting") throw importClosed();
  if ((await countExtractCallsToday(db, userId)) >= dailyPhotoLimit) {
    throw new HttpError(429, "daily_limit", "Daily photo limit reached");
  }

  // The slow AI call runs outside any transaction; the merge below locks the import row so that
  // photos uploaded at the same time don't overwrite each other's candidates.
  const extracted = await ai.extractWords(jpeg, { userId, importId: id });

  return db.transaction(async (tx) => {
    const locked = await findImport(tx, userId, id, { forUpdate: true });
    if (locked.status !== "collecting") throw importClosed();

    const fresh = newCandidateWords(locked.candidates, extracted.words, locked.photoCount);
    const [known, dictionary] = await Promise.all([
      knownKeys(tx, userId, fresh),
      lookupWords(tx, fresh),
    ]);
    const added: Candidate[] = fresh.map((c) => ({
      ...c,
      existing: known.has(c.key) ? "in_my_words" : "none",
      dictionary: checkWord(c, dictionary.get(wordKey(c)) ?? []),
    }));

    const [updated] = await tx
      .update(imports)
      .set({ candidates: [...locked.candidates, ...added], photoCount: locked.photoCount + 1 })
      .where(eq(imports.id, id))
      .returning();
    if (!updated) throw new Error("update returned no row");

    return {
      pageQuality: extracted.pageQuality,
      wordsFound: extracted.words.length,
      import: await toView(tx, userId, updated),
    };
  });
}

/**
 * Saves the learner's decisions (§6.5): each decided candidate becomes a shared `words` row (found
 * or created) and a `user_words` row (`learning` or `ignored`), then the import is done.
 * Enrichment runs separately, after this transaction (M6).
 */
export async function saveImport(
  db: Db,
  userId: number,
  id: number,
  decisions: SaveDecision[],
): Promise<SaveResponse> {
  return db.transaction(async (tx) => {
    const locked = await findImport(tx, userId, id, { forUpdate: true });
    if (locked.status === "done") throw importClosed();

    const planned = planSave(locked.candidates, decisions);
    const [user] = await tx
      .select({ learnerLanguage: users.learnerLanguage })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw new Error(`user ${userId} not found`);

    // Shared words first, in a fixed order, so concurrent saves lock rows in the same order.
    const wordIds = new Map<string, number>();
    for (const word of [...planned.values()].sort((a, b) => a.key.localeCompare(b.key))) {
      wordIds.set(word.key, await findOrCreateWord(tx, word, user.learnerLanguage));
    }

    // One user_words row per word; when two candidates became the same word, add wins.
    const statusByWordId = new Map<number, "learning" | "ignored">();
    for (const word of planned.values()) {
      const wordId = wordIds.get(word.key) as number;
      if (word.action === "add" || !statusByWordId.has(wordId)) {
        statusByWordId.set(wordId, word.action === "add" ? "learning" : "ignored");
      }
    }

    let added = 0;
    let skipped = 0;
    const addedWordIds: number[] = [];
    for (const [wordId, status] of [...statusByWordId].sort(([a], [b]) => a - b)) {
      const inserted = await tx
        .insert(userWords)
        .values({ userId, wordId, status, importId: id })
        .onConflictDoNothing()
        .returning({ id: userWords.id });
      // An existing row means the learner already has this word: nothing changes.
      if (inserted.length === 0) continue;
      if (status === "learning") {
        added++;
        addedWordIds.push(wordId);
      } else {
        skipped++;
      }
    }

    await tx
      .update(imports)
      .set({ status: "done", completedAt: new Date() })
      .where(eq(imports.id, id));

    const [pending] = addedWordIds.length
      ? await tx
          .select({ n: count() })
          .from(words)
          .where(and(inArray(words.id, addedWordIds), isNull(words.enrichedAt)))
      : [{ n: 0 }];

    return { added, skipped, detailsPending: pending?.n ?? 0 };
  });
}

type PlannedWord = WordIdentity & {
  /** Identity key of the word that will be saved (after any article fix). */
  key: string;
  action: "add" | "skip";
  checkStatus: CheckStatus;
  translation: string;
};

/**
 * Validates the decisions against the candidates and works out the word each one saves.
 * Throws before anything is written, so a bad request changes nothing.
 */
function planSave(candidates: Candidate[], decisions: SaveDecision[]): Map<string, PlannedWord> {
  const byKey = new Map(candidates.map((c) => [c.key, c]));
  const planned = new Map<string, PlannedWord>();

  for (const decision of decisions) {
    const candidate = byKey.get(decision.key);
    if (!candidate) {
      throw new HttpError(400, "unknown_candidate", `No candidate ${decision.key} in this import`);
    }
    if (planned.has(decision.key)) {
      throw new HttpError(400, "invalid_request", `Two decisions for ${decision.key}`);
    }

    const fixed = decision.article !== undefined && decision.article !== candidate.article;
    if (
      fixed &&
      !(
        candidate.dictionary.status === "mismatch" &&
        decision.article !== undefined &&
        candidate.dictionary.genders?.includes(decision.article)
      )
    ) {
      throw new HttpError(
        400,
        "invalid_article",
        `${decision.article} is not a dictionary article for ${candidate.lemma}`,
      );
    }

    const article = fixed ? (decision.article ?? null) : candidate.article;
    const identity = { lemma: candidate.lemma, pos: candidate.pos, article };
    planned.set(decision.key, {
      ...identity,
      key: candidateKey(identity),
      action: decision.action,
      checkStatus: checkStatusOf(candidate, fixed),
      translation: candidate.translation,
    });
  }
  return planned;
}

function checkStatusOf(candidate: Candidate, fixed: boolean): CheckStatus {
  switch (candidate.dictionary.status) {
    case "match":
      return "match";
    case "not_found":
      return "not_in_dictionary";
    case "mismatch":
      return fixed ? "mismatch_fixed" : "mismatch_kept";
  }
}

/**
 * The shared `words` row for this identity, created with its check status and translation when
 * new. An existing row is reused unchanged; only a missing translation for the learner's
 * language is added.
 */
async function findOrCreateWord(
  tx: Executor,
  word: PlannedWord,
  learnerLanguage: string,
): Promise<number> {
  const [created] = await tx
    .insert(words)
    .values({
      language: TARGET_LANGUAGE,
      lemma: word.lemma,
      pos: word.pos,
      article: word.article,
      checkStatus: word.checkStatus,
    })
    .onConflictDoNothing()
    .returning({ id: words.id });

  const wordId =
    created?.id ??
    (
      await tx
        .select({ id: words.id })
        .from(words)
        .where(
          and(
            eq(words.language, TARGET_LANGUAGE),
            eq(words.lemma, word.lemma),
            eq(words.pos, word.pos),
            // `= NULL` never matches; non-nouns have a NULL article.
            sql`${words.article} IS NOT DISTINCT FROM ${word.article}`,
          ),
        )
    )[0]?.id;
  if (wordId === undefined) throw new Error(`word ${word.key} was neither created nor found`);

  await tx
    .insert(wordTranslations)
    .values({ wordId, language: learnerLanguage, translation: word.translation })
    .onConflictDoNothing();
  return wordId;
}

/** Keys of the given words that the learner already has, in any status (§6.3). */
async function knownKeys(
  db: Executor,
  userId: number,
  wanted: WordIdentity[],
): Promise<Set<string>> {
  if (wanted.length === 0) return new Set();
  const rows = await db
    .select({ lemma: words.lemma, pos: words.pos, article: words.article })
    .from(userWords)
    .innerJoin(words, eq(userWords.wordId, words.id))
    .where(
      and(
        eq(userWords.userId, userId),
        eq(words.language, TARGET_LANGUAGE),
        inArray(words.lemma, [...new Set(wanted.map((w) => w.lemma))]),
      ),
    );
  return new Set(rows.map(candidateKey));
}

async function findImport(
  db: Executor,
  userId: number,
  id: number,
  { forUpdate = false } = {},
): Promise<ImportRow> {
  const query = db
    .select()
    .from(imports)
    .where(and(eq(imports.id, id), eq(imports.userId, userId)));
  const [row] = forUpdate ? await query.for("update") : await query;
  if (!row) throw new HttpError(404, "import_not_found", "Import not found");
  return row;
}

/** The import as the client sees it, with `existing` recomputed now (§6.3). */
async function toView(db: Executor, userId: number, row: ImportRow): Promise<ImportView> {
  const known = await knownKeys(db, userId, row.candidates);
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    photoCount: row.photoCount,
    candidates: row.candidates.map((c) => ({
      ...c,
      existing: known.has(c.key) ? "in_my_words" : "none",
    })),
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

const importClosed = () =>
  new HttpError(409, "import_closed", "This import no longer accepts changes");
