import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import {
  type ExtractedWord,
  ImportListResponse,
  ImportView,
  PhotoUploadResponse,
  SaveResponse,
  StatsResponse,
} from "@language-app/core";
import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createClaudeAi } from "../../src/ai/claude";
import { dbUsageSink } from "../../src/ai/usage";
import { aiUsage, imports, userWords, words, wordTranslations } from "../../src/db/schema";
import { loadDictionary } from "../../src/dictionary/load";
import { SINGLE_USER_ID } from "../../src/user";
import { apiError, loadAiFixture, replayTransport, withStopReason, withText } from "../helpers/ai";
import { buildTestApp, multipartFile } from "../helpers/app";
import { first, useTestDb } from "../helpers/db";

const db = useTestDb();
const SAMPLE = new URL("../fixtures/kaikki-sample.jsonl", import.meta.url).pathname;
const recorded = loadAiFixture("extract-vocab-p13").response;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

// The dictionary is emptied with every other table before each test.
beforeEach(async () => {
  await loadDictionary(db, SAMPLE);
});

/** A recorded response whose word list is replaced, to test specific cases. */
const page = (words: ExtractedWord[], pageQuality: "ok" | "poor" = "ok") =>
  withText(recorded, JSON.stringify({ pageQuality, words }));

const w = (
  lemma: string,
  pos: ExtractedWord["pos"],
  article: ExtractedWord["article"],
  translation = lemma.toLowerCase(),
): ExtractedWord => ({ lemma, pos, article, translation });

// Words chosen against the dictionary sample (server/test/fixtures/kaikki-sample.jsonl).
const PAGE_ONE = [
  w("Tisch", "noun", "der", "table"),
  w("See", "noun", "die", "sea"),
  w("Zeitung", "noun", "der", "newspaper"), // the dictionary says die
  w("Kühlschrank", "noun", "der", "fridge"), // not in the sample
  w("gehen", "verb", null, "to go"),
  w("nicht", "particle", null, "not"), // Wiktionary: adverb
  w("Tisch", "noun", "der", "desk"), // duplicate on the same page
];

function setup(responses: Array<BetaMessage | Error> = [], dailyPhotoLimit = 50) {
  const replay = replayTransport(...responses);
  const ai = createClaudeAi({
    transport: replay.transport,
    recordUsage: dbUsageSink(db),
    models: {
      extract: "claude-haiku-5-5",
      enrich: "claude-haiku-5-5",
      describe: "claude-haiku-5-5",
    },
    effort: "medium",
    learnerLanguage: "en",
  });
  const app = buildTestApp(db, { ai, dailyPhotoLimit });

  return {
    app,
    aiRequests: replay.requests,
    async createImport(name?: string) {
      const res = await app.inject({ method: "POST", url: "/api/imports", payload: { name } });
      expect(res.statusCode).toBe(201);
      return ImportView.parse(res.json());
    },
    upload: (importId: number, content: Uint8Array = JPEG) =>
      app.inject({
        method: "POST",
        url: `/api/imports/${importId}/photos`,
        ...multipartFile("photo", content),
      }),
    getImport: async (importId: number) =>
      ImportView.parse(
        (await app.inject({ method: "GET", url: `/api/imports/${importId}` })).json(),
      ),
    review: (importId: number) =>
      app.inject({ method: "POST", url: `/api/imports/${importId}/review`, payload: {} }),
    save: (importId: number, decisions: unknown[]) =>
      app.inject({ method: "POST", url: `/api/imports/${importId}/save`, payload: { decisions } }),
  };
}

const errorCode = (res: { json: () => unknown }) =>
  (res.json() as { error: { code: string } }).error.code;

/** Uploads one page into a new import and returns the import as the upload left it. */
async function importWithPage(s: ReturnType<typeof setup>) {
  const created = await s.createImport("Lesson 4");
  const res = await s.upload(created.id);
  expect(res.statusCode).toBe(200);
  return PhotoUploadResponse.parse(res.json()).import;
}

const candidate = (view: ImportView, key: string) => {
  const found = view.candidates.find((c) => c.key === key);
  if (!found) throw new Error(`no candidate ${key}`);
  return found;
};

