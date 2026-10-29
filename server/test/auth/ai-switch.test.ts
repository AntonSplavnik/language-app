import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import {
  AddWordsResponse,
  AuthSession,
  type EntryView,
  ImportView,
  LookupResponse,
  SaveResponse,
  StatsResponse,
  TypedImportResponse,
  WordDetail,
} from "@language-app/core";
import { and, eq } from "drizzle-orm";
import type { HTTPMethods } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { createClaudeAi } from "../../src/ai/claude";
import type { MessageRequest } from "../../src/ai/transport";
import { dbUsageSink } from "../../src/ai/usage";
import { addInvite } from "../../src/auth/invites";
import { aiUsage, imports, users, userWords, words, wordTranslations } from "../../src/db/schema";
import { loadDictionary } from "../../src/dictionary/load";
import {
  fakeEnrichResponse,
  isExtractRequest,
  loadAiFixture,
  respondingTransport,
} from "../helpers/ai";
import { buildTestApp, multipartFile, unusedAi } from "../helpers/app";
import { getWith, signUp } from "../helpers/auth";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";

// The AI switch (docs/design.md §4 Accounts, §6.7, §9): an account without AI gets 403
// ai_not_enabled from the AI routes, and its typed words are saved without an AI call.

const db = useTestDb();
const SAMPLE = new URL("../fixtures/kaikki-sample.jsonl", import.meta.url).pathname;
const THEMES = new URL("../fixtures/dictionary-themes-sample.tsv", import.meta.url).pathname;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

beforeEach(async () => {
  await loadDictionary(db, SAMPLE);
});

/** An account as sign-up makes it: AI off. */
async function learnerWithoutAi() {
  return first(
    await db
      .insert(users)
      .values({ name: "Test", learnerLanguage: "en", targetLanguage: "de" })
      .returning({ id: users.id }),
  ).id;
}

/** A collecting import of this learner, made directly (POST /imports is an AI route). */
async function collectingImport(userId: number) {
  return first(await db.insert(imports).values({ userId }).returning({ id: imports.id })).id;
}

/** Recorded answers for each kind of call, so the routes with AI reach the AI and come back. */
function recordedAi() {
  const page = loadAiFixture("extract-vocab-p13").response;
  const describeAnswer = loadAiFixture("describe-misspelt-noun").response;
  const replay = respondingTransport((request: MessageRequest): BetaMessage => {
    if (isExtractRequest(request)) return page;
    if (String(request.system).includes("flashcard material")) return fakeEnrichResponse(request);
    return describeAnswer;
  });
  const ai = createClaudeAi({
    transport: replay.transport,
    recordUsage: dbUsageSink(db),
    models: {
      extract: "claude-haiku-5-5",
      enrich: "claude-haiku-5-5",
      describe: "claude-haiku-5-5",
    },
    effort: "medium",
  });
  return { ai, requests: replay.requests };
}

type AiRoute = {
  name: string;
  method: HTTPMethods;
  url: (importId: number) => string;
  payload?: object;
  photo?: boolean;
};

const AI_ROUTES: AiRoute[] = [
  { name: "a photo import", method: "POST", url: () => "/api/imports", payload: {} },
  {
    name: "a photo import, named",
    method: "POST",
    url: () => "/api/imports",
    payload: { source: "photos", name: "Lesson 4" },
  },
  {
    name: "a PDF import",
    method: "POST",
    url: () => "/api/imports",
    payload: { source: "pdf", name: "Pages 42–45" },
  },
  { name: "a photo", method: "POST", url: (id) => `/api/imports/${id}/photos`, photo: true },
  {
    name: "Ask AI",
    method: "POST",
    url: () => "/api/words/describe",
    payload: { text: "Regenschrim" },
  },
  { name: "Add details", method: "POST", url: () => "/api/words/enrich-pending", payload: {} },
];

const send = (app: ReturnType<typeof buildTestApp>, route: AiRoute, importId: number) =>
  app.inject({
    method: route.method,
    url: route.url(importId),
    ...(route.photo ? multipartFile("photo", JPEG) : { payload: route.payload }),
  });

const errorOf = (res: { json: () => unknown }) =>
  (res.json() as { error: { code: string; message: string } }).error;

describe("the AI routes without AI", () => {
  it.each(AI_ROUTES.map((route) => [route.name, route]))(
    "%s: 403 ai_not_enabled, without asking the AI",
    async (_, route) => {
      const learner = await learnerWithoutAi();
      const importId = await collectingImport(learner);
      // unusedAi fails the test if anything reaches the AI.
      const res = await send(buildTestApp(db, { ai: unusedAi, learner }), route, importId);

      expect(res.statusCode).toBe(403);
      expect(errorOf(res)).toEqual({
        code: "ai_not_enabled",
        message: "AI isn't included in your account",
      });
      expect(await db.select().from(aiUsage)).toEqual([]);
    },
  );

  it("nothing is created: no import, no photo counted", async () => {
    const learner = await learnerWithoutAi();
    const importId = await collectingImport(learner);
    const app = buildTestApp(db, { learner });
    for (const route of AI_ROUTES) await send(app, route, importId);

    const rows = await db.select().from(imports).where(eq(imports.userId, learner));
    expect(rows).toMatchObject([{ id: importId, photoCount: 0, candidates: [] }]);
  });
});

