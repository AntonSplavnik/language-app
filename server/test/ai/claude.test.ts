import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { asc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createClaudeAi, FALLBACK_BETA, MAX_TOKENS } from "../../src/ai/claude";
import { AiError } from "../../src/ai/types";
import { dbUsageSink } from "../../src/ai/usage";
import { aiUsage, imports } from "../../src/db/schema";
import { SINGLE_USER_ID } from "../../src/user";
import {
  apiError,
  asFallback,
  connectionError,
  loadAiFixture,
  replayTransport,
  withStopReason,
  withText,
} from "../helpers/ai";
import { first, useTestDb } from "../helpers/db";

const db = useTestDb();

const page = loadAiFixture("extract-vocab-p13").response;
const poorPage = loadAiFixture("extract-poor").response;
const enrichFixture = loadAiFixture("enrich-batch");

const MODEL = "claude-opus-5-5";
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
const ctx = { userId: SINGLE_USER_ID, importId: null };

function setup(...steps: Array<BetaMessage | Error>) {
  return setupWithModel(MODEL, ...steps);
}

function setupWithModel(model: string, ...steps: Array<BetaMessage | Error>) {
  const replay = replayTransport(...steps);
  const ai = createClaudeAi({
    transport: replay.transport,
    recordUsage: dbUsageSink(db),
    models: { extract: model, enrich: model },
    effort: "low",
    learnerLanguage: "en",
  });
  return { ai, requests: replay.requests };
}

const usageRows = () => db.select().from(aiUsage).orderBy(asc(aiUsage.id));

/** Runs a call that should fail and returns the error. */
const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("expected the call to fail");
    },
    (error: unknown) => error,
  );

