import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { pgErrorCode } from "../../src/db/errors";
import { users, userWords, words } from "../../src/db/schema";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";

const db = useTestDb();

const word = (lemma: string, pos: "noun" | "adjective", article: "der" | "die" | null) => ({
  language: "de",
  lemma,
  pos,
  article,
  checkStatus: "match" as const,
});

/** Runs a query that should fail and returns the PostgreSQL error code. */
const errorCodeOf = (query: Promise<unknown>) =>
  query.then(
    () => "no error",
    (e: unknown) => pgErrorCode(e),
  );

describe("database constraints (§5)", () => {
  it("the first migration creates the single user", async () => {
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: LEARNER_ID,
      learnerLanguage: "en",
      targetLanguage: "de",
    });
  });

  it("a word without an article is still unique (NULLS NOT DISTINCT)", async () => {
    await db.insert(words).values(word("schnell", "adjective", null));
    expect(await errorCodeOf(db.insert(words).values(word("schnell", "adjective", null)))).toBe(
      "23505",
    );
  });

  it("the same noun with different articles is two words: der See and die See", async () => {
    await db.insert(words).values([word("See", "noun", "der"), word("See", "noun", "die")]);
    const rows = await db.select().from(words).where(eq(words.lemma, "See"));
    expect(rows.map((r) => r.article).sort()).toEqual(["der", "die"]);
  });

  it("the same lemma as a different part of speech is a different word", async () => {
    await db.insert(words).values(word("schnell", "adjective", null));
    await expect(
      db.insert(words).values({ ...word("schnell", "adjective", null), pos: "adverb" }),
    ).resolves.toBeDefined();
  });

  it("a learner can have each word only once", async () => {
    const tisch = first(
      await db
        .insert(words)
        .values(word("Tisch", "noun", "der"))
        .returning({ id: words.id }),
    );
    const row = { userId: LEARNER_ID, wordId: tisch.id, status: "learning" as const };

    await db.insert(userWords).values(row);
    expect(await errorCodeOf(db.insert(userWords).values({ ...row, status: "ignored" }))).toBe(
      "23505",
    );
  });
});
