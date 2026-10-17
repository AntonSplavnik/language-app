import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import {
  AddWordsResponse,
  type EntryView,
  ImportListResponse,
  LookupResponse,
  SessionResponse,
  TypedImportResponse,
  type TypedWord,
  type WordStatus,
} from "@language-app/core";
import { and, asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createClaudeAi } from "../../src/ai/claude";
import type { MessageRequest } from "../../src/ai/transport";
import { dbUsageSink } from "../../src/ai/usage";
import { aiUsage, imports, users, userWords, words, wordTranslations } from "../../src/db/schema";
import { loadDictionary } from "../../src/dictionary/load";
import { SINGLE_USER_ID } from "../../src/user";
import { apiError, enrichInputOf, fakeEnrichResponse, respondingTransport } from "../helpers/ai";
import { buildTestApp } from "../helpers/app";
import { first, useTestDb } from "../helpers/db";

// Saving typed words (docs/design.md §6.7, §9.3): one word with POST /words, a list as one import
// with POST /imports/typed. Enrichment replays a made-up response built from each request.

const db = useTestDb();
const SAMPLE = new URL("../fixtures/kaikki-sample.jsonl", import.meta.url).pathname;

beforeEach(async () => {
  await loadDictionary(db, SAMPLE);
});

function setup(
  respond: (request: MessageRequest) => BetaMessage | Error = (r) => fakeEnrichResponse(r),
) {
  const replay = respondingTransport(respond);
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
  const app = buildTestApp(db, { ai });
  return {
    app,
    aiRequests: replay.requests,
    addWords: (body: unknown) =>
      app.inject({ method: "POST", url: "/api/words", payload: body as object }),
    saveList: (body: unknown) =>
      app.inject({ method: "POST", url: "/api/imports/typed", payload: body as object }),
    lookup: async (q: string) =>
      LookupResponse.parse(
        (
          await app.inject({
            method: "GET",
            url: `/api/dictionary/lookup?q=${encodeURIComponent(q)}`,
          })
        ).json(),
      ),
  };
}

const errorCode = (res: { json: () => unknown }) =>
  (res.json() as { error: { code: string } }).error.code;

/** A word chosen from a dictionary entry view, with the translation the learner kept. */
const fromEntry = (view: EntryView, translation: string): TypedWord => ({
  lemma: view.lemma,
  pos: view.pos,
  article: view.article,
  translation,
  entryId: view.entryId,
});

const byHand = (
  lemma: string,
  pos: TypedWord["pos"],
  article: TypedWord["article"],
  translation: string,
): TypedWord => ({ lemma, pos, article, translation });

/** The shared word and the learner's row for it. */
async function saved(lemma: string, article: TypedWord["article"] = null) {
  const [row] = await db
    .select({
      wordId: words.id,
      plural: words.plural,
      forms: words.forms,
      formsSource: words.formsSource,
      checkStatus: words.checkStatus,
      ipa: words.ipa,
      audioFile: words.audioFile,
      exampleDe: words.exampleDe,
      enriched: words.enrichedAt,
      translation: wordTranslations.translation,
      status: userWords.status,
      importId: userWords.importId,
      customTranslation: userWords.customTranslation,
      userWordId: userWords.id,
    })
    .from(words)
    .leftJoin(wordTranslations, eq(wordTranslations.wordId, words.id))
    .leftJoin(userWords, and(eq(userWords.wordId, words.id), eq(userWords.userId, SINGLE_USER_ID)))
    .where(and(eq(words.lemma, lemma), article === null ? undefined : eq(words.article, article)));
  return row;
}

/** A word another learner (or an earlier import) left in the shared table. */
async function sharedWord(
  lemma: string,
  pos: TypedWord["pos"],
  article: TypedWord["article"],
  translation: string,
) {
  const word = first(
    await db
      .insert(words)
      .values({
        language: "de",
        lemma,
        pos,
        article,
        checkStatus: "match",
        plural: "Tische",
        formsSource: "dictionary",
        enrichedAt: new Date(),
        exampleDe: "Der Tisch ist groß.",
      })
      .returning({ id: words.id }),
  );
  await db.insert(wordTranslations).values({ wordId: word.id, language: "en", translation });
  return word.id;
}

async function inMyList(wordId: number, status: WordStatus, importId: number | null = null) {
  return first(
    await db
      .insert(userWords)
      .values({ userId: SINGLE_USER_ID, wordId, status, importId })
      .returning({ id: userWords.id }),
  ).id;
}