describe("extractWords (§11.2)", () => {
  it("returns the words from a recorded page", async () => {
    const { ai } = setup(page);
    const result = await ai.extractWords(jpeg, ctx);

    expect(result.pageQuality).toBe("ok");
    expect(result.words.length).toBeGreaterThan(40);
    expect(result.words).toContainEqual({
      lemma: "Anzeige",
      pos: "noun",
      article: "die",
      translation: expect.any(String),
    });
  });

  it("sends the request the spec asks for (§11.1)", async () => {
    const { ai, requests } = setup(page);
    await ai.extractWords(jpeg, ctx);

    const request = first(requests);
    expect(request).toMatchObject({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema" } },
    });
    // Opus 5.5 rejects any explicit thinking configuration other than adaptive.
    expect(request).not.toHaveProperty("thinking");
    expect(request.system).toContain('"lemma" is always the word alone');
    expect(request.messages[0]?.content).toContainEqual({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: Buffer.from(jpeg).toString("base64"),
      },
    });
  });

  it("Haiku 5.5 has no server-side fallback, so the request leaves it out", async () => {
    const { ai, requests } = setupWithModel("claude-haiku-5-5", page);
    await ai.extractWords(jpeg, ctx);

    const request = first(requests);
    expect(request).toMatchObject({ model: "claude-haiku-5-5", output_config: { effort: "low" } });
    expect(request).not.toHaveProperty("fallbacks");
    expect(request).not.toHaveProperty("betas");
  });

  it("records one ai_usage row with the model that answered, tokens and duration", async () => {
    const lesson = first(
      await db.insert(imports).values({ userId: SINGLE_USER_ID }).returning({ id: imports.id }),
    );
    const { ai } = setup(page);
    await ai.extractWords(jpeg, { userId: SINGLE_USER_ID, importId: lesson.id });

    const [row, ...rest] = await usageRows();
    expect(rest).toHaveLength(0);
    expect(row).toMatchObject({
      userId: SINGLE_USER_ID,
      importId: lesson.id,
      callType: "extract",
      model: page.model,
      inputTokens: page.usage.input_tokens,
      outputTokens: page.usage.output_tokens,
      stopReason: "end_turn",
      ok: true,
    });
    expect(row?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns a poor page as poor, with whatever words it could read", async () => {
    const { ai } = setup(poorPage);
    expect(await ai.extractWords(jpeg, ctx)).toEqual({ pageQuality: "poor", words: [] });
  });

  it("refusal: fails with refused and records the failed attempt", async () => {
    const refusal = withStopReason(page, "refusal", {
      content: [],
      stop_details: {
        type: "refusal",
        category: "cyber",
        explanation: null,
        fallback_credit_token: null,
        fallback_has_prefill_claim: null,
        recommended_model: null,
      },
    });
    const { ai } = setup(refusal);

    const error = await failureOf(ai.extractWords(jpeg, ctx));
    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: "refused" });
    expect(await usageRows()).toMatchObject([{ ok: false, stopReason: "refusal" }]);
  });

  it("max_tokens: fails with too_long (page too long for one photo)", async () => {
    const { ai } = setup(withStopReason(page, "max_tokens"));
    expect(await failureOf(ai.extractWords(jpeg, ctx))).toMatchObject({ code: "too_long" });
  });

  it("invalid output once: retries and succeeds, recording both attempts", async () => {
    const { ai, requests } = setup(withText(page, '{"pageQuality": "ok", "words": ['), page);

    const result = await ai.extractWords(jpeg, ctx);
    expect(result.pageQuality).toBe("ok");
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(await usageRows()).toMatchObject([{ ok: false }, { ok: true }]);
  });

  it("invalid output twice: fails with invalid_output after one retry", async () => {
    const wrongShape = withText(page, JSON.stringify({ pageQuality: "great", words: [] }));
    const { ai, requests } = setup(wrongShape, wrongShape);

    expect(await failureOf(ai.extractWords(jpeg, ctx))).toMatchObject({ code: "invalid_output" });
    expect(requests).toHaveLength(2);
    expect(await usageRows()).toMatchObject([{ ok: false }, { ok: false }]);
  });

  it.each([
    ["rate limited (429)", () => apiError(429)],
    ["overloaded (529)", () => apiError(529)],
    ["server error (500)", () => apiError(500)],
    ["unreachable", () => connectionError()],
  ])("%s after the SDK's retries: fails with busy", async (_, makeError) => {
    const { ai } = setup(makeError());

    expect(await failureOf(ai.extractWords(jpeg, ctx))).toMatchObject({ code: "busy" });
    expect(await usageRows()).toMatchObject([
      { ok: false, model: MODEL, inputTokens: null, outputTokens: null, stopReason: null },
    ]);
  });

  it("other API errors (e.g. a bad request) surface unchanged", async () => {
    const { ai } = setup(apiError(400));
    const error = await failureOf(ai.extractWords(jpeg, ctx));
    expect(error).toBeInstanceOf(Anthropic.BadRequestError);
    expect(error).not.toBeInstanceOf(AiError);
  });

  it("fallback: records the model that answered and the tokens of every attempt", async () => {
    const { ai } = setup(asFallback(page, "claude-opus-4-8"));

    const result = await ai.extractWords(jpeg, ctx);
    expect(result.words.length).toBeGreaterThan(40);
    expect(await usageRows()).toMatchObject([
      {
        ok: true,
        model: "claude-opus-4-8",
        inputTokens: 3000 + page.usage.input_tokens,
        outputTokens: 12 + page.usage.output_tokens,
      },
    ]);
  });
});

describe("enrichWords (§11.3)", () => {
  const input = enrichFixture.input ?? [];

  it("returns one entry per word, matched by ref", async () => {
    const { ai } = setup(enrichFixture.response);
    const { words } = await ai.enrichWords(input, ctx);

    expect(words.map((w) => w.ref)).toEqual(input.map((w) => w.ref));
    const byLemma = new Map(words.map((w) => [w.lemma, w]));
    expect(byLemma.get("aufstehen")?.forms).toEqual({
      praeteritum: "stand auf",
      partizip2: "aufgestanden",
      auxiliary: "sein",
    });
    expect(byLemma.get("Schreibtisch")?.plural).toBe("Schreibtische");
    // needsForms was false: no forms, but still an example sentence.
    expect(byLemma.get("Garage")).toMatchObject({ plural: null, forms: null });
    expect(byLemma.get("Garage")?.exampleDe).toMatch(/Garage/);
  });

  it("sends the words as JSON and records an enrich usage row", async () => {
    const { ai, requests } = setup(enrichFixture.response);
    await ai.enrichWords(input, ctx);

    const content = first(requests).messages[0]?.content;
    const text = Array.isArray(content) && content[0]?.type === "text" ? content[0].text : "";
    expect(JSON.parse(text)).toEqual(input);
    expect(await usageRows()).toMatchObject([{ callType: "enrich", ok: true }]);
  });
});
