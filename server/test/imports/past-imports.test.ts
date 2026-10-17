import { ImportListResponse, RenameImportResponse, type WordStatus } from "@language-app/core";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { imports, users, userWords, words } from "../../src/db/schema";
import { SINGLE_USER_ID } from "../../src/user";
import { buildTestApp } from "../helpers/app";
import { first, useTestDb } from "../helpers/db";

const db = useTestDb();
const app = () => buildTestApp(db);

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

async function seedImport({
  name = null,
  status = "done",
  completedAt = status === "done" ? daysAgo(1) : null,
  userId = SINGLE_USER_ID,
}: {
  name?: string | null;
  status?: "collecting" | "reviewing" | "done";
  completedAt?: Date | null;
  userId?: number;
} = {}) {
  return first(
    await db
      .insert(imports)
      .values({ userId, name, status, photoCount: 1, completedAt })
      .returning({ id: imports.id }),
  ).id;
}

/** A word the import created, in the given status. Returns the user_words id. */
async function seedWord(
  lemma: string,
  importId: number | null,
  { status = "learning", userId = SINGLE_USER_ID }: { status?: WordStatus; userId?: number } = {},
) {
  const word = first(
    await db
      .insert(words)
      .values({ language: "de", lemma, pos: "noun", article: "der", checkStatus: "match" })
      .returning({ id: words.id }),
  );
  return first(
    await db
      .insert(userWords)
      .values({ userId, wordId: word.id, status, importId })
      .returning({ id: userWords.id }),
  ).id;
}

async function otherLearner() {
  return first(
    await db
      .insert(users)
      .values({ name: "Other", learnerLanguage: "en", targetLanguage: "de" })
      .returning({ id: users.id }),
  ).id;
}

async function pastImports() {
  const res = await app().inject({ method: "GET", url: "/api/imports" });
  expect(res.statusCode).toBe(200);
  return ImportListResponse.parse(res.json()).imports;
}

const rename = (id: number | string, payload: unknown) =>
  app().inject({ method: "PATCH", url: `/api/imports/${id}`, payload: payload as object });

const errorCode = (res: { json: () => unknown }) =>
  (res.json() as { error: { code: string } }).error.code;

const nameOf = async (id: number) =>
  first(await db.select({ name: imports.name }).from(imports).where(eq(imports.id, id))).name;

describe("GET /api/imports (§9.2)", () => {
  it("lists done imports with learning or learned words, newest first, counting those words", async () => {
    const threeDaysAgo = daysAgo(3);
    const older = await seedImport({ name: "Lesson 3", completedAt: threeDaysAgo });
    await seedWord("Tisch", older);
    await seedWord("Stuhl", older);
    await seedWord("Lampe", older, { status: "learned" });
    await seedWord("Bett", older, { status: "ignored" });

    const sameTime = daysAgo(1);
    const earlierRow = await seedImport({ completedAt: sameTime });
    await seedWord("Zug", earlierRow);
    const laterRow = await seedImport({ completedAt: sameTime });
    await seedWord("Bahn", laterRow);
    await seedWord("Bus", laterRow, { status: "learned" });

    const photos = { source: "photos" };
    expect(await pastImports()).toEqual([
      // Completed at the same moment: the newer row first.
      { id: laterRow, name: null, ...photos, completedAt: sameTime.toISOString(), wordCount: 2 },
      { id: earlierRow, name: null, ...photos, completedAt: sameTime.toISOString(), wordCount: 1 },
      {
        id: older,
        name: "Lesson 3",
        ...photos,
        completedAt: threeDaysAgo.toISOString(),
        wordCount: 3,
      },
    ]);
  });

  it("says how each import's words came in: photos or a typed list", async () => {
    const photographed = await seedImport({ completedAt: daysAgo(2) });
    await seedWord("Tisch", photographed);
    const typed = first(
      await db
        .insert(imports)
        .values({
          userId: SINGLE_USER_ID,
          status: "done",
          source: "typed",
          completedAt: daysAgo(1),
        })
        .returning({ id: imports.id }),
    ).id;
    await seedWord("Stuhl", typed);

    expect((await pastImports()).map((i) => [i.id, i.source])).toEqual([
      [typed, "typed"],
      [photographed, "photos"],
    ]);
  });

  it("leaves out unfinished imports and imports that added nothing to learn", async () => {
    const collecting = await seedImport({ status: "collecting" });
    await seedImport({ status: "reviewing" });
    // The pages had no new words: the save created no user_words rows.
    await seedImport();
    // Every new word was skipped.
    const allSkipped = await seedImport();
    await seedWord("Bett", allSkipped, { status: "ignored" });
    // Another learner's import.
    const other = await otherLearner();
    const theirs = await seedImport({ userId: other });
    await seedWord("Sofa", theirs, { userId: other });
    // A word with no import (a manual add, later) belongs to no import.
    await seedWord("Regenschirm", null);
    // The only import with something to learn.
    const listed = await seedImport();
    await seedWord("Tisch", listed);
    // Words of an unfinished import never count either.
    await seedWord("Lampe", collecting);

    expect((await pastImports()).map((i) => i.id)).toEqual([listed]);
  });

  it("drops an import whose words were all deleted", async () => {
    const lesson = await seedImport();
    const tisch = await seedWord("Tisch", lesson);
    await seedWord("Bett", lesson, { status: "ignored" });

    const res = await app().inject({ method: "DELETE", url: `/api/words/${tisch}` });
    expect(res.statusCode).toBe(200);
    expect(await pastImports()).toEqual([]);
    // The import row itself stays.
    expect(await db.select().from(imports).where(eq(imports.id, lesson))).toHaveLength(1);
  });

  it("drops an import whose words were all set to Ignored, and lists it again once one is back in Learning", async () => {
    const lesson = await seedImport();
    const tisch = await seedWord("Tisch", lesson);
    const stuhl = await seedWord("Stuhl", lesson, { status: "learned" });
    const patch = (id: number, status: WordStatus) =>
      app().inject({ method: "PATCH", url: `/api/words/${id}`, payload: { status } });

    await patch(tisch, "ignored");
    expect((await pastImports()).map((i) => i.wordCount)).toEqual([1]);
    await patch(stuhl, "ignored");
    expect(await pastImports()).toEqual([]);

    await patch(stuhl, "learning");
    expect(await pastImports()).toMatchObject([{ id: lesson, wordCount: 1 }]);
  });

  it("is empty without imports", async () => {
    expect(await pastImports()).toEqual([]);
  });
});