describe("POST /api/words: one typed word (§6.7, §9.3)", () => {
  it("a new word from an entry gets that entry's plural and pronunciation: die Bank bank → Banken", async () => {
    const s = setup();
    const [bench, bank] = (await s.lookup("Bank")).entries as [EntryView, EntryView];
    expect([bench.plural, bank.plural]).toEqual(["Bänke", "Banken"]);

    const res = await s.addWords({ words: [fromEntry(bank, "bank")] });
    expect(res.statusCode).toBe(200);
    const body = AddWordsResponse.parse(res.json());
    const row = await saved("Bank");
    expect(body).toEqual({
      added: [{ userWordId: row?.userWordId, lemma: "Bank", article: "die" }],
      alreadyInList: 0,
      detailsPending: 0,
    });
    expect(row).toMatchObject({
      plural: "Banken",
      formsSource: "dictionary",
      checkStatus: "match",
      translation: "bank",
      status: "learning",
      importId: null,
      customTranslation: null,
      // Enrichment ran and wrote the example, but left the entry's facts alone.
      exampleDe: "Das ist ein Beispiel mit Bank.",
      enriched: expect.any(Date),
    });
    expect(enrichInputOf(first(s.aiRequests))).toMatchObject([
      { lemma: "Bank", needsForms: false },
    ]);
  });

  it("a verb from an entry gets its forms; an entry without forms leaves them to enrichment", async () => {
    const s = setup();
    const gehen = first((await s.lookup("gehen")).entries);
    // Wiktionary lists fahren with haben and sein, so its entry has no forms.
    const fahren = first((await s.lookup("fahren")).entries);
    await s.addWords({ words: [fromEntry(gehen, "to go"), fromEntry(fahren, "to drive")] });

    expect(await saved("gehen")).toMatchObject({
      forms: { praeteritum: "ging", partizip2: "gegangen", auxiliary: "sein" },
      formsSource: "dictionary",
      checkStatus: "match",
    });
    expect(await saved("fahren")).toMatchObject({ formsSource: "ai", checkStatus: "match" });
    const sent = enrichInputOf(first(s.aiRequests));
    expect(Object.fromEntries(sent.map((w) => [w.lemma, w.needsForms]))).toEqual({
      gehen: false,
      fahren: true,
    });
  });

  it("the entry's pronunciation comes with it", async () => {
    const s = setup();
    const tisch = first((await s.lookup("Tisch")).entries);
    await s.addWords({ words: [fromEntry(tisch, "table")] });
    expect(await saved("Tisch")).toMatchObject({ ipa: "/tɪʃ/", audioFile: "De-Tisch2.ogg" });
  });

  it("a word entered by hand is checked against the dictionary like a candidate", async () => {
    const s = setup();
    const res = await s.addWords({
      words: [
        byHand("Kühlschrank", "noun", "der", "fridge"), // not in the sample
        byHand("Zeitung", "noun", "der", "newspaper"), // the dictionary says die
        byHand("Tisch", "noun", "der", "table"),
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(await saved("Kühlschrank")).toMatchObject({ checkStatus: "not_in_dictionary" });
    expect(await saved("Zeitung")).toMatchObject({ checkStatus: "mismatch_kept" });
    // Its plural comes from enrichment's dictionary step.
    expect(await saved("Tisch")).toMatchObject({
      checkStatus: "match",
      plural: "Tische",
      formsSource: "dictionary",
    });
  });

  it("a stale entryId counts as entered by hand", async () => {
    const s = setup();
    const tisch = first((await s.lookup("Tisch")).entries);
    await s.addWords({
      words: [
        // The entry is Tisch's, not Zeitung's.
        { ...byHand("Zeitung", "noun", "die", "newspaper"), entryId: tisch.entryId },
        // der Tisch's entry has no die.
        { ...byHand("Tisch", "noun", "die", "table"), entryId: tisch.entryId },
        { ...byHand("Obst", "noun", "das", "fruit"), entryId: 999_999 },
      ],
    });
    // Nothing from Tisch's entry: the plural comes from enrichment's dictionary step.
    expect(await saved("Zeitung")).toMatchObject({ checkStatus: "match", plural: "Zeitungen" });
    expect(await saved("Tisch", "die")).toMatchObject({ checkStatus: "mismatch_kept", ipa: null });
    expect(await saved("Obst")).toMatchObject({ checkStatus: "match" });
  });

  it("a reused word gets the translation as the learner's own only when it differs", async () => {
    const tisch = await sharedWord("Tisch", "noun", "der", "table");
    const s = setup();
    const res = await s.addWords({ words: [byHand("Tisch", "noun", "der", "desk")] });
    expect(AddWordsResponse.parse(res.json()).added).toHaveLength(1);
    // The shared row is reused unchanged: its translation, plural and example stay.
    expect(await saved("Tisch")).toMatchObject({
      wordId: tisch,
      translation: "table",
      customTranslation: "desk",
      plural: "Tische",
    });
    // Already enriched: no AI call.
    expect(s.aiRequests).toHaveLength(0);

    await db.delete(userWords);
    await s.addWords({ words: [byHand("Tisch", "noun", "der", "table")] });
    expect(await saved("Tisch")).toMatchObject({ translation: "table", customTranslation: null });
  });

  it("a word already in the list, in any status, is left alone", async () => {
    const tisch = await sharedWord("Tisch", "noun", "der", "table");
    const kept = await inMyList(tisch, "ignored");
    const s = setup();

    const res = await s.addWords({ words: [byHand("Tisch", "noun", "der", "desk")] });
    expect(AddWordsResponse.parse(res.json())).toEqual({
      added: [],
      alreadyInList: 1,
      detailsPending: 0,
    });
    expect(await saved("Tisch")).toMatchObject({
      userWordId: kept,
      status: "ignored",
      customTranslation: null,
    });
  });

  it("two words with the same identity count once, the first", async () => {
    const s = setup();
    const res = await s.addWords({
      words: [
        byHand("Tisch", "noun", "der", "table"),
        byHand(" Tisch ", "noun", "der", "desk"),
        // An article on a word that isn't a noun is dropped, so this is gehen twice.
        byHand("gehen", "verb", null, "to go"),
        byHand("gehen", "verb", "der", "to walk"),
      ],
    });
    expect(AddWordsResponse.parse(res.json()).added.map((w) => [w.lemma, w.article])).toEqual([
      ["Tisch", "der"],
      ["gehen", null],
    ]);
    expect(await saved("Tisch")).toMatchObject({ translation: "table" });
    expect(await saved("gehen")).toMatchObject({ translation: "to go" });
  });

  it("takes 1 to 5 words, each with a translation of 1 to 200 characters", async () => {
    const s = setup();
    const word = byHand("Tisch", "noun", "der", "table");
    for (const body of [
      { words: [] },
      { words: Array(6).fill(word) },
      { words: [{ ...word, translation: "  " }] },
      { words: [{ ...word, translation: "x".repeat(201) }] },
      { words: [{ ...word, lemma: "" }] },
    ]) {
      const res = await s.addWords(body);
      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe("invalid_request");
    }
    expect(await db.select().from(userWords)).toEqual([]);
  });

  it("enrichment failing leaves the words saved, with details pending", async () => {
    const s = setup(() => apiError(529));
    const res = await s.addWords({ words: [byHand("Kühlschrank", "noun", "der", "fridge")] });
    expect(AddWordsResponse.parse(res.json())).toMatchObject({ detailsPending: 1 });
    expect(await saved("Kühlschrank")).toMatchObject({ status: "learning", enriched: null });
  });
});

describe("POST /api/imports/typed: a typed list (§6.7, §9.3)", () => {
  it("saves one done import with source typed, listed among the past imports and practisable", async () => {
    const s = setup();
    const see = await s.lookup("See");
    const [lake, sea] = see.entries as [EntryView, EntryView];
    const res = await s.saveList({
      words: [
        fromEntry(lake, "lake"),
        fromEntry(sea, "sea"),
        byHand("Kühlschrank", "noun", "der", "fridge"),
      ],
    });
    expect(res.statusCode).toBe(200);
    const body = TypedImportResponse.parse(res.json());
    expect(body.added.map((w) => `${w.article} ${w.lemma}`)).toEqual([
      "der See",
      "die See",
      "der Kühlschrank",
    ]);
    expect(body).toMatchObject({ alreadyInList: 0, detailsPending: 0 });

    const importId = body.importId as number;
    const [row] = await db.select().from(imports).where(eq(imports.id, importId));
    expect(row).toMatchObject({
      userId: SINGLE_USER_ID,
      status: "done",
      source: "typed",
      photoCount: 0,
      name: null,
      candidates: [],
      completedAt: expect.any(Date),
    });
    const mine = await db
      .select({ importId: userWords.importId })
      .from(userWords)
      .orderBy(asc(userWords.id));
    expect(mine).toEqual([{ importId }, { importId }, { importId }]);

    const past = ImportListResponse.parse(
      (await s.app.inject({ method: "GET", url: "/api/imports" })).json(),
    ).imports;
    expect(past).toMatchObject([{ id: importId, source: "typed", wordCount: 3 }]);

    const session = await s.app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { source: "import", importId },
    });
    expect(session.statusCode).toBe(200);
    expect(SessionResponse.parse(session.json()).cards).toHaveLength(3);
  });

  it("a word already in the list keeps its own import and isn't counted as added", async () => {
    const tisch = await sharedWord("Tisch", "noun", "der", "table");
    const earlier = first(
      await db
        .insert(imports)
        .values({ userId: SINGLE_USER_ID, status: "done", completedAt: new Date() })
        .returning({ id: imports.id }),
    ).id;
    await inMyList(tisch, "learning", earlier);
    const s = setup();

    const body = TypedImportResponse.parse(
      (
        await s.saveList({
          words: [byHand("Tisch", "noun", "der", "table"), byHand("Obst", "noun", "das", "fruit")],
        })
      ).json(),
    );
    expect(body).toMatchObject({ alreadyInList: 1, added: [{ lemma: "Obst" }] });
    expect(await saved("Tisch")).toMatchObject({ importId: earlier });
    expect(await saved("Obst")).toMatchObject({ importId: body.importId });
  });

  it("nothing added: no import, and importId null", async () => {
    const tisch = await sharedWord("Tisch", "noun", "der", "table");
    await inMyList(tisch, "learned");
    const s = setup();

    const body = TypedImportResponse.parse(
      (await s.saveList({ words: [byHand("Tisch", "noun", "der", "table")] })).json(),
    );
    expect(body).toEqual({ importId: null, added: [], alreadyInList: 1, detailsPending: 0 });
    expect(await db.select().from(imports)).toEqual([]);
  });

  it("enrichment runs for the list, against its import, and skips the dictionary step for words that have their facts", async () => {
    const s = setup();
    const bank = (await s.lookup("Bank")).entries[1] as EntryView; // "bank" → Banken
    const body = TypedImportResponse.parse(
      (
        await s.saveList({
          words: [fromEntry(bank, "bank"), byHand("Zeitung", "noun", "die", "newspaper")],
        })
      ).json(),
    );
    expect(body.detailsPending).toBe(0);
    expect(await saved("Bank")).toMatchObject({ plural: "Banken", exampleDe: expect.any(String) });
    // Entered by hand: the plural comes from enrichment's dictionary step.
    expect(await saved("Zeitung")).toMatchObject({
      plural: "Zeitungen",
      formsSource: "dictionary",
    });
    expect(await db.select().from(aiUsage)).toMatchObject([
      { callType: "enrich", importId: body.importId, ok: true },
    ]);
  });

  it("another learner's words don't count as in the list", async () => {
    const other = first(
      await db
        .insert(users)
        .values({ name: "Other", learnerLanguage: "en", targetLanguage: "de" })
        .returning({ id: users.id }),
    ).id;
    const tisch = await sharedWord("Tisch", "noun", "der", "table");
    await db.insert(userWords).values({ userId: other, wordId: tisch, status: "learning" });

    const body = TypedImportResponse.parse(
      (await setup().saveList({ words: [byHand("Tisch", "noun", "der", "table")] })).json(),
    );
    expect(body).toMatchObject({ alreadyInList: 0, added: [{ lemma: "Tisch" }] });
  });

  it("takes 1 to 150 words: 30 texts with up to 5 entries chosen for each", async () => {
    const s = setup();
    const word = byHand("Tisch", "noun", "der", "table");
    expect((await s.saveList({ words: [] })).statusCode).toBe(400);
    expect((await s.saveList({ words: Array(151).fill(word) })).statusCode).toBe(400);
    expect(await db.select().from(imports)).toEqual([]);

    const res = await s.saveList({ words: Array(150).fill(word) });
    expect(res.statusCode).toBe(200);
    // The same word 150 times counts once.
    expect(TypedImportResponse.parse(res.json()).added).toHaveLength(1);
  });
});
