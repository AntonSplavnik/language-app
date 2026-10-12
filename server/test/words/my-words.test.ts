import {
  DeleteWordResponse,
  type ExtractedWord,
  ImportView,
  PhotoUploadResponse,
  type Pos,
  SessionResponse,
  WordDetail,
  WordListResponse,
  type WordStatus,
} from "@language-app/core";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createClaudeAi } from "../../src/ai/claude";
import type { MessageRequest } from "../../src/ai/transport";
import { dbUsageSink } from "../../src/ai/usage";
import {
  cardResults,
  sessions,
  users,
  userWords,
  words,
  wordTranslations,
} from "../../src/db/schema";
import { SINGLE_USER_ID } from "../../src/user";
import {
  fakeEnrichResponse,
  isExtractRequest,
  loadAiFixture,
  respondingTransport,
  withText,
} from "../helpers/ai";
import { buildTestApp, multipartFile } from "../helpers/app";
import { first, useTestDb } from "../helpers/db";

const db = useTestDb();
const app = () => buildTestApp(db);

type Seed = {
  pos?: Pos;
  article?: "der" | "die" | "das" | null;
  translation?: string;
  customTranslation?: string | null;
  note?: string | null;
  status?: WordStatus;
  userId?: number;
  timesSeen?: number;
  timesCorrect?: number;
  correctStreak?: number;
};

