import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Article, Pos, ThemeKey, WordStatus } from "@language-app/core";
import { asc, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createClaudeAi } from "../../src/ai/claude";
import type { MessageRequest } from "../../src/ai/transport";
import { dbUsageSink } from "../../src/ai/usage";
import { aiUsage, imports, userWords, words, wordTranslations } from "../../src/db/schema";
import { loadDictionary } from "../../src/dictionary/load";
import { enrichWords } from "../../src/words/enrich";
import { apiError, enrichInputOf, fakeEnrichResponse, respondingTransport } from "../helpers/ai";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";

const db = useTestDb();
const SAMPLE = new URL("../fixtures/kaikki-sample.jsonl", import.meta.url).pathname;
const THEMES = new URL("../fixtures/dictionary-themes-sample.tsv", import.meta.url).pathname;

beforeEach(async () => {
  await loadDictionary(db, SAMPLE);
});

/** A saved word of the learner, as an import leaves it: not enriched yet. */
async function addWord(
  lemma: string,
  pos: Pos,
  article: Article | null,
  translation: string,
  {
    status = "learning",
    enriched = false,
    themes = null,
  }: { status?: WordStatus; enriched?: boolean; themes?: ThemeKey[] | null } = {},
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
        themes,
        ...(enriched ? { enrichedAt: new Date(), exampleDe: "Schon da." } : {}),
      })
      .returning({ id: words.id }),
  );
  await db.insert(wordTranslations).values({ wordId: word.id, language: "en", translation });
  await db.insert(userWords).values({ userId: LEARNER_ID, wordId: word.id, status });
  return word.id;
}

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
  });
  return {
    ai,
    requests: replay.requests,
    enrich: (wordIds: number[], importId: number | null = null) =>
      enrichWords(
        { db, ai },
        { learner: { id: LEARNER_ID, learnerLanguage: "en", aiEnabled: true }, importId, wordIds },
      ),
  };
}

const themesOf = async (id: number) =>
  first(await db.select({ themes: words.themes }).from(words).where(eq(words.id, id))).themes;

