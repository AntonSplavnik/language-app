import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Article, Pos, WordStatus } from "@language-app/core";
import { asc, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createClaudeAi } from "../../src/ai/claude";
import type { MessageRequest } from "../../src/ai/transport";
import { dbUsageSink } from "../../src/ai/usage";
import { aiUsage, imports, userWords, words, wordTranslations } from "../../src/db/schema";
import { loadDictionary } from "../../src/dictionary/load";
import { SINGLE_USER_ID } from "../../src/user";
import { enrichWords } from "../../src/words/enrich";
import { apiError, enrichInputOf, fakeEnrichResponse, respondingTransport } from "../helpers/ai";
import { first, useTestDb } from "../helpers/db";

const db = useTestDb();
const SAMPLE = new URL("../fixtures/kaikki-sample.jsonl", import.meta.url).pathname;

beforeEach(async () => {
  await loadDictionary(db, SAMPLE);
});

/** A saved word of the learner, as an import leaves it: not enriched yet. */
async function addWord(
  lemma: string,
  pos: Pos,
  article: Article | null,
  translation: string,
  { status = "learning", enriched = false }: { status?: WordStatus; enriched?: boolean } = {},
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
        ...(enriched ? { enrichedAt: new Date(), exampleDe: "Schon da." } : {}),
      })
      .returning({ id: words.id }),
  );
  await db.insert(wordTranslations).values({ wordId: word.id, language: "en", translation });
  await db.insert(userWords).values({ userId: SINGLE_USER_ID, wordId: word.id, status });
  return word.id;
}

function setup(
  respond: (request: MessageRequest) => BetaMessage | Error = (r) => fakeEnrichResponse(r),
) {
  const replay = respondingTransport(respond);
  const ai = createClaudeAi({
    transport: replay.transport,
    recordUsage: dbUsageSink(db),
    models: { extract: "claude-haiku-5-5", enrich: "claude-haiku-5-5" },
    effort: "medium",
    learnerLanguage: "en",
  });
  return {
    requests: replay.requests,
    enrich: (wordIds: number[], importId: number | null = null) =>
      enrichWords({ db, ai }, { userId: SINGLE_USER_ID, importId, wordIds }),
  };
}

async function word(id: number) {
  const [row] = await db
    .select({
      plural: words.plural,
      forms: words.forms,
      formsSource: words.formsSource,
      exampleDe: words.exampleDe,
      enrichedAt: words.enrichedAt,
      exampleTranslation: wordTranslations.exampleTranslation,
    })
    .from(words)
    .leftJoin(wordTranslations, eq(wordTranslations.wordId, words.id))
    .where(eq(words.id, id));
  return row;
}