describe("POST /api/imports", () => {
  it("creates a collecting import, with or without a name", async () => {
    const s = setup();
    expect(await s.createImport("  Lesson 4 ")).toMatchObject({
      name: "Lesson 4",
      status: "collecting",
      photoCount: 0,
      candidates: [],
      completedAt: null,
    });
    expect((await s.createImport()).name).toBeNull();
  });

  it("stores where the pages come from: photos by default, or a PDF (§6.8)", async () => {
    const s = setup();
    const photos = await s.createImport();
    expect(photos.source).toBe("photos");

    const res = await s.app.inject({
      method: "POST",
      url: "/api/imports",
      payload: { name: "Pages 42–45", source: "pdf" },
    });
    expect(res.statusCode).toBe(201);
    const pdf = ImportView.parse(res.json());
    expect(pdf).toMatchObject({ name: "Pages 42–45", source: "pdf", status: "collecting" });
    expect(
      first(await db.select({ source: imports.source }).from(imports).where(eq(imports.id, pdf.id)))
        .source,
    ).toBe("pdf");
    expect((await s.getImport(pdf.id)).source).toBe("pdf");

    // Saved with a word to learn, it is a past import that says it came from a PDF.
    await db
      .update(imports)
      .set({ status: "done", completedAt: new Date() })
      .where(eq(imports.id, pdf.id));
    const word = first(
      await db
        .insert(words)
        .values({
          language: "de",
          lemma: "Tisch",
          pos: "noun",
          article: "der",
          checkStatus: "match",
        })
        .returning({ id: words.id }),
    );
    await db
      .insert(userWords)
      .values({ userId: SINGLE_USER_ID, wordId: word.id, status: "learning", importId: pdf.id });
    const listed = ImportListResponse.parse(
      (await s.app.inject({ method: "GET", url: "/api/imports" })).json(),
    ).imports;
    expect(listed).toEqual([expect.objectContaining({ id: pdf.id, source: "pdf", wordCount: 1 })]);
  });

  it.each([["scanner"], ["typed"], [""], [3]])("rejects the source %j", async (source) => {
    // A typed list has its own route (§9.3); POST /imports takes photos or PDF pages only.
    const s = setup();
    const res = await s.app.inject({ method: "POST", url: "/api/imports", payload: { source } });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe("invalid_request");
  });
});

