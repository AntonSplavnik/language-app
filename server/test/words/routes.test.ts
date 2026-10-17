import {
  EnrichPendingResponse,
  type ExtractedWord,
  ImportView,
  PhotoUploadResponse,
  SaveResponse,
  StatsResponse,
} from "@language-app/core";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createClaudeAi } from "../../src/ai/claude";
import type { MessageRequest } from "../../src/ai/transport";
import { dbUsageSink } from "../../src/ai/usage";
import { userWords, words, wordTranslations } from "../../src/db/schema";
import { loadDictionary } from "../../src/dictionary/load";
import { SINGLE_USER_ID } from "../../src/user";
import {
  apiError,
  enrichInputOf,
  fakeEnrichResponse,
  isExtractRequest,
  loadAiFixture,
  respondingTransport,
  withText,
} from "../helpers/ai";
import { buildTestApp, multipartFile } from "../helpers/app";
import { first, useTestDb } from "../helpers/db";

const db = useTestDb();
const SAMPLE = new URL("../fixtures/kaikki-sample.jsonl", import.meta.url).pathname;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

beforeEach(async () => {
  await loadDictionary(db, SAMPLE);
});

const PAGE: ExtractedWord[] = [
  { lemma: "Tisch", pos: "noun", article: "der", translation: "table" },
  { lemma: "gehen", pos: "verb", article: null, translation: "to go" },
  { lemma: "und", pos: "conjunction", article: null, translation: "and" },
];

function setup({ enrichFails = false } = {}) {
  const extract = withText(
    loadAiFixture("extract-vocab-p13").response,
    JSON.stringify({ pageQuality: "ok", words: PAGE }),
  );
  let failEnrich = enrichFails;
  const replay = respondingTransport((request: MessageRequest) => {
    if (isExtractRequest(request)) return extract;
    return failEnrich ? apiError(529) : fakeEnrichResponse(request);
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
    learnerLanguage: "en",
  });
  const app = buildTestApp(db, { ai });
  return {
    app,
    requests: replay.requests,
    enrichWorks: () => {
      failEnrich = false;
    },
    async importAndSave() {
      const created = ImportView.parse(
        (await app.inject({ method: "POST", url: "/api/imports", payload: {} })).json(),
      );
      const upload = await app.inject({
        method: "POST",
        url: `/api/imports/${created.id}/photos`,
        ...multipartFile("photo", JPEG),
      });
      PhotoUploadResponse.parse(upload.json());
      const res = await app.inject({
        method: "POST",
        url: `/api/imports/${created.id}/save`,
        payload: {
          decisions: [
            { key: "Tisch|noun|der", action: "add" },
            { key: "gehen|verb|", action: "add" },
            { key: "und|conjunction|", action: "skip" },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      return SaveResponse.parse(res.json());
    },
    stats: async () =>
      StatsResponse.parse((await app.inject({ method: "GET", url: "/api/stats" })).json()),
    enrichPending: async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/words/enrich-pending",
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      return EnrichPendingResponse.parse(res.json());
    },
  };
}

const exampleOf = async (lemma: string) =>
  (await db.select({ exampleDe: words.exampleDe }).from(words).where(eq(words.lemma, lemma)))[0]
    ?.exampleDe;

describe("save, then enrich (§6.5–6.6)", () => {
  it("saving adds the details of the added words before answering", async () => {
    const s = setup();
    expect(await s.importAndSave()).toEqual({ added: 2, skipped: 1, detailsPending: 0 });

    // Skipped words are not enriched: they never become cards.
    const sent = s.requests.filter((r) => !isExtractRequest(r)).flatMap(enrichInputOf);
    expect(sent.map((w) => w.lemma).sort()).toEqual(["Tisch", "gehen"]);
    expect(await exampleOf("Tisch")).toBe("Das ist ein Beispiel mit Tisch.");
  });

  it("when enrichment fails, the words are still saved and reported as pending", async () => {
    const s = setup({ enrichFails: true });
    expect(await s.importAndSave()).toEqual({ added: 2, skipped: 1, detailsPending: 2 });
    expect(await db.select().from(userWords)).toHaveLength(3);
    expect((await s.stats()).detailsPending).toBe(2);
  });
});

describe("POST /api/words/enrich-pending", () => {
  it("adds the missing details later, and Home's counter goes back to zero", async () => {
    const s = setup({ enrichFails: true });
    await s.importAndSave();

    s.enrichWorks();
    expect(await s.enrichPending()).toEqual({ enriched: 2, pending: 0 });
    expect(await exampleOf("gehen")).toBe("Das ist ein Beispiel mit gehen.");
    expect((await s.stats()).detailsPending).toBe(0);
  });

  it("covers the learner's learning and learned words, not ignored ones", async () => {
    const s = setup();
    const add = async (lemma: string, status: "learning" | "learned" | "ignored") => {
      const w = first(
        await db
          .insert(words)
          .values({ language: "de", lemma, pos: "noun", article: "das", checkStatus: "match" })
          .returning({ id: words.id }),
      );
      await db
        .insert(wordTranslations)
        .values({ wordId: w.id, language: "en", translation: lemma });
      await db.insert(userWords).values({ userId: SINGLE_USER_ID, wordId: w.id, status });
    };
    await add("Eins", "learning");
    await add("Zwei", "learned");
    await add("Drei", "ignored");

    expect((await s.stats()).detailsPending).toBe(2);
    expect(await s.enrichPending()).toEqual({ enriched: 2, pending: 0 });
    expect(
      s.requests
        .flatMap(enrichInputOf)
        .map((w) => w.lemma)
        .sort(),
    ).toEqual(["Eins", "Zwei"]);
    expect(await exampleOf("Drei")).toBeNull();
  });

  it("with nothing pending, makes no AI call", async () => {
    const s = setup();
    expect(await s.enrichPending()).toEqual({ enriched: 0, pending: 0 });
    expect(s.requests).toHaveLength(0);
  });
});
