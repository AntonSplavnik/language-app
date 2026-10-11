import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapEntry } from "../../src/dictionary/kaikki";

const SAMPLE = new URL("../fixtures/kaikki-sample.jsonl", import.meta.url);
const entries: unknown[] = readFileSync(SAMPLE, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const rows = entries.map(mapEntry).filter((row) => row !== null);
const rowsFor = (lemma: string, pos?: string) =>
  rows.filter((r) => r.lemma === lemma && (pos === undefined || r.pos === pos));

describe("mapEntry: kaikki JSONL → dictionary_entries (§7)", () => {
  it("noun: gender, plural and English glosses", () => {
    expect(rowsFor("Tisch")).toEqual([
      {
        lemma: "Tisch",
        pos: "noun",
        genders: ["der"],
        plurals: ["Tische"],
        forms: null,
        glossesEn: expect.arrayContaining(["dining table, dinner table"]),
      },
    ]);
  });

  it("a noun with two genders is two rows: der See (lake) and die See (sea)", () => {
    expect(rowsFor("See").map((r) => [r.genders, r.plurals])).toEqual([
      [["der"], ["Seen"]],
      [["die"], ["Seen"]],
    ]);
  });

  it("each meaning of Band keeps its own gender and plural", () => {
    expect(rowsFor("Band").map((r) => `${r.genders.join()} ${r.plurals.join()}`)).toEqual([
      "das Bänder",
      "der Bände",
      "die Bands",
    ]);
  });

  it("only plain plurals count, not nonstandard ones", () => {
    expect(rowsFor("Handy")[0]?.plurals).toEqual(["Handys"]);
  });

  it("a noun without a plural, and a plural-only noun without a gender", () => {
    expect(rowsFor("Obst")[0]).toMatchObject({ genders: ["das"], plurals: [] });
    expect(rowsFor("Eltern")[0]).toMatchObject({ genders: [], plurals: [] });
  });

  it("verb: Präteritum, Partizip II and auxiliary", () => {
    expect(rowsFor("gehen")[0]?.forms).toEqual({
      praeteritum: "ging",
      partizip2: "gegangen",
      auxiliary: "sein",
    });
    expect(rowsFor("verkaufen")[0]?.forms).toEqual({
      praeteritum: "verkaufte",
      partizip2: "verkauft",
      auxiliary: "haben",
    });
    expect(rowsFor("sein", "verb")[0]?.forms).toEqual({
      praeteritum: "war",
      partizip2: "gewesen",
      auxiliary: "sein",
    });
  });

  it("verb listed with both haben and sein: no forms, so enrichment decides", () => {
    expect(rowsFor("fahren")[0]?.forms).toBeNull();
    expect(rowsFor("aufstehen")[0]?.forms).toBeNull();
  });

  it("maps Wiktionary parts of speech to ours", () => {
    expect(rowsFor("schnell").map((r) => r.pos)).toEqual(["adjective", "adverb"]);
    expect(rowsFor("der").map((r) => r.pos)).toContain("determiner");
    expect(rowsFor("der").map((r) => r.pos)).toContain("pronoun");
    expect(rowsFor("mit", "preposition")).toHaveLength(1);
    expect(rowsFor("und", "conjunction")).toHaveLength(1);
    expect(rowsFor("acht", "numeral")).toHaveLength(1);
    expect(rowsFor("hallo", "interjection")).toHaveLength(1);
    expect(rowsFor("im", "other")).toHaveLength(1);
  });

  it("keeps derived words that Wiktionary files under form-of (female forms, agent nouns…)", () => {
    expect(rowsFor("Partnerin")[0]).toMatchObject({ genders: ["die"], plurals: ["Partnerinnen"] });
    expect(rowsFor("Freundin")[0]).toMatchObject({ genders: ["die"], plurals: ["Freundinnen"] });
    expect(rowsFor("Lehrer")[0]).toMatchObject({ genders: ["der"], plurals: ["Lehrer"] });
    expect(rowsFor("Blümchen")[0]).toMatchObject({ genders: ["das"] });
  });

  it("skips entries that only point to another word (form-of)", () => {
    expect(rowsFor("Tische")).toEqual([]);
    // möbliert: the two verb-form entries are skipped, the adjective stays.
    expect(rowsFor("möbliert").map((r) => r.pos)).toEqual(["adjective"]);
  });

  it("skips proper names", () => {
    expect(rowsFor("Berlin")).toEqual([]);
    expect(rowsFor("See").every((r) => r.pos === "noun")).toBe(true);
  });

  it("skips other languages and unknown parts of speech", () => {
    const tisch = entries.find((e) => (e as { word: string }).word === "Tisch") as object;
    expect(mapEntry({ ...tisch, lang_code: "en" })).toBeNull();
    expect(mapEntry({ ...tisch, pos: "suffix" })).toBeNull();
    expect(mapEntry({ nonsense: true })).toBeNull();
  });
});
