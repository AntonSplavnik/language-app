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
        ipa: "/tɪʃ/",
        audioFile: "De-Tisch2.ogg",
        audioUrl:
          "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/de/De-Tisch2.ogg/De-Tisch2.ogg.mp3",
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

describe("mapEntry: pronunciation (§7)", () => {
  const tisch = entries.find((e) => (e as { word: string }).word === "Tisch") as object;
  const withSounds = (sounds: unknown) => mapEntry({ ...tisch, sounds });
  const recording = (audio: string, tags?: string[]) => ({
    audio,
    mp3_url: `https://upload.wikimedia.org/wikipedia/commons/transcoded/x/xy/${audio}/${audio}.mp3`,
    ...(tags ? { tags } : {}),
  });

  it("prefers a recording tagged Germany over an untagged one (always the mp3)", () => {
    // Tisch: De-Tisch.ogg (untagged) comes first, De-Tisch2.ogg (Germany, Berlin) second.
    expect(rowsFor("Tisch")[0]).toMatchObject({
      audioFile: "De-Tisch2.ogg",
      audioUrl: expect.stringMatching(/\/De-Tisch2\.ogg\.mp3$/),
    });
  });

  it("prefers a recording tagged Germany over one tagged Austria that comes first", () => {
    expect(rowsFor("Zeitung")[0]?.audioFile).toBe("De-Zeitung.ogg");
    expect(rowsFor("Freundin")[0]?.audioFile).toBe("De-Freundin.ogg");
  });

  it("without a Germany recording, prefers an untagged one over another region", () => {
    // Zimmer: De-at-Zimmer.ogg (Austria), then De-Zimmer.oga (untagged).
    expect(rowsFor("Zimmer")[0]?.audioFile).toBe("De-Zimmer.oga");
  });

  it("takes any recording when there is no better one", () => {
    expect(withSounds([recording("De-at-Tisch.ogg", ["Austria"])])?.audioFile).toBe(
      "De-at-Tisch.ogg",
    );
  });

  it("each meaning keeps its own recording: das/der Band /bant/, die Band /bɛnt/", () => {
    expect(rowsFor("Band").map((r) => `${r.genders.join()} ${r.ipa} ${r.audioFile}`)).toEqual([
      "das /bant/ De-Band.oga",
      "der /bant/ De-Band.oga",
      "die /bɛnt/ De-Band2.ogg",
    ]);
  });

  it("IPA: the first transcription, unless a later one is tagged Germany", () => {
    expect(rowsFor("Tisch")[0]?.ipa).toBe("/tɪʃ/");
    expect(rowsFor("schnell").map((r) => r.ipa)).toEqual(["/ʃnɛl/", "/ʃnɛl/"]);
    // November: /noˈfɛmbɐ/ is tagged Austria and listed first.
    expect(rowsFor("November")[0]?.ipa).toBe("/noˈvɛmbɐ/");
  });

  it("an entry without sounds has no IPA and no recording", () => {
    expect(withSounds(undefined)).toMatchObject({ ipa: null, audioFile: null, audioUrl: null });
    expect(withSounds([{ rhymes: "-ɪʃ" }])).toMatchObject({ ipa: null, audioFile: null });
  });

  it("IPA without a recording, and a recording without IPA", () => {
    expect(withSounds([{ ipa: "/tɪʃ/" }])).toMatchObject({ ipa: "/tɪʃ/", audioFile: null });
    expect(withSounds([recording("De-Tisch.ogg")])).toMatchObject({
      ipa: null,
      audioFile: "De-Tisch.ogg",
    });
  });

  it("ignores malformed sounds and recordings not hosted on upload.wikimedia.org", () => {
    const row = withSounds([
      { ipa: 42 },
      { audio: "De-Tisch.ogg", mp3_url: "https://example.com/De-Tisch.ogg.mp3" },
      { audio: "De-Tisch.ogg" },
      "nonsense",
      { ipa: "/tɪʃ/" },
    ]);
    // The entry itself is still kept.
    expect(row).toMatchObject({ lemma: "Tisch", ipa: "/tɪʃ/", audioFile: null, audioUrl: null });
  });
});
