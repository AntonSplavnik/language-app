import {
  CardResultResponse,
  type LastResult,
  SessionOptionsResponse,
  SessionResponse,
  SessionSummary,
  type WordStatus,
} from "@language-app/core";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  cardResults,
  imports,
  sessions,
  users,
  userWords,
  words,
  wordTranslations,
} from "../../src/db/schema";
import { SINGLE_USER_ID } from "../../src/user";
import { buildTestApp } from "../helpers/app";
import { first, useTestDb } from "../helpers/db";

const db = useTestDb();
const app = () => buildTestApp(db);

const DAY = 24 * 60 * 60 * 1000;
const TISCH_MP3 =
  "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/de/De-Tisch2.ogg/De-Tisch2.ogg.mp3";
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

/** A word in the learner's list with the given progress. Returns its user_words id. */
async function seedWord(
  lemma: string,
  {
    status = "learning",
    importId = null,
    addedAt = daysAgo(1),
    lastResult = null,
    lastPracticedAt = null,
    correctStreak = 0,
  }: {
    status?: WordStatus;
    importId?: number | null;
    addedAt?: Date;
    lastResult?: LastResult | null;
    lastPracticedAt?: Date | null;
    correctStreak?: number;
  } = {},
) {
  const word = first(
    await db
      .insert(words)
      .values({ language: "de", lemma, pos: "noun", article: "der", checkStatus: "match" })
      .returning({ id: words.id }),
  );
  await db
    .insert(wordTranslations)
    .values({ wordId: word.id, language: "en", translation: `${lemma.toLowerCase()}-en` });
  const userWord = first(
    await db
      .insert(userWords)
      .values({
        userId: SINGLE_USER_ID,
        wordId: word.id,
        status,
        importId,
        addedAt,
        lastResult,
        lastPracticedAt,
        correctStreak,
      })
      .returning({ id: userWords.id }),
  );
  return userWord.id;
}

async function seedImport(completedAt: Date | null) {
  return first(
    await db
      .insert(imports)
      .values({
        userId: SINGLE_USER_ID,
        status: completedAt ? "done" : "reviewing",
        photoCount: 1,
        completedAt,
      })
      .returning({ id: imports.id }),
  ).id;
}

async function options() {
  const res = await app().inject({ method: "GET", url: "/api/sessions/options" });
  expect(res.statusCode).toBe(200);
  return Object.fromEntries(
    SessionOptionsResponse.parse(res.json()).options.map((o) => [o.source, o.count]),
  );
}

async function startSession(source: string, importId?: unknown) {
  const res = await app().inject({
    method: "POST",
    url: "/api/sessions",
    payload: importId === undefined ? { source } : { source, importId },
  });
  return res;
}

async function session(source: string, importId?: number) {
  const res = await startSession(source, importId);
  expect(res.statusCode).toBe(200);
  return SessionResponse.parse(res.json());
}

const errorCode = (res: { json: () => unknown }) =>
  (res.json() as { error: { code: string } }).error.code;

const lemmas = (s: { cards: Array<{ lemma: string }> }) => s.cards.map((c) => c.lemma);

async function answer(
  sessionId: number,
  userWordId: number,
  result: "knew" | "didnt_know" | "skipped",
) {
  return app().inject({
    method: "POST",
    url: `/api/sessions/${sessionId}/results`,
    payload: { userWordId, result, flipped: true, flipMs: 800, answerMs: 2000 },
  });
}

const progress = async (userWordId: number) =>
  first(await db.select().from(userWords).where(eq(userWords.id, userWordId)));