describe("the AI routes with AI", () => {
  it.each(AI_ROUTES.map((route) => [route.name, route]))("%s works as before", async (_, route) => {
    const { ai, requests } = recordedAi();
    const importId = await collectingImport(LEARNER_ID);
    const res = await send(buildTestApp(db, { ai }), route, importId);

    expect(res.statusCode).toBeLessThan(300);
    // The import routes create, the others ask the AI (Add details has nothing to enrich).
    if (route.name === "a photo" || route.name === "Ask AI") expect(requests).toHaveLength(1);
  });
});

describe("switching AI on and off (user:ai)", () => {
  it("takes effect on the next request, without signing in again", async () => {
    await addInvite(db, "test@example.com");
    const app = buildTestApp(db, { ai: recordedAi().ai, learner: null });
    const cookie = await signUp(app, { email: "test@example.com", username: "test" });
    const account = first(await db.select().from(users).where(eq(users.email, "test@example.com")));
    const ask = () =>
      app.inject({
        method: "POST",
        url: "/api/words/describe",
        payload: { text: "Regenschrim" },
        headers: { cookie },
      });
    const session = async () =>
      AuthSession.parse((await getWith(app, "/api/auth/get-session", cookie)).json());

    expect((await ask()).statusCode).toBe(403);
    expect((await session())?.user.aiEnabled).toBe(false);

    await db.update(users).set({ aiEnabled: true }).where(eq(users.id, account.id));
    expect((await ask()).statusCode).toBe(200);
    expect((await session())?.user.aiEnabled).toBe(true);

    await db.update(users).set({ aiEnabled: false }).where(eq(users.id, account.id));
    expect((await ask()).statusCode).toBe(403);
    expect((await session())?.user.aiEnabled).toBe(false);
  });
});

