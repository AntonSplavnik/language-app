import {
  type EntryView,
  LookupResponse,
  SuggestResponse,
  type WordStatus,
} from "@language-app/core";
import { beforeEach, describe, expect, it } from "vitest";
import { dictionaryEntries, dictionaryForms, users, userWords, words } from "../../src/db/schema";
import { loadDictionary } from "../../src/dictionary/load";
import { SIMILARITY_MIN } from "../../src/dictionary/search";
import { SINGLE_USER_ID } from "../../src/user";
import { buildTestApp } from "../helpers/app";
import { first, useTestDb } from "../helpers/db";

// The dictionary search for typed words (docs/design.md §6.7, §7 search, §9.3), against the sample
// cut from the real file (server/test/fixtures/kaikki-sample.jsonl).

const db = useTestDb();
const SAMPLE = new URL("../fixtures/kaikki-sample.jsonl", import.meta.url).pathname;

beforeEach(async () => {
  await loadDictionary(db, SAMPLE);
});

const app = () => buildTestApp(db);

async function suggest(q: string) {
  const res = await app().inject({
    method: "GET",
    url: `/api/dictionary/suggest?q=${encodeURIComponent(q)}`,
  });
  expect(res.statusCode).toBe(200);
  return SuggestResponse.parse(res.json()).suggestions;
}

async function lookup(q: string) {
  const res = await app().inject({
    method: "GET",
    url: `/api/dictionary/lookup?q=${encodeURIComponent(q)}`,
  });
  expect(res.statusCode).toBe(200);
  return LookupResponse.parse(res.json());
}

/** "der See", "gehen": how a view reads, to compare lists briefly. */
const headword = (view: Pick<EntryView, "lemma" | "article">) =>
  view.article ? `${view.article} ${view.lemma}` : view.lemma;

/** A word in the learner's list, as an import would have left it. Returns its user_words id. */
async function inMyList(
  lemma: string,
  pos: EntryView["pos"],
  article: EntryView["article"],
  { status = "learning", userId = SINGLE_USER_ID }: { status?: WordStatus; userId?: number } = {},
) {
  const word = first(
    await db
      .insert(words)
      .values({ language: "de", lemma, pos, article, checkStatus: "match" })
      .returning({ id: words.id }),
  );
  return first(
    await db
      .insert(userWords)
      .values({ userId, wordId: word.id, status })
      .returning({ id: userWords.id }),
  ).id;
}

async function otherLearner() {
  return first(
    await db
      .insert(users)
      .values({ name: "Other", learnerLanguage: "en", targetLanguage: "de" })
      .returning({ id: users.id }),
  ).id;
}

/** Extra dictionary entries for cases the sample doesn't cover. */
const addEntries = (...lemmas: string[]) =>
  db.insert(dictionaryEntries).values(lemmas.map((lemma) => ({ lemma, pos: "noun" as const })));