/** A shared word with an English translation and a user_words row. Returns the user_words id. */
async function seedWord(
  lemma: string,
  {
    pos = "noun",
    article = pos === "noun" ? "der" : null,
    translation = `${lemma.toLowerCase()}-en`,
    customTranslation = null,
    note = null,
    status = "learning",
    userId = SINGLE_USER_ID,
    timesSeen = 0,
    timesCorrect = 0,
    correctStreak = 0,
  }: Seed = {},
) {
  const word = first(
    await db
      .insert(words)
      .values({ language: "de", lemma, pos, article, checkStatus: "match" })
      .returning({ id: words.id }),
  );
  await db.insert(wordTranslations).values({ wordId: word.id, language: "en", translation });
  return first(
    await db
      .insert(userWords)
      .values({
        userId,
        wordId: word.id,
        status,
        customTranslation,
        note,
        timesSeen,
        timesCorrect,
        correctStreak,
      })
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

async function list(query = "") {
  const res = await app().inject({ method: "GET", url: `/api/words${query}` });
  expect(res.statusCode).toBe(200);
  return WordListResponse.parse(res.json());
}

const lemmas = (body: WordListResponse) => body.words.map((w) => w.lemma);

async function detail(id: number) {
  const res = await app().inject({ method: "GET", url: `/api/words/${id}` });
  expect(res.statusCode).toBe(200);
  return WordDetail.parse(res.json());
}

const patch = (id: number, payload: unknown) =>
  app().inject({ method: "PATCH", url: `/api/words/${id}`, payload: payload as object });

const remove = (id: number) => app().inject({ method: "DELETE", url: `/api/words/${id}` });

const errorCode = (res: { json: () => unknown }) =>
  (res.json() as { error: { code: string } }).error.code;

const progress = async (id: number) =>
  first(await db.select().from(userWords).where(eq(userWords.id, id)));

describe("GET /api/words (§9)", () => {
  it("lists the learner's words alphabetically, ignoring case, with status and progress", async () => {
    await seedWord("Zug");
    await seedWord("aber", { pos: "conjunction", status: "learned" });
    await seedWord("Übung", { article: "die", status: "ignored" });
    await seedWord("Apfel", { timesSeen: 4, timesCorrect: 3, correctStreak: 2 });

    const body = await list();
    expect(lemmas(body)).toEqual(["aber", "Apfel", "Übung", "Zug"]);
    expect(body.words[1]).toMatchObject({
      lemma: "Apfel",
      article: "der",
      translation: "apfel-en",
      customTranslation: null,
      status: "learning",
      timesSeen: 4,
      correctStreak: 2,
    });
    expect(body.counts).toEqual({ learning: 2, learned: 1, ignored: 1 });
  });

  it("filters by status; the counts still cover every status", async () => {
    await seedWord("Tisch");
    await seedWord("Stuhl", { status: "learned" });
    await seedWord("Lampe", { status: "ignored" });
    await seedWord("Bett", { status: "ignored" });

    expect(lemmas(await list("?status=learning"))).toEqual(["Tisch"]);
    expect(lemmas(await list("?status=learned"))).toEqual(["Stuhl"]);
    const ignored = await list("?status=ignored");
    expect(lemmas(ignored)).toEqual(["Bett", "Lampe"]);
    expect(ignored.counts).toEqual({ learning: 1, learned: 1, ignored: 2 });
  });

  it("searches the German lemma, the stored translation and the custom translation, ignoring case", async () => {
    await seedWord("Tisch", { translation: "table" });
    await seedWord("Schreibtisch", { translation: "desk" });
    await seedWord("Stuhl", { translation: "chair", customTranslation: "seat" });
    await seedWord("Übung", { article: "die", translation: "exercise", status: "ignored" });

    expect(lemmas(await list("?q=TISCH"))).toEqual(["Schreibtisch", "Tisch"]);
    expect(lemmas(await list("?q=Tabl"))).toEqual(["Tisch"]);
    expect(lemmas(await list("?q=SEA"))).toEqual(["Stuhl"]);
    expect(lemmas(await list(`?q=${encodeURIComponent("übu")}`))).toEqual(["Übung"]);
    expect(lemmas(await list("?q=%20%20"))).toHaveLength(4);
  });

  it("combines search and status, and counts the matches per status", async () => {
    await seedWord("Tisch", { translation: "table" });
    await seedWord("Nachttisch", { translation: "bedside table", status: "ignored" });
    await seedWord("Stuhl", { translation: "chair" });

    const body = await list("?status=learning&q=tisch");
    expect(lemmas(body)).toEqual(["Tisch"]);
    expect(body.counts).toEqual({ learning: 1, learned: 0, ignored: 1 });
  });

  it("treats % and _ in the search as plain characters", async () => {
    await seedWord("Tisch", { translation: "table" });
    await seedWord("Prozent", { translation: "100 %" });
    expect(lemmas(await list("?q=%25"))).toEqual(["Prozent"]);
    expect(lemmas(await list("?q=_"))).toEqual([]);
  });

  it("shows only this learner's words", async () => {
    await seedWord("Tisch");
    await seedWord("Stuhl", { userId: await otherLearner() });
    const body = await list();
    expect(lemmas(body)).toEqual(["Tisch"]);
    expect(body.counts).toEqual({ learning: 1, learned: 0, ignored: 0 });
  });

  it("rejects an unknown status", async () => {
    const res = await app().inject({ method: "GET", url: "/api/words?status=forgotten" });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe("invalid_request");
  });
});

describe("GET /api/words/:id (§10 Word detail)", () => {
  it("returns the word, how it was checked, where its forms came from, and the progress", async () => {
    const id = await seedWord("gehen", {
      pos: "verb",
      translation: "to go",
      customTranslation: "to walk",
      note: "irregular",
      timesSeen: 5,
      timesCorrect: 4,
      correctStreak: 2,
    });
    const { wordId } = await progress(id);
    const practisedAt = new Date("2026-10-10T08:30:00Z");
    const addedAt = new Date("2026-10-01T12:00:00Z");
    await db
      .update(words)
      .set({
        forms: { praeteritum: "ging", partizip2: "gegangen", auxiliary: "sein" },
        formsSource: "dictionary",
        exampleDe: "Ich gehe nach Hause.",
        checkStatus: "mismatch_kept",
        enrichedAt: new Date(),
      })
      .where(eq(words.id, wordId));
    await db
      .update(wordTranslations)
      .set({ exampleTranslation: "I am going home." })
      .where(eq(wordTranslations.wordId, wordId));
    await db
      .update(userWords)
      .set({ lastResult: "knew", lastPracticedAt: practisedAt, addedAt })
      .where(eq(userWords.id, id));

    expect(await detail(id)).toEqual({
      userWordId: id,
      lemma: "gehen",
      pos: "verb",
      article: null,
      plural: null,
      forms: { praeteritum: "ging", partizip2: "gegangen", auxiliary: "sein" },
      translation: "to go",
      customTranslation: "to walk",
      exampleDe: "Ich gehe nach Hause.",
      exampleTranslation: "I am going home.",
      note: "irregular",
      enriched: true,
      status: "learning",
      formsSource: "dictionary",
      checkStatus: "mismatch_kept",
      timesSeen: 5,
      timesCorrect: 4,
      correctStreak: 2,
      lastResult: "knew",
      lastPracticedAt: "2026-10-10T08:30:00.000Z",
      addedAt: "2026-10-01T12:00:00.000Z",
    });
  });

  it("a word that was never practised or enriched", async () => {
    expect(await detail(await seedWord("Tisch"))).toMatchObject({
      enriched: false,
      formsSource: null,
      lastResult: null,
      lastPracticedAt: null,
      timesSeen: 0,
    });
  });

  it("404 for an unknown word or another learner's word; 400 for a malformed id", async () => {
    const theirs = await seedWord("Tisch", { userId: await otherLearner() });
    for (const url of ["/api/words/999", `/api/words/${theirs}`]) {
      const res = await app().inject({ method: "GET", url });
      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe("word_not_found");
    }
    expect((await app().inject({ method: "GET", url: "/api/words/abc" })).statusCode).toBe(400);
  });
});

describe("PATCH /api/words/:id", () => {
  it("saves a custom translation (trimmed), which practice cards then show (§8.2)", async () => {
    const id = await seedWord("Tisch", { translation: "table" });

    const res = await patch(id, { customTranslation: "  desk ", note: " from lesson 4 " });
    expect(res.statusCode).toBe(200);
    expect(WordDetail.parse(res.json())).toMatchObject({
      translation: "table",
      customTranslation: "desk",
      note: "from lesson 4",
    });

    const started = await app().inject({
      method: "POST",
      url: "/api/sessions",
      payload: { source: "not_learned" },
    });
    expect(SessionResponse.parse(started.json()).cards[0]).toMatchObject({
      userWordId: id,
      translation: "table",
      customTranslation: "desk",
      note: "from lesson 4",
    });
  });

  it("a blank text or null clears the custom translation and the note", async () => {
    const id = await seedWord("Tisch", { customTranslation: "desk", note: "lesson 4" });

    expect((await patch(id, { customTranslation: "   ", note: "" })).statusCode).toBe(200);
    expect(await progress(id)).toMatchObject({ customTranslation: null, note: null });

    await patch(id, { customTranslation: "desk", note: "again" });
    await patch(id, { customTranslation: null, note: null });
    expect(await progress(id)).toMatchObject({ customTranslation: null, note: null });
  });

  it("leaves fields that are not sent unchanged", async () => {
    const id = await seedWord("Tisch", { customTranslation: "desk", note: "lesson 4" });
    await patch(id, { status: "ignored" });
    expect(await progress(id)).toMatchObject({
      status: "ignored",
      customTranslation: "desk",
      note: "lesson 4",
    });
    expect((await patch(id, {})).statusCode).toBe(200);
  });

  it("moving a word back to learning resets its streak; other changes keep it", async () => {
    const learned = await seedWord("Tisch", { status: "learned", timesSeen: 3, correctStreak: 3 });
    const res = await patch(learned, { status: "learning" });
    expect(WordDetail.parse(res.json())).toMatchObject({ status: "learning", correctStreak: 0 });
    // The counters of what happened stay.
    expect(await progress(learned)).toMatchObject({ timesSeen: 3, correctStreak: 0 });

    const learning = await seedWord("Stuhl", { correctStreak: 2 });
    await patch(learning, { status: "learning", note: "same status" });
    expect((await progress(learning)).correctStreak).toBe(2);
    await patch(learning, { status: "learned" });
    expect(await progress(learning)).toMatchObject({ status: "learned", correctStreak: 2 });
  });

  it("rejects an invalid status or a text that is too long", async () => {
    const id = await seedWord("Tisch");
    const bad = await patch(id, { status: "forgotten" });
    expect(bad.statusCode).toBe(400);
    expect(errorCode(bad)).toBe("invalid_request");
    expect((await patch(id, { customTranslation: "x".repeat(201) })).statusCode).toBe(400);
    expect((await patch(id, { note: 5 })).statusCode).toBe(400);
    expect(await progress(id)).toMatchObject({ status: "learning", customTranslation: null });
  });

  it("404 for another learner's word, which stays unchanged", async () => {
    const theirs = await seedWord("Tisch", { userId: await otherLearner() });
    const res = await patch(theirs, { status: "ignored" });
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe("word_not_found");
    expect((await progress(theirs)).status).toBe("learning");
  });
});

describe("DELETE /api/words/:id", () => {
  it("removes the word from the learner's list with its answers; the shared word stays", async () => {
    const tisch = await seedWord("Tisch");
    const stuhl = await seedWord("Stuhl");
    const { wordId } = await progress(tisch);
    const session = first(
      await db
        .insert(sessions)
        .values({ userId: SINGLE_USER_ID, source: "not_learned" })
        .returning({ id: sessions.id }),
    );
    await db.insert(cardResults).values([
      { sessionId: session.id, userWordId: tisch, result: "knew", flipped: false, answerMs: 900 },
      { sessionId: session.id, userWordId: stuhl, result: "knew", flipped: false, answerMs: 900 },
    ]);

    const res = await remove(tisch);
    expect(res.statusCode).toBe(200);
    expect(DeleteWordResponse.parse(res.json())).toEqual({ deleted: true });

    expect(lemmas(await list())).toEqual(["Stuhl"]);
    expect(await db.select().from(cardResults)).toMatchObject([{ userWordId: stuhl }]);
    expect(await db.select().from(words).where(eq(words.id, wordId))).toHaveLength(1);
    expect(
      await db.select().from(wordTranslations).where(eq(wordTranslations.wordId, wordId)),
    ).toHaveLength(1);

    const again = await remove(tisch);
    expect(again.statusCode).toBe(404);
    expect(errorCode(again)).toBe("word_not_found");
    expect((await app().inject({ method: "GET", url: `/api/words/${tisch}` })).statusCode).toBe(
      404,
    );
  });

  it("404 for another learner's word, which stays", async () => {
    const theirs = await seedWord("Tisch", { userId: await otherLearner() });
    expect((await remove(theirs)).statusCode).toBe(404);
    expect(await db.select().from(userWords).where(eq(userWords.id, theirs))).toHaveLength(1);
  });

  it("a later import offers a deleted word again as new, reusing the shared word", async () => {
    const PAGE: ExtractedWord[] = [
      { lemma: "Tisch", pos: "noun", article: "der", translation: "table" },
    ];
    const extract = withText(
      loadAiFixture("extract-vocab-p13").response,
      JSON.stringify({ pageQuality: "ok", words: PAGE }),
    );
    const replay = respondingTransport((request: MessageRequest) =>
      isExtractRequest(request) ? extract : fakeEnrichResponse(request),
    );
    const ai = createClaudeAi({
      transport: replay.transport,
      recordUsage: dbUsageSink(db),
      models: { extract: "claude-haiku-5-5", enrich: "claude-haiku-5-5" },
      effort: "medium",
      learnerLanguage: "en",
    });
    const withAi = buildTestApp(db, { ai });
    const importPage = async () => {
      const created = ImportView.parse(
        (await withAi.inject({ method: "POST", url: "/api/imports", payload: {} })).json(),
      );
      const upload = await withAi.inject({
        method: "POST",
        url: `/api/imports/${created.id}/photos`,
        ...multipartFile("photo", new Uint8Array([0xff, 0xd8, 0xff, 0xd9])),
      });
      return PhotoUploadResponse.parse(upload.json()).import;
    };
    const save = (importId: number) =>
      withAi.inject({
        method: "POST",
        url: `/api/imports/${importId}/save`,
        payload: { decisions: [{ key: "Tisch|noun|der", action: "add" }] },
      });

    const firstImport = await importPage();
    expect(firstImport.candidates[0]?.existing).toBe("none");
    expect((await save(firstImport.id)).statusCode).toBe(200);
    const [added] = (await list()).words;
    expect(added?.lemma).toBe("Tisch");

    expect((await importPage()).candidates[0]?.existing).toBe("in_my_words");

    expect((await remove(added?.userWordId as number)).statusCode).toBe(200);
    const secondImport = await importPage();
    expect(secondImport.candidates[0]?.existing).toBe("none");

    // Adding it again reuses the shared word and its details: no second enrich call.
    const enrichCalls = () => replay.requests.filter((r) => !isExtractRequest(r)).length;
    expect(enrichCalls()).toBe(1);
    expect((await save(secondImport.id)).statusCode).toBe(200);
    expect(enrichCalls()).toBe(1);
    expect(await db.select().from(words)).toHaveLength(1);
    expect((await list()).words).toMatchObject([{ lemma: "Tisch", status: "learning" }]);
  });
});