describe("GET /api/sessions/options (§8.1)", () => {
  it("counts the words of each source, never ignored ones", async () => {
    const lesson = await seedImport(daysAgo(0));
    await seedWord("Tisch", { importId: lesson });
    await seedWord("Stuhl", { importId: lesson, status: "learned" });
    await seedWord("Lampe", { importId: lesson, status: "ignored" });
    await seedWord("Alt", { addedAt: daysAgo(30) });

    expect(await options()).toEqual({ import: 2, last_7_days: 2, not_learned: 2 });
  });

  it("import counts the most recent past import: a newer import without words to learn doesn't count", async () => {
    const older = await seedImport(daysAgo(3));
    await seedWord("Tisch", { importId: older });
    await seedWord("Stuhl", { importId: older });
    const allSkipped = await seedImport(daysAgo(1));
    await seedWord("Bett", { importId: allSkipped, status: "ignored" });
    await seedImport(null);

    expect((await options()).import).toBe(2);
  });

  it("import has no words before any import is done", async () => {
    await seedImport(null);
    await seedWord("Tisch");
    expect(await options()).toEqual({ import: 0, last_7_days: 1, not_learned: 1 });
  });
});

describe("POST /api/sessions (§8.1)", () => {
  it("import: the learning and learned words of the chosen import", async () => {
    const older = await seedImport(daysAgo(3));
    const newest = await seedImport(daysAgo(1));
    await seedWord("Alt", { importId: older });
    await seedWord("AltGelernt", { importId: older, status: "learned" });
    await seedWord("Neu", { importId: newest });
    await seedWord("Ignoriert", { importId: older, status: "ignored" });
    await seedWord("Ohne");

    expect(lemmas(await session("import", older)).sort()).toEqual(["Alt", "AltGelernt"]);
    expect(lemmas(await session("import", newest))).toEqual(["Neu"]);
  });

  it("last 7 days: words added in the last week", async () => {
    await seedWord("Gestern", { addedAt: daysAgo(1) });
    await seedWord("Woche", { addedAt: daysAgo(6) });
    await seedWord("Monat", { addedAt: daysAgo(10) });
    expect(lemmas(await session("last_7_days")).sort()).toEqual(["Gestern", "Woche"]);
  });

  it("not learned: missed words first (most recently practised first), then newest first", async () => {
    await seedWord("Neu", { addedAt: daysAgo(1) });
    await seedWord("Alt", { addedAt: daysAgo(5) });
    await seedWord("VerpasstFrueh", {
      lastResult: "didnt_know",
      lastPracticedAt: daysAgo(3),
      addedAt: daysAgo(9),
    });
    await seedWord("VerpasstGestern", {
      lastResult: "didnt_know",
      lastPracticedAt: daysAgo(1),
      addedAt: daysAgo(9),
    });
    await seedWord("Gewusst", {
      lastResult: "knew",
      lastPracticedAt: daysAgo(1),
      addedAt: daysAgo(2),
    });
    await seedWord("Fertig", {
      status: "learned",
      lastResult: "didnt_know",
      lastPracticedAt: daysAgo(1),
    });

    expect(lemmas(await session("not_learned"))).toEqual([
      "VerpasstGestern",
      "VerpasstFrueh",
      "Neu",
      "Gewusst",
      "Alt",
    ]);
  });

  it("takes at most 20 words", async () => {
    for (let i = 0; i < 25; i++) await seedWord(`Wort${i}`);
    expect((await session("not_learned")).cards).toHaveLength(20);
    expect((await session("last_7_days")).cards).toHaveLength(20);

    const lesson = await seedImport(daysAgo(1));
    for (let i = 0; i < 25; i++) await seedWord(`Lektion${i}`, { importId: lesson });
    const cards = lemmas(await session("import", lesson));
    expect(cards).toHaveLength(20);
    expect(cards.every((lemma) => lemma.startsWith("Lektion"))).toBe(true);
  });

  it("cards carry what the card shows (§8.2)", async () => {
    const id = await seedWord("Tisch");
    const [row] = await db.select().from(userWords).where(eq(userWords.id, id));
    await db
      .update(words)
      .set({
        plural: "Tische",
        exampleDe: "Der Tisch ist neu.",
        enrichedAt: new Date(),
        ipa: "/tɪʃ/",
        audioFile: "De-Tisch2.ogg",
        audioUrl: TISCH_MP3,
      })
      .where(eq(words.id, row?.wordId as number));
    await db
      .update(wordTranslations)
      .set({ exampleTranslation: "The table is new." })
      .where(eq(wordTranslations.wordId, row?.wordId as number));
    await db
      .update(userWords)
      .set({ customTranslation: "desk", note: "lesson 4" })
      .where(eq(userWords.id, id));

    expect((await session("not_learned")).cards[0]).toEqual({
      userWordId: id,
      lemma: "Tisch",
      pos: "noun",
      article: "der",
      plural: "Tische",
      forms: null,
      translation: "tisch-en",
      customTranslation: "desk",
      exampleDe: "Der Tisch ist neu.",
      exampleTranslation: "The table is new.",
      note: "lesson 4",
      enriched: true,
      ipa: "/tɪʃ/",
      audioFile: "De-Tisch2.ogg",
      audioUrl: TISCH_MP3,
    });
  });

  it("refuses a source without words, and records a started session otherwise", async () => {
    const empty = await startSession("not_learned");
    expect(empty.statusCode).toBe(400);
    expect(errorCode(empty)).toBe("no_words");

    await seedWord("Tisch");
    const started = await session("not_learned");
    expect(
      first(await db.select().from(sessions).where(eq(sessions.id, started.id))),
    ).toMatchObject({
      userId: SINGLE_USER_ID,
      source: "not_learned",
      importId: null,
      finishedAt: null,
    });
  });

  it("an import session records which import it practises", async () => {
    const lesson = await seedImport(daysAgo(1));
    await seedWord("Tisch", { importId: lesson });
    const started = await session("import", lesson);
    expect(started.source).toBe("import");
    expect(
      first(await db.select().from(sessions).where(eq(sessions.id, started.id))),
    ).toMatchObject({ source: "import", importId: lesson, finishedAt: null });
  });

  it("import needs an importId, and no other source takes one", async () => {
    const lesson = await seedImport(daysAgo(1));
    await seedWord("Tisch", { importId: lesson });

    for (const res of [
      await startSession("import"),
      await startSession("import", null),
      await startSession("import", "abc"),
      await startSession("not_learned", lesson),
      await startSession("last_7_days", lesson),
    ]) {
      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe("invalid_request");
    }
    expect(await db.select().from(sessions)).toEqual([]);
  });

  it("404 for an import that is unknown, not done or another learner's", async () => {
    const unfinished = await seedImport(null);
    await seedWord("Offen", { importId: unfinished });
    const [other] = await db
      .insert(users)
      .values({ name: "Other", learnerLanguage: "en", targetLanguage: "de" })
      .returning({ id: users.id });
    const theirs = first(
      await db
        .insert(imports)
        .values({
          userId: other?.id as number,
          status: "done",
          photoCount: 1,
          completedAt: daysAgo(1),
        })
        .returning({ id: imports.id }),
    ).id;

    for (const importId of [999, unfinished, theirs]) {
      const res = await startSession("import", importId);
      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe("import_not_found");
    }
    expect(await db.select().from(sessions)).toEqual([]);
  });

  it("no_words for a done import without learning or learned words", async () => {
    const allSkipped = await seedImport(daysAgo(1));
    await seedWord("Bett", { importId: allSkipped, status: "ignored" });
    const nothingSaved = await seedImport(daysAgo(1));

    for (const importId of [allSkipped, nothingSaved]) {
      const res = await startSession("import", importId);
      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe("no_words");
    }
  });
});

