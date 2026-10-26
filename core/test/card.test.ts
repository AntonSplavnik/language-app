import { describe, expect, it } from "vitest";
import { cardBack, cardFront, displayTranslation, formsText, type WordView } from "../src";

describe("formsText (§8.2, §10 screen 15)", () => {
  it("writes a dictionary entry's forms as the card back does", () => {
    expect(formsText({ pos: "noun", plural: "Banken", forms: null })).toBe("pl. die Banken");
    expect(
      formsText({
        pos: "verb",
        plural: null,
        forms: { praeteritum: "ging", partizip2: "gegangen", auxiliary: "sein" },
      }),
    ).toBe("ging · ist gegangen");
    expect(formsText({ pos: "adverb", plural: null, forms: null })).toBeNull();
    expect(formsText({ pos: "noun", plural: null, forms: null })).toBeNull();
  });
});

const tisch: WordView = {
  userWordId: 1,
  lemma: "Tisch",
  pos: "noun",
  article: "der",
  plural: "Tische",
  forms: null,
  translation: "table",
  customTranslation: null,
  exampleDe: "Der Tisch steht in der Küche.",
  exampleTranslation: "The table is in the kitchen.",
  note: null,
  enriched: true,
  ipa: "/tɪʃ/",
  audioFile: "De-Tisch2.ogg",
  audioUrl:
    "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/de/De-Tisch2.ogg/De-Tisch2.ogg.mp3",
};

const gehen: WordView = {
  ...tisch,
  lemma: "gehen",
  pos: "verb",
  article: null,
  plural: null,
  forms: { praeteritum: "ging", partizip2: "gegangen", auxiliary: "sein" },
  translation: "to go",
  exampleDe: "Ich gehe nach Hause.",
  exampleTranslation: "I am going home.",
};

describe("displayTranslation", () => {
  it("uses the learner's own translation when set", () => {
    expect(displayTranslation({ ...tisch, customTranslation: "desk" })).toBe("desk");
  });

  it("falls back to the stored translation when the custom one is empty or blank", () => {
    expect(displayTranslation(tisch)).toBe("table");
    expect(displayTranslation({ ...tisch, customTranslation: "  " })).toBe("table");
  });
});

describe("cardFront (§8.2)", () => {
  it("shows the translation and part of speech", () => {
    expect(cardFront(tisch)).toEqual({ translation: "table", pos: "noun" });
  });

  it("prefers the custom translation", () => {
    expect(cardFront({ ...tisch, customTranslation: "desk" }).translation).toBe("desk");
  });
});

describe("cardBack (§8.2)", () => {
  it("noun: article + lemma, and the plural with die", () => {
    expect(cardBack(tisch)).toEqual({
      headword: "der Tisch",
      forms: "pl. die Tische",
      example: { de: "Der Tisch steht in der Küche.", translation: "The table is in the kitchen." },
      note: null,
      detailsPending: false,
      audioUrl: tisch.audioUrl,
    });
  });

  it("offers the recording only when Wiktionary has one", () => {
    expect(cardBack(tisch).audioUrl).toMatch(/De-Tisch2\.ogg\.mp3$/);
    expect(cardBack({ ...tisch, audioFile: null, audioUrl: null }).audioUrl).toBeNull();
  });

  it("noun without a plural shows no forms line", () => {
    expect(cardBack({ ...tisch, lemma: "Milch", article: "die", plural: null }).forms).toBeNull();
  });

  it("verb: lemma, then Präteritum · auxiliary + Partizip II", () => {
    const back = cardBack(gehen);
    expect(back.headword).toBe("gehen");
    expect(back.forms).toBe("ging · ist gegangen");
  });

  it("verb with haben uses hat", () => {
    const machen = {
      ...gehen,
      lemma: "machen",
      forms: { praeteritum: "machte", partizip2: "gemacht", auxiliary: "haben" as const },
    };
    expect(cardBack(machen).forms).toBe("machte · hat gemacht");
  });

  it("other parts of speech: just the lemma", () => {
    const schnell = { ...tisch, lemma: "schnell", pos: "adjective" as const, article: null };
    const back = cardBack({ ...schnell, plural: null });
    expect(back.headword).toBe("schnell");
    expect(back.forms).toBeNull();
  });

  it("includes the learner's note", () => {
    expect(cardBack({ ...tisch, note: "from lesson 4" }).note).toBe("from lesson 4");
  });

  it("not enriched yet: shows what is available and flags details as pending", () => {
    const pending = {
      ...tisch,
      plural: null,
      exampleDe: null,
      exampleTranslation: null,
      enriched: false,
      ipa: null,
      audioFile: null,
      audioUrl: null,
    };
    expect(cardBack(pending)).toEqual({
      headword: "der Tisch",
      forms: null,
      example: null,
      note: null,
      detailsPending: true,
      audioUrl: null,
    });
  });

  it("for an account without AI nothing is pending: there is nothing to add the details with", () => {
    const pending = { ...tisch, exampleDe: null, exampleTranslation: null, enriched: false };
    expect(cardBack(pending, { aiEnabled: false })).toMatchObject({
      example: null,
      detailsPending: false,
    });
    // A shared word someone else's AI enriched still shows its example.
    expect(cardBack(tisch, { aiEnabled: false }).example?.de).toBe("Der Tisch steht in der Küche.");
  });
});