describe("typed words without AI (§6.7)", () => {
  async function setup() {
    const learner = await learnerWithoutAi();
    const app = buildTestApp(db, { ai: unusedAi, learner });
    const lookup = async (q: string) =>
      LookupResponse.parse(
        (await app.inject({ method: "GET", url: `/api/dictionary/lookup?q=${q}` })).json(),
      );
    return {
      learner,
      app,
      lookup,
      addWords: (body: object) => app.inject({ method: "POST", url: "/api/words", payload: body }),
      saveList: (body: object) =>
        app.inject({ method: "POST", url: "/api/imports/typed", payload: body }),
    };
  }

  const fromEntry = (view: EntryView, translation: string) => ({
    lemma: view.lemma,
    pos: view.pos,
    article: view.article,
    translation,
    entryId: view.entryId,
  });

  /** The shared word as stored, and whether the learner has it. */
  async function stored(learner: number, lemma: string) {
    const [row] = await db
      .select({
        plural: words.plural,
        forms: words.forms,
        formsSource: words.formsSource,
        ipa: words.ipa,
        exampleDe: words.exampleDe,
        enrichedAt: words.enrichedAt,
        userWordId: userWords.id,
      })
      .from(words)
      .leftJoin(userWords, and(eq(userWords.wordId, words.id), eq(userWords.userId, learner)))
      .where(eq(words.lemma, lemma));
    return row;
  }

  it("one word is saved with no AI call, keeping the dictionary entry's facts", async () => {
    const s = await setup();
    const tisch = first((await s.lookup("Tisch")).entries);
    const res = await s.addWords({ words: [fromEntry(tisch, "table")] });

    expect(res.statusCode).toBe(200);
    expect(AddWordsResponse.parse(res.json())).toMatchObject({
      added: [{ lemma: "Tisch", article: "der" }],
      alreadyInList: 0,
      detailsPending: 0,
    });
    expect(await stored(s.learner, "Tisch")).toMatchObject({
      plural: "Tische",
      formsSource: "dictionary",
      ipa: expect.any(String),
      exampleDe: null,
      // Not enriched: an account with AI that adds it later gets the example sentence.
      enrichedAt: null,
      userWordId: expect.any(Number),
    });
    expect(await db.select().from(aiUsage)).toEqual([]);
  });

  it("a word entered by hand gets the dictionary's forms, as enrichment's first step does", async () => {
    const s = await setup();
    const res = await s.addWords({
      words: [{ lemma: "gehen", pos: "verb", article: null, translation: "to go" }],
    });

    expect(AddWordsResponse.parse(res.json()).detailsPending).toBe(0);
    expect(await stored(s.learner, "gehen")).toMatchObject({
      forms: { praeteritum: "ging", partizip2: "gegangen", auxiliary: "sein" },
      formsSource: "dictionary",
      enrichedAt: null,
    });
    expect(await db.select().from(aiUsage)).toEqual([]);
  });

  it("words get the dictionary's themes without AI; one the dictionary hasn't stays without (§6.6)", async () => {
    await loadDictionary(db, SAMPLE, { themes: THEMES });
    const s = await setup();
    await s.saveList({
      words: [
        { lemma: "Tisch", pos: "noun", article: "der", translation: "table" },
        { lemma: "Kühlschrank", pos: "noun", article: "der", translation: "fridge" },
      ],
    });

    const themesOf = async (lemma: string) =>
      (await db.select({ themes: words.themes }).from(words).where(eq(words.lemma, lemma)))[0]
        ?.themes;
    expect(await themesOf("Tisch")).toEqual(["home", "food"]);
    // The known gap (§6.6): no AI, so no themes until an account with AI adds it.
    expect(await themesOf("Kühlschrank")).toBeNull();
    expect(await db.select().from(aiUsage)).toEqual([]);
  });

  it("a list is saved as an import with no AI call; detailsPending is 0", async () => {
    const s = await setup();
    const res = await s.saveList({
      words: [
        { lemma: "Tisch", pos: "noun", article: "der", translation: "table" },
        { lemma: "Kühlschrank", pos: "noun", article: "der", translation: "fridge" },
      ],
    });

    expect(res.statusCode).toBe(200);
    expect(TypedImportResponse.parse(res.json())).toMatchObject({
      importId: expect.any(Number),
      alreadyInList: 0,
      detailsPending: 0,
    });
    expect(await db.select().from(aiUsage)).toEqual([]);
  });

  it("a shared word that already has an example sentence shows it", async () => {
    const s = await setup();
    const shared = first(
      await db
        .insert(words)
        .values({
          language: "de",
          lemma: "Tisch",
          pos: "noun",
          article: "der",
          checkStatus: "match",
          plural: "Tische",
          formsSource: "dictionary",
          exampleDe: "Der Tisch ist groß.",
          enrichedAt: new Date(),
        })
        .returning({ id: words.id }),
    );
    await db.insert(wordTranslations).values({
      wordId: shared.id,
      language: "en",
      translation: "table",
      exampleTranslation: "The table is big.",
    });
    const tisch = first((await s.lookup("Tisch")).entries);
    const added = AddWordsResponse.parse(
      (await s.addWords({ words: [fromEntry(tisch, "table")] })).json(),
    );

    const detail = WordDetail.parse(
      (
        await s.app.inject({ method: "GET", url: `/api/words/${first(added.added).userWordId}` })
      ).json(),
    );
    expect(detail).toMatchObject({
      exampleDe: "Der Tisch ist groß.",
      exampleTranslation: "The table is big.",
      enriched: true,
    });
  });

  it("Home counts no words without details: nothing to add them with", async () => {
    const s = await setup();
    await s.addWords({
      words: [{ lemma: "Kühlschrank", pos: "noun", article: "der", translation: "fridge" }],
    });
    const stats = StatsResponse.parse(
      (await s.app.inject({ method: "GET", url: "/api/stats" })).json(),
    );
    expect(stats).toMatchObject({ learning: 1, detailsPending: 0 });
  });

  it("an import started with AI is still saved after AI goes off, without enrichment", async () => {
    const learner = await learnerWithoutAi();
    const importId = first(
      await db
        .insert(imports)
        .values({
          userId: learner,
          status: "reviewing",
          photoCount: 1,
          candidates: [
            {
              key: "Kühlschrank|noun|der",
              lemma: "Kühlschrank",
              pos: "noun",
              article: "der",
              translation: "fridge",
              photoIndex: 0,
              existing: "none",
              dictionary: { status: "not_found" },
            },
          ],
        })
        .returning({ id: imports.id }),
    ).id;
    const app = buildTestApp(db, { ai: unusedAi, learner });
    const res = await app.inject({
      method: "POST",
      url: `/api/imports/${importId}/save`,
      payload: { decisions: [{ key: "Kühlschrank|noun|der", action: "add" }] },
    });

    expect(res.statusCode).toBe(200);
    expect(SaveResponse.parse(res.json())).toEqual({ added: 1, skipped: 0, detailsPending: 0 });
    expect(await db.select().from(aiUsage)).toEqual([]);
  });

  it("the same words with AI are enriched as before", async () => {
    const { ai, requests } = recordedAi();
    const app = buildTestApp(db, { ai });
    const res = await app.inject({
      method: "POST",
      url: "/api/words",
      payload: {
        words: [{ lemma: "Kühlschrank", pos: "noun", article: "der", translation: "fridge" }],
      },
    });
    expect(AddWordsResponse.parse(res.json()).detailsPending).toBe(0);
    expect(requests).toHaveLength(1);
    expect(await stored(LEARNER_ID, "Kühlschrank")).toMatchObject({
      exampleDe: expect.stringContaining("Kühlschrank"),
      enrichedAt: expect.any(Date),
    });
  });
});

describe("the import view of a photo import still loads without AI", () => {
  it("GET /api/imports/:id is not an AI route", async () => {
    const learner = await learnerWithoutAi();
    const importId = await collectingImport(learner);
    const res = await buildTestApp(db, { learner }).inject({
      method: "GET",
      url: `/api/imports/${importId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(ImportView.parse(res.json()).id).toBe(importId);
  });
});