describe("POST /api/sessions/:id/results (§8.4–8.5)", () => {
  it("records the answer with its timing and applies it to the word's progress", async () => {
    const tisch = await seedWord("Tisch");
    const s = await session("not_learned");
    const res = await answer(s.id, tisch, "knew");

    expect(CardResultResponse.parse(res.json())).toEqual({ recorded: true });
    expect(await progress(tisch)).toMatchObject({
      timesSeen: 1,
      timesCorrect: 1,
      correctStreak: 1,
      lastResult: "knew",
      lastPracticedAt: expect.any(Date),
      status: "learning",
    });
    expect(await db.select().from(cardResults)).toMatchObject([
      {
        sessionId: s.id,
        userWordId: tisch,
        result: "knew",
        flipped: true,
        flipMs: 800,
        answerMs: 2000,
      },
    ]);
  });

  it("the third correct answer in a row marks the word learned", async () => {
    const tisch = await seedWord("Tisch");
    for (let i = 0; i < 3; i++) await answer((await session("not_learned")).id, tisch, "knew");
    expect(await progress(tisch)).toMatchObject({ status: "learned", correctStreak: 3 });
  });

  it("didn't know sends a learned word back to learning", async () => {
    const tisch = await seedWord("Tisch", { status: "learned", correctStreak: 4 });
    const s = await session("last_7_days");
    await answer(s.id, tisch, "didnt_know");
    expect(await progress(tisch)).toMatchObject({ status: "learning", correctStreak: 0 });
  });

  it("a retried answer for the same card in the same session counts once", async () => {
    const tisch = await seedWord("Tisch");
    const s = await session("not_learned");
    await answer(s.id, tisch, "knew");
    const again = await answer(s.id, tisch, "knew");

    expect(CardResultResponse.parse(again.json())).toEqual({ recorded: false });
    expect((await progress(tisch)).timesSeen).toBe(1);
    expect(await db.select().from(cardResults)).toHaveLength(1);
  });

  it("skipped is recorded but changes no progress", async () => {
    const tisch = await seedWord("Tisch");
    const before = await progress(tisch);
    const s = await session("not_learned");
    await answer(s.id, tisch, "skipped");

    expect(await progress(tisch)).toEqual(before);
    expect(await db.select().from(cardResults)).toMatchObject([{ result: "skipped" }]);
  });

  it("unknown session or word: 404", async () => {
    const tisch = await seedWord("Tisch");
    const s = await session("not_learned");
    const noSession = await answer(999, tisch, "knew");
    expect(noSession.statusCode).toBe(404);
    expect(noSession.json().error.code).toBe("session_not_found");
    const noWord = await answer(s.id, 999, "knew");
    expect(noWord.statusCode).toBe(404);
    expect(noWord.json().error.code).toBe("word_not_found");
  });

  it("rejects malformed answers", async () => {
    const tisch = await seedWord("Tisch");
    const s = await session("not_learned");
    const res = await app().inject({
      method: "POST",
      url: `/api/sessions/${s.id}/results`,
      payload: { userWordId: tisch, result: "maybe", flipped: false, flipMs: null, answerMs: 1 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/sessions/:id/finish (§8.6)", () => {
  it("returns the counts and the missed words, and marks the session finished", async () => {
    const tisch = await seedWord("Tisch");
    const stuhl = await seedWord("Stuhl");
    const lampe = await seedWord("Lampe");
    const bett = await seedWord("Bett");
    const s = await session("not_learned");
    await answer(s.id, tisch, "knew");
    await answer(s.id, stuhl, "didnt_know");
    await answer(s.id, lampe, "skipped");
    await answer(s.id, bett, "didnt_know");

    const res = await app().inject({
      method: "POST",
      url: `/api/sessions/${s.id}/finish`,
      payload: {},
    });
    const summary = SessionSummary.parse(res.json());
    expect(summary).toMatchObject({ knew: 1, didntKnow: 2, skipped: 1 });
    expect(summary.missed.map((w) => w.lemma)).toEqual(["Stuhl", "Bett"]);

    const [row] = await db.select().from(sessions).where(eq(sessions.id, s.id));
    expect(row?.finishedAt).toBeInstanceOf(Date);

    // Finishing again returns the same summary and keeps the first finish time.
    const again = await app().inject({
      method: "POST",
      url: `/api/sessions/${s.id}/finish`,
      payload: {},
    });
    expect(SessionSummary.parse(again.json())).toEqual(summary);
    const [after] = await db.select().from(sessions).where(eq(sessions.id, s.id));
    expect(after?.finishedAt).toEqual(row?.finishedAt);
  });
});
