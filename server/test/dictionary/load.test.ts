import { asc, count, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dictionaryEntries, dictionaryForms } from "../../src/db/schema";
import { loadDictionary } from "../../src/dictionary/load";
import { lookupWords } from "../../src/dictionary/lookup";
import { useTestDb } from "../helpers/db";

const db = useTestDb();
const SAMPLE = new URL("../fixtures/kaikki-sample.jsonl", import.meta.url).pathname;

const rowCount = async () => (await db.select({ n: count() }).from(dictionaryEntries))[0]?.n;
const formRows = () =>
  db.select().from(dictionaryForms).orderBy(asc(dictionaryForms.form), asc(dictionaryForms.lemma));

describe("loadDictionary (§7)", () => {
  it("loads the mapped entries and reports counts per part of speech", async () => {
    const result = await loadDictionary(db, SAMPLE);

    expect(result.read).toBe(74);
    expect(result.inserted).toBe(await rowCount());
    // 18 before typed words, then die Bank ×2, Liter, der/das Morgen, Regen, Regenschirm,
    // Regenschauer, Tischler, Tischdecke.
    expect(result.byPos.noun).toBe(28);
    expect(result.byPos.verb).toBe(5);
  });

  it("fills the forms table from the form-of entries, each form once per base word", async () => {
    const result = await loadDictionary(db, SAMPLE);

    const rows = await formRows();
    expect(result.forms).toBe(rows.length);
    expect(rows).toEqual(
      expect.arrayContaining([
        { form: "Banken", lemma: "Bank", pos: "noun" },
        { form: "Regenschirme", lemma: "Regenschirm", pos: "noun" },
        { form: "Tische", lemma: "Tisch", pos: "noun" },
        { form: "aufgestanden", lemma: "aufstehen", pos: "verb" },
        { form: "gegangen", lemma: "gehen", pos: "verb" },
        { form: "ging", lemma: "gehen", pos: "verb" },
        { form: "möbliert", lemma: "möblieren", pos: "verb" },
        { form: "schneller", lemma: "schnell", pos: "adjective" },
      ]),
    );
    // Two entries each say schneller is a form of schnell; the table has it once.
    expect(rows.filter((r) => r.form === "schneller")).toHaveLength(1);
    // A form never equals its base word.
    expect(rows.filter((r) => r.form.toLowerCase() === r.lemma.toLowerCase())).toEqual([]);
  });

  it("leaves the tables' indexes as the migrations made them (rebuilt after inserting)", async () => {
    const indexes = async () =>
      (
        await db.execute<{ indexdef: string }>(
          sql`SELECT indexdef FROM pg_indexes WHERE tablename IN ('dictionary_entries', 'dictionary_forms') ORDER BY indexname`,
        )
      ).rows.map((r) => r.indexdef);
    const before = await indexes();
    expect(before.some((def) => def.includes("gin_trgm_ops"))).toBe(true);

    await loadDictionary(db, SAMPLE);
    expect(await indexes()).toEqual(before);
  });

  it("loading again replaces the forms table too", async () => {
    await loadDictionary(db, SAMPLE);
    const first = await formRows();
    await loadDictionary(db, SAMPLE);
    expect(await formRows()).toEqual(first);
  });

  it("stores the pronunciation of each entry", async () => {
    await loadDictionary(db, SAMPLE);
    const found = await lookupWords(db, [{ lemma: "Tisch", pos: "noun" }]);
    expect(found.get("Tisch|noun")).toMatchObject([
      {
        ipa: "/tɪʃ/",
        audioFile: "De-Tisch2.ogg",
        audioUrl:
          "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/de/De-Tisch2.ogg/De-Tisch2.ogg.mp3",
      },
    ]);
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
