import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { DescribeInput, DescribeResponse, LookupResponse } from "@language-app/core";
import { asc } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createClaudeAi } from "../../src/ai/claude";
import { dbUsageSink } from "../../src/ai/usage";
import { aiUsage } from "../../src/db/schema";
import { loadDictionary } from "../../src/dictionary/load";
import { SINGLE_USER_ID } from "../../src/user";
import { apiError, loadAiFixture, replayTransport, withStopReason, withText } from "../helpers/ai";
import { buildTestApp } from "../helpers/app";
import { first, useTestDb } from "../helpers/db";

// Ask AI (Call 3, docs/design.md §9.3, §11.5, §11.6), replaying recorded Claude responses.

const db = useTestDb();
const SAMPLE = new URL("../fixtures/kaikki-sample.jsonl", import.meta.url).pathname;

beforeEach(async () => {
  await loadDictionary(db, SAMPLE);
});

const entryBank = loadAiFixture("describe-entry-bank");
const misspeltNoun = loadAiFixture("describe-misspelt-noun");
const inflectedVerb = loadAiFixture("describe-inflected-verb");
const english = loadAiFixture("describe-english");

function setup(steps: Array<BetaMessage | Error>, dailyDescribeLimit = 200) {
  const replay = replayTransport(...steps);
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
  const app = buildTestApp(db, { ai, dailyDescribeLimit });
  return {
    app,
    requests: replay.requests,
    describe: (body: unknown) =>
      app.inject({ method: "POST", url: "/api/words/describe", payload: body as object }),
  };
}

const errorOf = (res: { json: () => unknown }) =>
  (res.json() as { error: { code: string; message: string } }).error;

/** What the request asked Claude: the JSON in the user message. */
function askedFor(request: { messages: Array<{ content: unknown }> }) {
  const content = request.messages[0]?.content;
  const text = Array.isArray(content) && content[0]?.type === "text" ? content[0].text : "{}";
  return DescribeInput.parse(JSON.parse(text));
}

describe("the recorded Call 3 fixtures (§11.6)", () => {
  it("were recorded for the inputs the tests send", () => {
    expect(misspeltNoun.input).toEqual({ text: "Regenschrim" });
    expect(inflectedVerb.input).toEqual({ text: "ging" });
    expect(english.input).toEqual({ text: "umbrella" });
    expect(entryBank.input).toMatchObject({
      text: "Bank",
      entry: { lemma: "Bank", pos: "noun", article: "die" },
    });
  });
});