async function word(id: number) {
  const [row] = await db
    .select({
      plural: words.plural,
      forms: words.forms,
      formsSource: words.formsSource,
      exampleDe: words.exampleDe,
      enrichedAt: words.enrichedAt,
      exampleTranslation: wordTranslations.exampleTranslation,
      ipa: words.ipa,
      audioFile: words.audioFile,
      audioUrl: words.audioUrl,
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

  it("copies the pronunciation from the dictionary: a noun's from an entry with its gender", async () => {
    const tisch = await addWord("Tisch", "noun", "der", "table");
    const derBand = await addWord("Band", "noun", "der", "volume");
    const dieBand = await addWord("Band", "noun", "die", "band");
    // Plural-only: its entry has no gender, which contradicts nothing.
    const eltern = await addWord("Eltern", "noun", "die", "parents");
    await setup().enrich([tisch, derBand, dieBand, eltern]);

    expect(await word(tisch)).toMatchObject({
      ipa: "/tɪʃ/",
      audioFile: "De-Tisch2.ogg",
      audioUrl:
        "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/de/De-Tisch2.ogg/De-Tisch2.ogg.mp3",
    });
    expect(await word(derBand)).toMatchObject({ ipa: "/bant/", audioFile: "De-Band.oga" });
    expect(await word(dieBand)).toMatchObject({ ipa: "/bɛnt/", audioFile: "De-Band2.ogg" });
    expect(await word(eltern)).toMatchObject({ ipa: "/ˈɛltərn/", audioFile: "De-Eltern.ogg" });
  });

  it("copies the pronunciation of other words, also through the non-noun fallback", async () => {
    const schnell = await addWord("schnell", "adjective", null, "fast");
    // Claude calls nicht a particle; Wiktionary files it as an adverb.
    const nicht = await addWord("nicht", "particle", null, "not");
    const kuehlschrank = await addWord("Kühlschrank", "noun", "der", "fridge"); // not in the sample
    // An article the dictionary contradicts: no entry describes this word.
    const dieTisch = await addWord("Tisch", "noun", "die", "table");
    await setup().enrich([schnell, nicht, kuehlschrank, dieTisch]);

    expect(await word(schnell)).toMatchObject({ ipa: "/ʃnɛl/", audioFile: "De-schnell.ogg" });
    expect(await word(nicht)).toMatchObject({ ipa: "/nɪçt/", audioFile: "De-nicht2.ogg" });
    for (const id of [kuehlschrank, dieTisch]) {
      expect(await word(id)).toMatchObject({ ipa: null, audioFile: null, audioUrl: null });
    }
  });

  it("leaves the facts of a word typed from a dictionary entry as they are (§6.7)", async () => {
    // die Bank "bank" → Banken; the dictionary step alone would take the first entry's Bänke.
    const bank = await addWord("Bank", "noun", "die", "bank");
    await db
      .update(words)
      .set({ plural: "Banken", formsSource: "dictionary", ipa: "/baŋk/", audioFile: null })
      .where(eq(words.id, bank));
    const s = setup();

    expect(await s.enrich([bank])).toEqual({ enriched: 1, pending: 0 });
    expect(enrichInputOf(first(s.requests))).toMatchObject([{ lemma: "Bank", needsForms: false }]);
    expect(await word(bank)).toMatchObject({
      plural: "Banken",
      formsSource: "dictionary",
      ipa: "/baŋk/",
      audioFile: null,
      exampleDe: "Das ist ein Beispiel mit Bank.",
    });
  });

  it("a word with a pronunciation keeps it, and still gets the forms the dictionary has", async () => {
    // Typed from an entry without a plural, but with a recording of its own.
    const tisch = await addWord("Tisch", "noun", "der", "table");
    await db
      .update(words)
      .set({ ipa: "/tiʃ/", audioFile: "Own.ogg", audioUrl: "https://upload.wikimedia.org/own.mp3" })
      .where(eq(words.id, tisch));
    await setup().enrich([tisch]);
    expect(await word(tisch)).toMatchObject({
      plural: "Tische",
      formsSource: "dictionary",
      ipa: "/tiʃ/",
      audioFile: "Own.ogg",
    });
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

  it("keeps dictionary forms and pronunciation even when the AI call fails", async () => {
    const tisch = await addWord("Tisch", "noun", "der", "table");
    const schnell = await addWord("schnell", "adjective", null, "fast");
    await setup(() => apiError(529)).enrich([tisch, schnell]);
    expect(await word(tisch)).toMatchObject({
      plural: "Tische",
      formsSource: "dictionary",
      audioFile: "De-Tisch2.ogg",
      enrichedAt: null,
    });
    expect(await word(schnell)).toMatchObject({
      formsSource: null,
      audioFile: "De-schnell.ogg",
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
      await db.insert(imports).values({ userId: LEARNER_ID }).returning({ id: imports.id }),
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

describe("themes in enrichment (§6.6)", () => {
  beforeEach(async () => {
    await loadDictionary(db, SAMPLE, { themes: THEMES });
  });

  it("asks Call 2 for every word's themes and stores them only where the word has none", async () => {
    const kuehlschrank = await addWord("Kühlschrank", "noun", "der", "fridge"); // not in the file
    const decided = await addWord("Garage", "noun", "die", "garage", { themes: [] });
    const own = await addWord("Schreibtisch", "noun", "der", "desk", { themes: ["work"] });
    const s = setup((request) =>
      fakeEnrichResponse(request, (entry) => ({ ...entry, themes: ["home", "technology"] })),
    );

    expect(await s.enrich([kuehlschrank, decided, own])).toEqual({ enriched: 3, pending: 0 });

    expect(await themesOf(kuehlschrank)).toEqual(["home", "technology"]);
    expect(await themesOf(decided)).toEqual([]);
    expect(await themesOf(own)).toEqual(["work"]);
    expect(s.requests[0]?.system).toEqual(expect.stringContaining("- offices: "));
  });

  it("drops unknown keys and keeps at most 2 of Call 2's themes", async () => {
    const one = await addWord("Kühlschrank", "noun", "der", "fridge");
    const two = await addWord("Schreibtisch", "noun", "der", "desk");
    const s = setup((request) =>
      fakeEnrichResponse(request, (entry) => ({
        ...entry,
        themes:
          entry.lemma === "Kühlschrank"
            ? ["kitchen", "home", "home", "food", "technology"]
            : ["furniture", "office"],
      })),
    );

    await s.enrich([one, two]);

    expect(await themesOf(one)).toEqual(["home", "food"]);
    // Nothing known left: decided as none.
    expect(await themesOf(two)).toEqual([]);
  });

  it("the dictionary step gives a word still without themes the dictionary's first", async () => {
    const tisch = await addWord("Tisch", "noun", "der", "table");
    const s = setup((request) =>
      fakeEnrichResponse(request, (entry) => ({ ...entry, themes: ["culture"] })),
    );

    await s.enrich([tisch]);
    expect(await themesOf(tisch)).toEqual(["home", "food"]);
  });

  it("the dictionary's themes come without AI, and stay when the AI call fails", async () => {
    const tisch = await addWord("Tisch", "noun", "der", "table");
    const see = await addWord("See", "noun", "die", "sea");
    const kuehlschrank = await addWord("Kühlschrank", "noun", "der", "fridge");

    await enrichWords(
      { db, ai: setup().ai },
      { learner: { id: LEARNER_ID, learnerLanguage: "en", aiEnabled: false }, wordIds: [tisch] },
    );
    expect(await themesOf(tisch)).toEqual(["home", "food"]);

    await setup(() => apiError(529)).enrich([see, kuehlschrank]);
    expect(await themesOf(see)).toEqual(["nature"]);
    // A failed batch leaves the word undecided; Add details tries again.
    expect(await themesOf(kuehlschrank)).toBeNull();
  });
});
