import { count } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dictionaryEntries } from "../../src/db/schema";
import { loadDictionary } from "../../src/dictionary/load";
import { lookupWords } from "../../src/dictionary/lookup";
import { useTestDb } from "../helpers/db";

const db = useTestDb();
const SAMPLE = new URL("../fixtures/kaikki-sample.jsonl", import.meta.url).pathname;

const rowCount = async () => (await db.select({ n: count() }).from(dictionaryEntries))[0]?.n;

describe("loadDictionary (§7)", () => {
  it("loads the mapped entries and reports counts per part of speech", async () => {
    const result = await loadDictionary(db, SAMPLE);

    expect(result.read).toBe(50);
    expect(result.inserted).toBe(await rowCount());
    expect(result.byPos.noun).toBe(16);
    expect(result.byPos.verb).toBe(5);
  });

  it("loading again replaces the table instead of adding to it", async () => {
    const first = await loadDictionary(db, SAMPLE);
    await loadDictionary(db, SAMPLE);
    expect(await rowCount()).toBe(first.inserted);
  });
});

describe("lookupWords", () => {
  it("finds every entry for a lemma and part of speech", async () => {
    await loadDictionary(db, SAMPLE);
    const found = await lookupWords(db, [{ lemma: "See", pos: "noun" }]);
    expect(found.get("See|noun")?.map((e) => e.genders)).toEqual([["der"], ["die"]]);
  });

  it("falls back to a case-insensitive match only when there is no exact one", async () => {
    await loadDictionary(db, SAMPLE);
    const found = await lookupWords(db, [
      { lemma: "tisch", pos: "noun" },
      { lemma: "Schnell", pos: "adjective" },
    ]);
    expect(found.get("tisch|noun")?.map((e) => e.lemma)).toEqual(["Tisch"]);
    expect(found.get("Schnell|adjective")?.map((e) => e.lemma)).toEqual(["schnell"]);
  });

  it("a noun must be found as a noun: its gender comes from the noun entry", async () => {
    await loadDictionary(db, SAMPLE);
    const found = await lookupWords(db, [
      { lemma: "Tisch", pos: "verb" },
      { lemma: "gehen", pos: "noun" },
    ]);
    expect(found.get("Tisch|verb")).toEqual([]);
    expect(found.get("gehen|noun")).toEqual([]);
  });

  it("other words fall back to any non-noun entry: sources label small words differently", async () => {
    await loadDictionary(db, SAMPLE);
    // Claude calls "nicht" a particle; Wiktionary has it as an adverb and an interjection.
    const found = await lookupWords(db, [
      { lemma: "nicht", pos: "particle" },
      { lemma: "schnell", pos: "adverb" },
    ]);
    expect(found.get("nicht|particle")?.map((e) => e.pos)).toEqual(["adverb", "interjection"]);
    // An exact part-of-speech match still wins over the fallback.
    expect(found.get("schnell|adverb")?.map((e) => e.pos)).toEqual(["adverb"]);
  });

  it("looks up many words in one call and handles an empty list", async () => {
    await loadDictionary(db, SAMPLE);
    const found = await lookupWords(db, [
      { lemma: "gehen", pos: "verb" },
      { lemma: "Zeitung", pos: "noun" },
      { lemma: "Quatschwort", pos: "noun" },
    ]);
    expect(found.get("gehen|verb")?.[0]?.forms?.auxiliary).toBe("sein");
    expect(found.get("Zeitung|noun")?.[0]?.plurals).toEqual(["Zeitungen"]);
    expect(found.get("Quatschwort|noun")).toEqual([]);
    expect((await lookupWords(db, [])).size).toBe(0);
  });
});
