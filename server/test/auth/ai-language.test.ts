import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createClaudeAi } from "../../src/ai/claude";
import type { MessageRequest } from "../../src/ai/transport";
import { dbUsageSink } from "../../src/ai/usage";
import { users, wordTranslations } from "../../src/db/schema";
import {
  fakeEnrichResponse,
  isExtractRequest,
  loadAiFixture,
  respondingTransport,
} from "../helpers/ai";
import { buildTestApp, multipartFile } from "../helpers/app";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";

// The AI writes in the signed-in learner's language, taken from the session for each call, not
// read once at startup (docs/design.md §17.3). One AI client serves two learners here.

const db = useTestDb();
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

function setup() {
  const page = loadAiFixture("extract-vocab-p13").response;
  const describeAnswer = loadAiFixture("describe-misspelt-noun").response;
  const replay = respondingTransport((request: MessageRequest) => {
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

async function koreanLearner() {
  return first(
    await db
      .insert(users)
      .values({ name: "Minji", learnerLanguage: "ko", targetLanguage: "de", aiEnabled: true })
      .returning({ id: users.id }),
  ).id;
}

const systemOf = (request: MessageRequest | undefined) => String(request?.system);

describe("the learner's language in the AI calls", () => {
  it("Ask AI (Call 3)", async () => {
    const { ai, requests } = setup();
    const minji = await koreanLearner();
    const describe = (learner: number) =>
      buildTestApp(db, { ai, learner }).inject({
        method: "POST",
        url: "/api/words/describe",
        payload: { text: "Regenschrim" },
      });

    expect((await describe(minji)).statusCode).toBe(200);
    expect((await describe(LEARNER_ID)).statusCode).toBe(200);
    expect(systemOf(requests[0])).toContain("native language is Korean");
    expect(systemOf(requests[1])).toContain("native language is English");
  });

  it("a photo (Call 1)", async () => {
    const { ai, requests } = setup();
    const minji = await koreanLearner();
    const app = buildTestApp(db, { ai, learner: minji });
    const created = await app.inject({ method: "POST", url: "/api/imports", payload: {} });
    const upload = await app.inject({
      method: "POST",
      url: `/api/imports/${created.json().id}/photos`,
      ...multipartFile("photo", jpeg),
    });

    expect(upload.statusCode).toBe(200);
    expect(systemOf(requests[0])).toContain("native language is Korean");
  });

  it("enrichment (Call 2), and the translation is stored in that language", async () => {
    const { ai, requests } = setup();
    const minji = await koreanLearner();
    const res = await buildTestApp(db, { ai, learner: minji }).inject({
      method: "POST",
      url: "/api/words",
      payload: { words: [{ lemma: "Tisch", pos: "noun", article: "der", translation: "탁자" }] },
    });

    expect(res.statusCode).toBe(200);
    expect(systemOf(requests[0])).toContain("Korean-speaking learner");
    const [stored] = await db
      .select({ language: wordTranslations.language, translation: wordTranslations.translation })
      .from(wordTranslations)
      .where(eq(wordTranslations.language, "ko"));
    expect(stored).toEqual({ language: "ko", translation: "탁자" });
  });
});
