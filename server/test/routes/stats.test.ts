import { StatsResponse, type WordStatus } from "@language-app/core";
import { describe, expect, it } from "vitest";
import { imports, users, userWords, words } from "../../src/db/schema";
import { SINGLE_USER_ID } from "../../src/user";
import { buildTestApp } from "../helpers/app";
import { first, useTestDb } from "../helpers/db";

const db = useTestDb();

async function getStats() {
  const app = buildTestApp(db);
  const res = await app.inject({ method: "GET", url: "/api/stats" });
  expect(res.statusCode).toBe(200);
  return StatsResponse.parse(res.json());
}

async function addWords(userId: number, statuses: WordStatus[]) {
  for (const [i, status] of statuses.entries()) {
    const word = first(
      await db
        .insert(words)
        .values({
          language: "de",
          lemma: `Wort${userId}x${i}`,
          pos: "noun",
          article: "das",
          checkStatus: "match",
        })
        .returning({ id: words.id }),
    );
    await db.insert(userWords).values({ userId, wordId: word.id, status });
  }
}

describe("GET /api/stats", () => {
  it("starts at zero with no unfinished imports", async () => {
    expect(await getStats()).toEqual({
      learning: 0,
      learned: 0,
      detailsPending: 0,
      unfinishedImports: [],
    });
  });

  it("counts learning and learned words, not ignored ones", async () => {
    await addWords(SINGLE_USER_ID, ["learning", "learning", "learned", "ignored", "ignored"]);
    expect(await getStats()).toMatchObject({ learning: 2, learned: 1 });
  });

  it("counts only the current learner's words", async () => {
    const other = first(
      await db
        .insert(users)
        .values({ name: "Other", learnerLanguage: "en", targetLanguage: "de" })
        .returning({ id: users.id }),
    );
    await addWords(other.id, ["learning", "learned"]);
    expect(await getStats()).toMatchObject({ learning: 0, learned: 0 });
  });

  it("lists unfinished imports that have photos, newest first", async () => {
    const at = (iso: string) => new Date(iso);
    await db.insert(imports).values([
      {
        userId: SINGLE_USER_ID,
        name: "Lesson 3",
        status: "reviewing",
        photoCount: 2,
        createdAt: at("2026-10-09T10:00:00Z"),
      },
      {
        userId: SINGLE_USER_ID,
        name: null,
        status: "collecting",
        photoCount: 1,
        createdAt: at("2026-10-11T10:00:00Z"),
      },
      {
        userId: SINGLE_USER_ID,
        name: "Finished",
        status: "done",
        photoCount: 3,
        createdAt: at("2026-10-10T10:00:00Z"),
      },
      {
        userId: SINGLE_USER_ID,
        name: "Empty",
        status: "collecting",
        photoCount: 0,
        createdAt: at("2026-10-10T11:00:00Z"),
      },
    ]);

    const { unfinishedImports } = await getStats();
    expect(unfinishedImports).toEqual([
      {
        id: 2,
        name: null,
        status: "collecting",
        photoCount: 1,
        createdAt: "2026-10-11T10:00:00.000Z",
      },
      {
        id: 1,
        name: "Lesson 3",
        status: "reviewing",
        photoCount: 2,
        createdAt: "2026-10-09T10:00:00.000Z",
      },
    ]);
  });
});