describe("POST /api/words/describe (§9.3)", () => {
  it("a misspelt noun: the word meant, in base form, with its article", async () => {
    const s = setup([misspeltNoun.response]);
    const res = await s.describe({ text: " Regenschrim " });
    expect(res.statusCode).toBe(200);
    expect(DescribeResponse.parse(res.json())).toEqual({
      lemma: "Regenschirm",
      pos: "noun",
      article: "der",
      translation: "umbrella",
    });
    expect(askedFor(first(s.requests))).toEqual({ text: "Regenschrim" });
  });

  it("an inflected verb: its infinitive, without an article", async () => {
    const s = setup([inflectedVerb.response]);
    const body = DescribeResponse.parse((await s.describe({ text: "ging" })).json());
    expect(body).toMatchObject({ lemma: "gehen", pos: "verb", article: null });
    expect(body.translation).toMatch(/^to /);
  });

  it("an English word is not German: 422 not_german", async () => {
    const s = setup([english.response]);
    const res = await s.describe({ text: "umbrella" });
    expect(res.statusCode).toBe(422);
    expect(errorOf(res).code).toBe("not_german");
  });

  it("with an entry: a translation in the entry's sense, and the entry's word", async () => {
    const s = setup([entryBank.response]);
    const lookup = LookupResponse.parse(
      (await s.app.inject({ method: "GET", url: "/api/dictionary/lookup?q=Bank" })).json(),
    );
    const bank = lookup.entries[1]; // die Bank "bank (financial institution)" → Banken
    expect(bank?.plural).toBe("Banken");

    const body = DescribeResponse.parse(
      (await s.describe({ text: "Bank", entryId: bank?.entryId })).json(),
    );
    expect(body).toEqual({ lemma: "Bank", pos: "noun", article: "die", translation: "bank" });
    expect(askedFor(first(s.requests))).toEqual({
      text: "Bank",
      entry: {
        lemma: "Bank",
        pos: "noun",
        article: "die",
        glosses: ["bank (financial institution)", "a storage facility for some specified purpose"],
      },
    });
  });

  it("an unknown entry: 404 entry_not_found, without asking the AI", async () => {
    const s = setup([]);
    const res = await s.describe({ text: "Bank", entryId: 999_999 });
    expect(res.statusCode).toBe(404);
    expect(errorOf(res).code).toBe("entry_not_found");
    expect(s.requests).toHaveLength(0);
  });

  it("records the call in ai_usage as describe, without an import", async () => {
    const s = setup([misspeltNoun.response]);
    await s.describe({ text: "Regenschrim" });
    expect(await db.select().from(aiUsage)).toMatchObject([
      {
        userId: SINGLE_USER_ID,
        importId: null,
        callType: "describe",
        model: misspeltNoun.response.model,
        ok: true,
      },
    ]);
  });

  it("beyond the daily limit: 429 daily_limit, without asking the AI", async () => {
    const s = setup([misspeltNoun.response, misspeltNoun.response], 2);
    // Photos have their own limit: extract calls don't count.
    await db.insert(aiUsage).values([
      { userId: SINGLE_USER_ID, callType: "extract", model: "m", ok: true },
      { userId: SINGLE_USER_ID, callType: "describe", model: "m", ok: false },
    ]);
    expect((await s.describe({ text: "Regenschrim" })).statusCode).toBe(200);

    const res = await s.describe({ text: "Regenschrim" });
    expect(res.statusCode).toBe(429);
    expect(errorOf(res)).toEqual({ code: "daily_limit", message: "Daily AI limit reached" });
    expect(s.requests).toHaveLength(1);
    const rows = await db.select().from(aiUsage).orderBy(asc(aiUsage.id));
    expect(rows.filter((r) => r.callType === "describe")).toHaveLength(2);
  });

  it.each([
    ["busy (529)", () => apiError(529), 503, "ai_busy"],
    [
      "refused",
      () =>
        withStopReason(misspeltNoun.response, "refusal", {
          content: [],
          stop_details: {
            type: "refusal",
            category: null,
            explanation: null,
            fallback_credit_token: null,
            fallback_has_prefill_claim: null,
            recommended_model: null,
          },
        }),
      422,
      "ai_refused",
    ],
  ])("the AI %s: %i %s, with a message about Ask AI", async (_, step, status, code) => {
    const s = setup([step()]);
    const res = await s.describe({ text: "Regenschrim" });
    expect(res.statusCode).toBe(status);
    expect(errorOf(res).code).toBe(code);
    expect(errorOf(res).message).not.toMatch(/photo/i);
  });

  it("invalid output twice: 422 ai_invalid_output", async () => {
    const broken = withText(misspeltNoun.response, '{"german": true');
    const res = await setup([broken, broken]).describe({ text: "Regenschrim" });
    expect(res.statusCode).toBe(422);
    expect(errorOf(res).code).toBe("ai_invalid_output");
  });

  it("an article on a word that isn't a noun is dropped", async () => {
    const withArticle = withText(
      inflectedVerb.response,
      JSON.stringify({
        german: true,
        lemma: "gehen",
        pos: "verb",
        article: "der",
        translation: "to go",
      }),
    );
    const body = DescribeResponse.parse(
      (await setup([withArticle]).describe({ text: "ging" })).json(),
    );
    expect(body.article).toBeNull();
  });

  it("needs a text of 1 to 50 characters", async () => {
    const s = setup([]);
    for (const body of [{}, { text: "  " }, { text: "x".repeat(51) }]) {
      expect((await s.describe(body)).statusCode).toBe(400);
    }
    expect(s.requests).toHaveLength(0);
  });
});
