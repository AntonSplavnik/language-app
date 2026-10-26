import { asc, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createClaudeAi } from "../../src/ai/claude";
import type { MessageTransport } from "../../src/ai/transport";
import { AiError } from "../../src/ai/types";
import { dbUsageSink } from "../../src/ai/usage";
import { aiUsage, imports, words } from "../../src/db/schema";
import { loadDictionary } from "../../src/dictionary/load";
import { answeringTransport, loadAiErrorFixture } from "../helpers/ai";
import { buildTestApp, multipartFile } from "../helpers/app";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";

// The used-up Anthropic credit (docs/design.md §11.1, §12): both answers the API gives for it
// become 503 ai_unavailable, are tried only once, and are recorded in ai_usage like any failure.
// The answers go through the real SDK (its own retry policy included) to a fake fetch.

const db = useTestDb();
const SAMPLE = new URL("../fixtures/kaikki-sample.jsonl", import.meta.url).pathname;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
const ctx = { userId: LEARNER_ID, importId: null, learnerLanguage: "en" };

beforeEach(async () => {
  await loadDictionary(db, SAMPLE);
});

const FORMS = [
  ["400 invalid_request_error, credit balance too low", "error-credit-balance-too-low"],
  ["402 billing_error", "error-billing"],
] as const;

const aiWith = (transport: MessageTransport) =>
  createClaudeAi({
    transport,
    recordUsage: dbUsageSink(db),
    models: {
      extract: "claude-haiku-5-5",
      enrich: "claude-haiku-5-5",
      describe: "claude-haiku-5-5",
    },
    effort: "medium",
  });

const usageRows = () => db.select().from(aiUsage).orderBy(asc(aiUsage.id));
const errorOf = (res: { json: () => unknown }) =>
  (res.json() as { error: { code: string; message: string } }).error;

describe.each(FORMS)("%s", (_, fixtureName) => {
  const fixture = loadAiErrorFixture(fixtureName);

  it("the AI client fails with unavailable after one request: no retry by the SDK or by us", async () => {
    const { transport, calls } = answeringTransport(fixture);
    const error = await aiWith(transport)
      .extractWords(JPEG, ctx)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: "unavailable" });
    expect(calls()).toBe(1);
    expect(await usageRows()).toMatchObject([
      { userId: LEARNER_ID, callType: "extract", ok: false, inputTokens: null, stopReason: null },
    ]);
  });

  it("a photo answers 503 ai_unavailable (the tile offers Retry)", async () => {
    const { transport, calls } = answeringTransport(fixture);
    const app = buildTestApp(db, { ai: aiWith(transport) });
    const created = await app.inject({ method: "POST", url: "/api/imports", payload: {} });
    const res = await app.inject({
      method: "POST",
      url: `/api/imports/${created.json().id}/photos`,
      ...multipartFile("photo", JPEG),
    });

    expect(res.statusCode).toBe(503);
    expect(errorOf(res)).toEqual({
      code: "ai_unavailable",
      message: "AI is unavailable right now",
    });
    expect(calls()).toBe(1);
    // The photo isn't counted, and can be sent again.
    expect(first(await db.select().from(imports)).photoCount).toBe(0);
    expect(await usageRows()).toMatchObject([{ callType: "extract", ok: false }]);
  });

  it("Ask AI answers 503 ai_unavailable (a toast)", async () => {
    const { transport, calls } = answeringTransport(fixture);
    const res = await buildTestApp(db, { ai: aiWith(transport) }).inject({
      method: "POST",
      url: "/api/words/describe",
      payload: { text: "Regenschrim" },
    });

    expect(res.statusCode).toBe(503);
    expect(errorOf(res)).toEqual({
      code: "ai_unavailable",
      message: "AI is unavailable right now",
    });
    expect(calls()).toBe(1);
    expect(await usageRows()).toMatchObject([{ callType: "describe", ok: false }]);
  });

  it("saving still works: the words wait for their details", async () => {
    const { transport } = answeringTransport(fixture);
    const res = await buildTestApp(db, { ai: aiWith(transport) }).inject({
      method: "POST",
      url: "/api/words",
      payload: {
        words: [{ lemma: "Kühlschrank", pos: "noun", article: "der", translation: "fridge" }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ detailsPending: 1 });
    expect(await db.select().from(words).where(isNull(words.enrichedAt))).toHaveLength(1);
    expect(await usageRows()).toMatchObject([{ callType: "enrich", ok: false }]);
  });
});

describe("other API errors", () => {
  it("a 400 for another reason still surfaces as a bug, once", async () => {
    const { transport, calls } = answeringTransport({
      meta: { kind: "error", source: "test" },
      status: 400,
      headers: { "content-type": "application/json" },
      body: {
        type: "error",
        error: { type: "invalid_request_error", message: "max_tokens: Field required" },
      },
    });
    const error = await aiWith(transport)
      .describeWord({ text: "Tisch" }, ctx)
      .catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(AiError);
    expect(calls()).toBe(1);
    expect(await db.select().from(aiUsage).where(eq(aiUsage.ok, false))).toHaveLength(1);
  });
});