describe("GET /api/dictionary/suggest (§9.3)", () => {
  it("nothing under 2 letters", async () => {
    expect(await suggest("")).toEqual([]);
    expect(await suggest(" R ")).toEqual([]);
  });

  it("the entries starting with the letters: an exact match first, then shorter, ignoring case", async () => {
    expect((await suggest("tisch")).map(headword)).toEqual([
      "der Tisch",
      "der Tischler",
      "die Tischdecke",
    ]);
    expect((await suggest("REGEN")).map(headword)).toEqual([
      "der Regen",
      "der Regenschirm",
      "der Regenschauer",
    ]);
  });

  it("topped up with similar words when the letters start fewer than 3", async () => {
    // Regensch starts two entries; der Regen is similar (trigram similarity 0.5).
    expect((await suggest("Regensch")).map(headword)).toEqual([
      "der Regenschirm",
      "der Regenschauer",
      "der Regen",
    ]);
    // Nothing starts with a typo, so similar words are all there is.
    expect((await suggest("Regenschrim")).map(headword).slice(0, 2)).toEqual([
      "der Regenschirm",
      "der Regenschauer",
    ]);
  });

  it("at most 8", async () => {
    await addEntries(...Array.from({ length: 10 }, (_, i) => `Testwort${i}`));
    expect(await suggest("Testw")).toHaveLength(8);
  });

  it("a view per gender, with its glosses, plural and recording", async () => {
    const liter = await suggest("Liter");
    expect(liter.map(headword)).toEqual(["der Liter", "das Liter"]);
    expect(new Set(liter.map((v) => v.entryId)).size).toBe(1);
    expect(first(liter)).toMatchObject({ pos: "noun", plural: "Liter", glosses: ["liter, litre"] });

    const [tisch] = await suggest("Tisch");
    expect(tisch).toMatchObject({
      lemma: "Tisch",
      plural: "Tische",
      forms: null,
      ipa: "/tɪʃ/",
      audioUrl: expect.stringMatching(/De-Tisch2\.ogg\.mp3$/),
      inMyWords: null,
    });
    expect(tisch?.glosses.length).toBeLessThanOrEqual(3);
  });

  it("marks the words in the learner's list, in any status, with their id", async () => {
    const mine = await inMyList("Regenschirm", "noun", "der", { status: "ignored" });
    // die See is in the list, der See isn't; another learner's words don't count.
    const sea = await inMyList("See", "noun", "die");
    const theirs = await otherLearner();
    await inMyList("Regenschauer", "noun", "der", { userId: theirs });

    const regen = await suggest("Regensch");
    expect(regen.map((v) => [headword(v), v.inMyWords])).toEqual([
      ["der Regenschirm", mine],
      ["der Regenschauer", null],
      ["der Regen", null],
    ]);
    expect((await suggest("See")).map((v) => [headword(v), v.inMyWords])).toEqual(
      expect.arrayContaining([
        ["der See", null],
        ["die See", sea],
      ]),
    );
  });

  it("rejects more than 50 characters", async () => {
    const res = await app().inject({
      method: "GET",
      url: `/api/dictionary/suggest?q=${"x".repeat(51)}`,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/dictionary/lookup (§6.7, §9.3)", () => {
  it("first the entries whose lemma is the text, ignoring case: each meaning on its own", async () => {
    const see = await lookup("see");
    expect(see.entries.map((v) => [headword(v), v.glosses[0]])).toEqual([
      ["der See", "lake"],
      ["die See", "sea, ocean"],
    ]);
    expect(see.forms).toEqual([]);
    expect(see.similar).toEqual([]);

    // The same word in two cases: the exact case first.
    expect((await lookup("morgen")).entries.map((v) => `${headword(v)} (${v.pos})`)).toEqual([
      "morgen (adverb)",
      "der Morgen (noun)",
      "das Morgen (noun)",
    ]);
  });

  it("two entries of one word keep their own plural: die Bank bench → Bänke, bank → Banken", async () => {
    const bank = (await lookup("Bank")).entries;
    expect(bank.map((v) => [headword(v), v.plural, v.glosses[0]])).toEqual([
      ["die Bank", "Bänke", "bench (which people sit on); pew"],
      ["die Bank", "Banken", "bank (financial institution)"],
    ]);
  });

  it("then the base words the text is a form of", async () => {
    const ging = await lookup("ging");
    expect(ging.entries).toEqual([]);
    expect(ging.forms).toMatchObject([
      {
        lemma: "gehen",
        pos: "verb",
        entries: [
          {
            lemma: "gehen",
            forms: { praeteritum: "ging", partizip2: "gegangen", auxiliary: "sein" },
          },
        ],
      },
    ]);
    expect(ging.similar).toEqual([]);

    expect((await lookup("tische")).forms.map((f) => f.entries.map(headword))).toEqual([
      ["der Tisch"],
    ]);
    expect((await lookup("aufgestanden")).forms.map((f) => f.lemma)).toEqual(["aufstehen"]);
    // The base word's entries of the form's part of speech: schnell the adjective, not the adverb.
    expect((await lookup("schneller")).forms).toMatchObject([
      { lemma: "schnell", pos: "adjective", entries: [{ lemma: "schnell", pos: "adjective" }] },
    ]);
    // A plural of a word with two entries offers both.
    expect((await lookup("Banken")).forms.flatMap((f) => f.entries.map((v) => v.plural))).toEqual([
      "Bänke",
      "Banken",
    ]);
  });

  it("a base word the dictionary has no entry for is left out", async () => {
    await db.insert(dictionaryForms).values({ form: "Xyzformen", lemma: "Xyzform", pos: "noun" });
    expect((await lookup("Xyzformen")).forms).toEqual([]);
  });

  it("last, up to 5 similar words, the most similar first", async () => {
    for (const typo of ["Regenschrim", "Rgenschirm", "regenschirn"]) {
      const result = await lookup(typo);
      expect(result.entries).toEqual([]);
      expect(result.forms).toEqual([]);
      expect(result.similar.map(headword)[0]).toBe("der Regenschirm");
    }
    await addEntries(...Array.from({ length: 8 }, (_, i) => `Regenschirm${i}`));
    expect((await lookup("Regenschrim")).similar).toHaveLength(5);
  });

  it(`only words at least ${SIMILARITY_MIN} similar`, async () => {
    // Against "tischdeke": Tischbein 0.33, Tischtennis 0.29.
    await addEntries("Tischbein", "Tischtennis");
    expect((await lookup("Tischdeke")).similar.map((v) => v.lemma)).toEqual([
      "Tischdecke",
      "Tisch",
      "Tischler",
      "Tischbein",
    ]);
    expect((await lookup("Quatschwort")).similar).toEqual([]);
  });

  it("marks the words in the learner's list in every part of the answer", async () => {
    const lake = await inMyList("See", "noun", "der");
    const go = await inMyList("gehen", "verb", null);
    const umbrella = await inMyList("Regenschirm", "noun", "der");

    expect((await lookup("See")).entries.map((v) => v.inMyWords)).toEqual([lake, null]);
    expect((await lookup("ging")).forms[0]?.entries[0]?.inMyWords).toBe(go);
    expect((await lookup("Regenschrim")).similar[0]?.inMyWords).toBe(umbrella);
  });

  it("finds nothing at all when the dictionary isn't loaded", async () => {
    await db.delete(dictionaryEntries);
    await db.delete(dictionaryForms);
    expect(await lookup("Tisch")).toEqual({ entries: [], forms: [], similar: [] });
    expect(await suggest("Tisch")).toEqual([]);
  });

  it("needs 1 to 50 characters", async () => {
    for (const url of [
      "/api/dictionary/lookup",
      "/api/dictionary/lookup?q=%20%20",
      `/api/dictionary/lookup?q=${"x".repeat(51)}`,
    ]) {
      const res = await app().inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: "invalid_request" } });
    }
  });
});