describe("enrichWords (§6.6)", () => {
  it("takes plurals and verb forms from the dictionary and asks the AI only for the rest", async () => {
    const tisch = await addWord("Tisch", "noun", "der", "table");
    const kuehlschrank = await addWord("Kühlschrank", "noun", "der", "fridge"); // not in the sample
    const gehen = await addWord("gehen", "verb", null, "to go");
    const fahren = await addWord("fahren", "verb", null, "to drive"); // haben and sein in Wiktionary
    const schnell = await addWord("schnell", "adjective", null, "fast");
    const s = setup();

    expect(await s.enrich([tisch, kuehlschrank, gehen, fahren, schnell])).toEqual({
      enriched: 5,
      pending: 0,
    });

    const sent = enrichInputOf(first(s.requests));
    expect(Object.fromEntries(sent.map((w) => [w.lemma, w.needsForms]))).toEqual({
      Tisch: false,
      Kühlschrank: true,
      gehen: false,
      fahren: true,
      schnell: false,
    });
    expect(sent.map((w) => w.ref)).toEqual([0, 1, 2, 3, 4]);

    expect(await word(tisch)).toMatchObject({ plural: "Tische", formsSource: "dictionary" });
    expect(await word(kuehlschrank)).toMatchObject({ plural: "Kühlschrank-AI", formsSource: "ai" });
    expect(await word(gehen)).toMatchObject({
      forms: { praeteritum: "ging", partizip2: "gegangen", auxiliary: "sein" },
      formsSource: "dictionary",
    });
    expect(await word(fahren)).toMatchObject({
      forms: { praeteritum: "fahren-prät", partizip2: "fahren-p2", auxiliary: "haben" },
      formsSource: "ai",
    });
    expect(await word(schnell)).toMatchObject({ plural: null, forms: null, formsSource: null });

    expect(await word(tisch)).toMatchObject({
      exampleDe: "Das ist ein Beispiel mit Tisch.",
      exampleTranslation: "This is an example with table.",
      enrichedAt: expect.any(Date),
    });
  });

  it("uses the plural of the dictionary entry with the word's own gender", async () => {
    const derBand = await addWord("Band", "noun", "der", "volume");
    const dieBand = await addWord("Band", "noun", "die", "band");
    await setup().enrich([derBand, dieBand]);
    expect((await word(derBand))?.plural).toBe("Bände");
    expect((await word(dieBand))?.plural).toBe("Bands");
  });

  it("skips words that are already enriched, without an AI call", async () => {
    const done = await addWord("Tisch", "noun", "der", "table", { enriched: true });
    const s = setup();
    expect(await s.enrich([done])).toEqual({ enriched: 0, pending: 0 });
    expect(s.requests).toHaveLength(0);
  });

  it("sends at most 30 words per call", async () => {
    const ids = [];
    for (let i = 1; i <= 65; i++) ids.push(await addWord(`Wort${i}`, "noun", "das", `word ${i}`));
    const s = setup();

    expect(await s.enrich(ids)).toEqual({ enriched: 65, pending: 0 });
    expect(s.requests.map((r) => enrichInputOf(r).length).sort((a, b) => a - b)).toEqual([
      5, 30, 30,
    ]);
  });

  it("a failed call leaves its words pending; the other calls still count", async () => {
    const ids = [];
    for (let i = 1; i <= 35; i++) ids.push(await addWord(`Wort${i}`, "noun", "das", `word ${i}`));
    const s = setup((request) =>
      enrichInputOf(request).some((w) => w.lemma === "Wort1")
        ? apiError(529)
        : fakeEnrichResponse(request),
    );

    expect(await s.enrich(ids)).toEqual({ enriched: 5, pending: 30 });
    expect((await word(ids[0] as number))?.enrichedAt).toBeNull();
  });

  it("keeps dictionary forms even when the AI call fails", async () => {
    const tisch = await addWord("Tisch", "noun", "der", "table");
    await setup(() => apiError(529)).enrich([tisch]);
    expect(await word(tisch)).toMatchObject({
      plural: "Tische",
      formsSource: "dictionary",
      enrichedAt: null,
    });
  });

  it("ignores an entry whose lemma doesn't belong to its ref", async () => {
    const tisch = await addWord("Tisch", "noun", "der", "table");
    const gehen = await addWord("gehen", "verb", null, "to go");
    const s = setup((request) =>
      fakeEnrichResponse(request, (entry) =>
        entry.lemma === "Tisch" ? { ...entry, lemma: "Stuhl" } : entry,
      ),
    );

    expect(await s.enrich([tisch, gehen])).toEqual({ enriched: 1, pending: 1 });
    expect((await word(tisch))?.exampleDe).toBeNull();
  });

  it("records each call in ai_usage against the import", async () => {
    const lesson = first(
      await db.insert(imports).values({ userId: SINGLE_USER_ID }).returning({ id: imports.id }),
    );
    const tisch = await addWord("Tisch", "noun", "der", "table");
    await setup().enrich([tisch], lesson.id);
    expect(await db.select().from(aiUsage)).toMatchObject([
      { callType: "enrich", importId: lesson.id, ok: true },
    ]);
  });

  it("does nothing for an empty list", async () => {
    const s = setup();
    expect(await s.enrich([])).toEqual({ enriched: 0, pending: 0 });
    expect(s.requests).toHaveLength(0);
  });

  it("only touches the requested words", async () => {
    const tisch = await addWord("Tisch", "noun", "der", "table");
    const other = await addWord("Zeitung", "noun", "die", "newspaper");
    await setup().enrich([tisch]);
    const rows = await db
      .select({ id: words.id, enrichedAt: words.enrichedAt })
      .from(words)
      .where(inArray(words.id, [tisch, other]))
      .orderBy(asc(words.id));
    expect(rows.map((r) => r.enrichedAt !== null)).toEqual([true, false]);
  });
});