describe("POST /api/imports/:id/photos (§6.1–6.3)", () => {
  it("extracts, merges duplicates and checks each new word against the dictionary", async () => {
    const s = setup([page(PAGE_ONE)]);
    const created = await s.createImport();
    const res = await s.upload(created.id);

    expect(res.statusCode).toBe(200);
    const body = PhotoUploadResponse.parse(res.json());
    expect(body).toMatchObject({ pageQuality: "ok", wordsFound: 7 });
    expect(body.import.photoCount).toBe(1);

    const view = body.import;
    expect(view.candidates.map((c) => c.key)).toEqual([
      "Tisch|noun|der",
      "See|noun|die",
      "Zeitung|noun|der",
      "Kühlschrank|noun|der",
      "gehen|verb|",
      "nicht|particle|",
    ]);
    expect(candidate(view, "Tisch|noun|der")).toMatchObject({
      translation: "table",
      photoIndex: 0,
      existing: "none",
      dictionary: { status: "match" },
    });
    expect(candidate(view, "See|noun|die").dictionary).toEqual({ status: "match" });
    expect(candidate(view, "Zeitung|noun|der").dictionary).toEqual({
      status: "mismatch",
      genders: ["die"],
    });
    expect(candidate(view, "Kühlschrank|noun|der").dictionary).toEqual({ status: "not_found" });
    expect(candidate(view, "nicht|particle|").dictionary).toEqual({ status: "match" });
  });

  it("sends the photo to the AI and records the call against the import", async () => {
    const s = setup([page(PAGE_ONE)]);
    const created = await s.createImport();
    await s.upload(created.id);

    const image = first(s.aiRequests).messages[0]?.content;
    expect(JSON.stringify(image)).toContain(Buffer.from(JPEG).toString("base64"));
    const usage = await db.select().from(aiUsage);
    expect(usage).toMatchObject([{ importId: created.id, callType: "extract", ok: true }]);
  });

  it("a second photo adds only new words; earlier translations win", async () => {
    const s = setup([
      page(PAGE_ONE),
      page([w("Tisch", "noun", "der", "desk"), w("Obst", "noun", "das", "fruit")]),
    ]);
    const created = await s.createImport();
    await s.upload(created.id);
    const view = PhotoUploadResponse.parse((await s.upload(created.id)).json()).import;

    expect(view.photoCount).toBe(2);
    expect(view.candidates).toHaveLength(7);
    expect(candidate(view, "Tisch|noun|der")).toMatchObject({
      translation: "table",
      photoIndex: 0,
    });
    expect(candidate(view, "Obst|noun|das")).toMatchObject({ photoIndex: 1 });
  });

  it("a poor page still adds the words it could read", async () => {
    const s = setup([page([w("Tisch", "noun", "der", "table")], "poor")]);
    const created = await s.createImport();
    const body = PhotoUploadResponse.parse((await s.upload(created.id)).json());
    expect(body.pageQuality).toBe("poor");
    expect(body.import.candidates).toHaveLength(1);
  });

  it("marks words the learner already has, in any status, as in_my_words", async () => {
    const s = setup([page(PAGE_ONE)]);
    const tisch = first(
      await db
        .insert(words)
        .values({
          language: "de",
          lemma: "Tisch",
          pos: "noun",
          article: "der",
          checkStatus: "match",
        })
        .returning({ id: words.id }),
    );
    await db
      .insert(userWords)
      .values({ userId: SINGLE_USER_ID, wordId: tisch.id, status: "ignored" });

    const view = await importWithPage(s);
    expect(candidate(view, "Tisch|noun|der").existing).toBe("in_my_words");
    expect(candidate(view, "See|noun|die").existing).toBe("none");
  });

  it("two photos uploaded at the same time both end up in the import", async () => {
    const s = setup([
      page([w("Tisch", "noun", "der", "table")]),
      page([w("Obst", "noun", "das", "fruit")]),
    ]);
    const created = await s.createImport();
    const [a, b] = await Promise.all([s.upload(created.id), s.upload(created.id)]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);

    const view = await s.getImport(created.id);
    expect(view.photoCount).toBe(2);
    expect(view.candidates.map((c) => c.lemma).sort()).toEqual(["Obst", "Tisch"]);
  });

  it("refuses uploads once the daily page limit is reached, without calling the AI", async () => {
    const s = setup([page(PAGE_ONE)], 2);
    const created = await s.createImport();
    await db.insert(aiUsage).values([
      { userId: SINGLE_USER_ID, callType: "extract", model: "m", ok: true },
      { userId: SINGLE_USER_ID, callType: "extract", model: "m", ok: false },
    ]);

    const res = await s.upload(created.id);
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({
      error: { code: "daily_limit", message: "Daily page limit reached" },
    });
    expect(s.aiRequests).toHaveLength(0);
  });

  it.each([
    ["the AI is busy", () => apiError(529), 503, "ai_busy"],
    [
      "the AI refused",
      () => withStopReason(recorded, "refusal", { content: [] }),
      422,
      "ai_refused",
    ],
    ["the page is too long", () => withStopReason(recorded, "max_tokens"), 422, "page_too_long"],
  ])("when %s, the photo fails and the import is unchanged", async (_, response, status, code) => {
    const s = setup([response()]);
    const created = await s.createImport();
    const res = await s.upload(created.id);

    expect(res.statusCode).toBe(status);
    expect(errorCode(res)).toBe(code);
    expect(await s.getImport(created.id)).toMatchObject({ photoCount: 0, candidates: [] });
  });

  it("invalid AI output twice: the photo fails with ai_invalid_output", async () => {
    const broken = withText(recorded, "not json");
    const s = setup([broken, broken]);
    const created = await s.createImport();
    const res = await s.upload(created.id);
    expect(res.statusCode).toBe(422);
    expect(errorCode(res)).toBe("ai_invalid_output");
  });

  it("rejects a file that is not a JPEG, and a request without a file", async () => {
    const s = setup();
    const created = await s.createImport();

    const png = await s.upload(created.id, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    expect(png.statusCode).toBe(400);
    expect(errorCode(png)).toBe("invalid_image");

    const empty = await s.app.inject({
      method: "POST",
      url: `/api/imports/${created.id}/photos`,
      payload: {},
    });
    expect(empty.statusCode).toBe(400);
  });

  it("refuses photos once review has started", async () => {
    const s = setup();
    const created = await s.createImport();
    expect((await s.review(created.id)).statusCode).toBe(200);

    const res = await s.upload(created.id);
    expect(res.statusCode).toBe(409);
    expect(errorCode(res)).toBe("import_closed");
  });

  it("unknown import: 404", async () => {
    const s = setup();
    const res = await s.upload(999);
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe("import_not_found");
  });
});

describe("GET /api/imports/:id", () => {
  it("recomputes in_my_words when read, so a reload shows the current state", async () => {
    const s = setup([page(PAGE_ONE), page([w("Tisch", "noun", "der", "table")])]);
    const lesson = await importWithPage(s);

    // Tisch gets added through another import in the meantime.
    const other = await importWithPage(s);
    await s.save(other.id, [{ key: "Tisch|noun|der", action: "add" }]);

    expect(candidate(await s.getImport(lesson.id), "Tisch|noun|der").existing).toBe("in_my_words");
  });

  it("returns 404 for an unknown import and 400 for an invalid id", async () => {
    const s = setup();
    expect((await s.app.inject({ method: "GET", url: "/api/imports/42" })).statusCode).toBe(404);
    expect((await s.app.inject({ method: "GET", url: "/api/imports/abc" })).statusCode).toBe(400);
  });
});

describe("POST /api/imports/:id/save (§6.5)", () => {
  const allDecisions = [
    { key: "Tisch|noun|der", action: "add" },
    { key: "See|noun|die", action: "add" },
    { key: "Zeitung|noun|der", action: "add" },
    { key: "Kühlschrank|noun|der", action: "add" },
    { key: "gehen|verb|", action: "add" },
    { key: "nicht|particle|", action: "skip" },
  ];

  async function savedWord(lemma: string) {
    const [row] = await db
      .select({
        article: words.article,
        checkStatus: words.checkStatus,
        status: userWords.status,
        importId: userWords.importId,
        translation: wordTranslations.translation,
      })
      .from(words)
      .leftJoin(userWords, eq(userWords.wordId, words.id))
      .leftJoin(wordTranslations, eq(wordTranslations.wordId, words.id))
      .where(eq(words.lemma, lemma));
    return row;
  }

  it("adds and skips words, records how they were checked, and finishes the import", async () => {
    const s = setup([page(PAGE_ONE)]);
    const view = await importWithPage(s);

    const res = await s.save(view.id, allDecisions);
    expect(res.statusCode).toBe(200);
    expect(SaveResponse.parse(res.json())).toEqual({ added: 5, skipped: 1, detailsPending: 5 });

    expect(await savedWord("Tisch")).toEqual({
      article: "der",
      checkStatus: "match",
      status: "learning",
      importId: view.id,
      translation: "table",
    });
    expect(await savedWord("Zeitung")).toMatchObject({
      article: "der",
      checkStatus: "mismatch_kept",
    });
    expect(await savedWord("Kühlschrank")).toMatchObject({ checkStatus: "not_in_dictionary" });
    expect(await savedWord("nicht")).toMatchObject({ status: "ignored" });

    const done = await s.getImport(view.id);
    expect(done.status).toBe("done");
    expect(done.completedAt).not.toBeNull();

    const stats = StatsResponse.parse(
      (await s.app.inject({ method: "GET", url: "/api/stats" })).json(),
    );
    expect(stats).toMatchObject({ learning: 5, learned: 0, unfinishedImports: [] });
  });

  it("applies the dictionary article the learner chose: mismatch_fixed", async () => {
    const s = setup([page(PAGE_ONE)]);
    const view = await importWithPage(s);

    await s.save(view.id, [{ key: "Zeitung|noun|der", action: "add", article: "die" }]);
    expect(await savedWord("Zeitung")).toMatchObject({
      article: "die",
      checkStatus: "mismatch_fixed",
    });
  });

  it("a fix that leads to a word the learner already has changes nothing", async () => {
    const s = setup([page(PAGE_ONE)]);
    const view = await importWithPage(s);
    const zeitung = first(
      await db
        .insert(words)
        .values({
          language: "de",
          lemma: "Zeitung",
          pos: "noun",
          article: "die",
          checkStatus: "match",
        })
        .returning({ id: words.id }),
    );
    await db
      .insert(userWords)
      .values({ userId: SINGLE_USER_ID, wordId: zeitung.id, status: "learned" });

    const res = await s.save(view.id, [{ key: "Zeitung|noun|der", action: "add", article: "die" }]);
    expect(SaveResponse.parse(res.json())).toMatchObject({ added: 0 });
    const [mine] = await db.select().from(userWords).where(eq(userWords.wordId, zeitung.id));
    expect(mine?.status).toBe("learned");
  });

  it("reuses an existing shared word unchanged", async () => {
    const s = setup([page(PAGE_ONE)]);
    const view = await importWithPage(s);
    const tisch = first(
      await db
        .insert(words)
        .values({
          language: "de",
          lemma: "Tisch",
          pos: "noun",
          article: "der",
          checkStatus: "mismatch_fixed",
        })
        .returning({ id: words.id }),
    );
    await db
      .insert(wordTranslations)
      .values({ wordId: tisch.id, language: "en", translation: "desk" });

    await s.save(view.id, [{ key: "Tisch|noun|der", action: "add" }]);
    expect(await db.select().from(words).where(eq(words.lemma, "Tisch"))).toHaveLength(1);
    expect(await savedWord("Tisch")).toMatchObject({
      checkStatus: "mismatch_fixed",
      translation: "desk",
    });
  });

  it("when two candidates become the same word, add wins over skip", async () => {
    const s = setup([
      page([w("Zeitung", "noun", "der", "paper"), w("Zeitung", "noun", "die", "newspaper")]),
    ]);
    const view = await importWithPage(s);

    const res = await s.save(view.id, [
      { key: "Zeitung|noun|die", action: "skip" },
      { key: "Zeitung|noun|der", action: "add", article: "die" },
    ]);
    expect(SaveResponse.parse(res.json())).toMatchObject({ added: 1, skipped: 0 });
    expect(await savedWord("Zeitung")).toMatchObject({ article: "die", status: "learning" });
  });

  it("rejects an article the dictionary does not offer, and unknown candidates", async () => {
    const s = setup([page(PAGE_ONE)]);
    const view = await importWithPage(s);

    const wrongArticle = await s.save(view.id, [
      { key: "Zeitung|noun|der", action: "add", article: "das" },
    ]);
    expect(wrongArticle.statusCode).toBe(400);
    expect(errorCode(wrongArticle)).toBe("invalid_article");

    const notAMismatch = await s.save(view.id, [
      { key: "Tisch|noun|der", action: "add", article: "die" },
    ]);
    expect(errorCode(notAMismatch)).toBe("invalid_article");

    const unknown = await s.save(view.id, [{ key: "Quatsch|noun|der", action: "add" }]);
    expect(unknown.statusCode).toBe(400);
    expect(errorCode(unknown)).toBe("unknown_candidate");

    const malformed = await s.save(view.id, [{ key: "Tisch|noun|der", action: "maybe" }]);
    expect(errorCode(malformed)).toBe("invalid_request");

    // Nothing was saved by the rejected requests.
    expect(await db.select().from(userWords)).toHaveLength(0);
    expect((await s.getImport(view.id)).status).toBe("collecting");
  });

  it("an import can only be saved once", async () => {
    const s = setup([page(PAGE_ONE)]);
    const view = await importWithPage(s);
    expect((await s.save(view.id, allDecisions)).statusCode).toBe(200);

    const again = await s.save(view.id, allDecisions);
    expect(again.statusCode).toBe(409);
    expect(errorCode(again)).toBe("import_closed");
  });

  it("skipped words are never offered again (§1)", async () => {
    const s = setup([page(PAGE_ONE), page(PAGE_ONE)]);
    const first = await importWithPage(s);
    await s.save(
      first.id,
      allDecisions.map((d) => ({ ...d, action: "skip" })),
    );

    const second = await importWithPage(s);
    expect(second.candidates.every((c) => c.existing === "in_my_words")).toBe(true);
  });

  it("two imports saving the same word at the same time create it once", async () => {
    const s = setup([
      page([w("Tisch", "noun", "der", "table")]),
      page([w("Tisch", "noun", "der", "table")]),
    ]);
    const a = await importWithPage(s);
    const b = await importWithPage(s);

    const results = await Promise.all([
      s.save(a.id, [{ key: "Tisch|noun|der", action: "add" }]),
      s.save(b.id, [{ key: "Tisch|noun|der", action: "add" }]),
    ]);
    const added = results.map((r) => SaveResponse.parse(r.json()).added);
    expect(added.sort()).toEqual([0, 1]);
    expect(await db.select().from(words).where(eq(words.lemma, "Tisch"))).toHaveLength(1);
    expect(
      await db
        .select()
        .from(userWords)
        .where(and(eq(userWords.userId, SINGLE_USER_ID)))
        .orderBy(asc(userWords.id)),
    ).toHaveLength(1);
  });
});