describe("PATCH /api/imports/:id (§9.2)", () => {
  it("renames an import, trimmed, and the list shows the new name", async () => {
    const lesson = await seedImport();
    await seedWord("Tisch", lesson);

    const res = await rename(lesson, { name: "  Lesson 4 " });
    expect(res.statusCode).toBe(200);
    expect(RenameImportResponse.parse(res.json())).toEqual({ id: lesson, name: "Lesson 4" });
    expect(await nameOf(lesson)).toBe("Lesson 4");
    expect(await pastImports()).toMatchObject([{ id: lesson, name: "Lesson 4" }]);
  });

  it("an empty or blank name, or null, clears it", async () => {
    const lesson = await seedImport({ name: "Lesson 4" });
    for (const name of ["", "   ", null]) {
      await rename(lesson, { name: "Lesson 4" });
      const res = await rename(lesson, { name });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ id: lesson, name: null });
      expect(await nameOf(lesson)).toBeNull();
    }
  });

  it("allows at most 100 characters, counted after trimming", async () => {
    const lesson = await seedImport({ name: "Lesson 4" });
    const hundred = "x".repeat(100);
    expect((await rename(lesson, { name: `  ${hundred}  ` })).json()).toEqual({
      id: lesson,
      name: hundred,
    });

    const tooLong = await rename(lesson, { name: `${hundred}y` });
    expect(tooLong.statusCode).toBe(400);
    expect(errorCode(tooLong)).toBe("invalid_request");
    expect(await nameOf(lesson)).toBe(hundred);
  });

  it("works in any status", async () => {
    const collecting = await seedImport({ status: "collecting" });
    expect((await rename(collecting, { name: "Lesson 5" })).json()).toEqual({
      id: collecting,
      name: "Lesson 5",
    });
  });

  it("rejects a body without a name or with the wrong type", async () => {
    const lesson = await seedImport({ name: "Lesson 4" });
    for (const payload of [{}, { name: 4 }]) {
      const res = await rename(lesson, payload);
      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe("invalid_request");
    }
    expect(await nameOf(lesson)).toBe("Lesson 4");
  });

  it("404 for an unknown import or another learner's, which stays unchanged; 400 for a malformed id", async () => {
    const theirs = await seedImport({ userId: await otherLearner(), name: "Theirs" });
    for (const id of [999, theirs]) {
      const res = await rename(id, { name: "Mine" });
      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe("import_not_found");
    }
    expect(await nameOf(theirs)).toBe("Theirs");
    expect((await rename("abc", { name: "Mine" })).statusCode).toBe(400);
  });
});
