import { describe, expect, it } from "vitest";
import { type HighlightWord, highlightWord } from "../src";

const anruf: HighlightWord = { lemma: "Anruf", pos: "noun", plural: "Anrufe", forms: null };
const haus: HighlightWord = { lemma: "Haus", pos: "noun", plural: "Häuser", forms: null };
const gehen: HighlightWord = {
  lemma: "gehen",
  pos: "verb",
  plural: null,
  forms: { praeteritum: "ging", partizip2: "gegangen", auxiliary: "sein" },
};
const an: HighlightWord = { lemma: "an", pos: "preposition", plural: null, forms: null };

/** The bold words of a sentence, in order. */
const bold = (sentence: string, word: HighlightWord) =>
  highlightWord(sentence, word)
    .filter((segment) => segment.bold)
    .map((segment) => segment.text);

describe("highlightWord (§10 Word detail)", () => {
  it("bolds the word itself and splits the sentence around it", () => {
    expect(highlightWord("Ich habe gestern einen Anruf bekommen.", anruf)).toEqual([
      { text: "Ich habe gestern einen ", bold: false },
      { text: "Anruf", bold: true },
      { text: " bekommen.", bold: false },
    ]);
  });

  it("bolds a noun with a short ending or its plural", () => {
    expect(bold("Wegen des Anrufs kam er zu spät.", anruf)).toEqual(["Anrufs"]);
    expect(bold("Ich warte auf zwei Anrufe.", anruf)).toEqual(["Anrufe"]);
    expect(bold("Nach den Anrufen war sie müde.", anruf)).toEqual(["Anrufen"]);
  });

  it("finds a plural with an umlaut through the stored plural", () => {
    expect(bold("Die Häuser sind alt.", haus)).toEqual(["Häuser"]);
    expect(bold("Ich gehe nach Hause.", haus)).toEqual(["Hause"]);
  });

  it("does not bold a compound that only starts with the word", () => {
    expect(bold("Der Anrufbeantworter ist voll.", anruf)).toEqual([]);
    expect(bold("Wir machen Hausaufgaben.", haus)).toEqual([]);
  });

  it("bolds verbs in the present, the Präteritum and the Partizip II", () => {
    expect(bold("Ich gehe nach Hause.", gehen)).toEqual(["gehe"]);
    expect(bold("Er geht und du gehst.", gehen)).toEqual(["geht", "gehst"]);
    expect(bold("Sie ging früh, wir gingen später.", gehen)).toEqual(["ging", "gingen"]);
    expect(bold("Wir sind nach Hause gegangen.", gehen)).toEqual(["gegangen"]);
    expect(bold("Gehen wir?", gehen)).toEqual(["Gehen"]);
  });

  it("finds the stem of a verb ending in -n without -en", () => {
    const wandern: HighlightWord = {
      lemma: "wandern",
      pos: "verb",
      plural: null,
      forms: { praeteritum: "wanderte", partizip2: "gewandert", auxiliary: "sein" },
    };
    expect(bold("Er wandert gern, gestern ist er weit gewandert.", wandern)).toEqual([
      "wandert",
      "gewandert",
    ]);
  });

  it("a short word matches only itself, never the start of a longer one", () => {
    expect(bold("Am Abend kam ein Anruf an.", an)).toEqual(["an"]);
    expect(bold("Er rief an, aber niemand war da.", an)).toEqual(["an"]);
  });

  it("ignores case", () => {
    expect(bold("ANRUF! Ein anruf für dich.", anruf)).toEqual(["ANRUF", "anruf"]);
    expect(bold("Die HÄUSER stehen leer.", haus)).toEqual(["HÄUSER"]);
  });

  it("bolds every occurrence", () => {
    expect(highlightWord("Anruf um Anruf.", anruf)).toEqual([
      { text: "Anruf", bold: true },
      { text: " um ", bold: false },
      { text: "Anruf", bold: true },
      { text: ".", bold: false },
    ]);
  });

  it("returns the whole sentence as one plain segment when nothing matches", () => {
    expect(highlightWord("Das ist alles.", anruf)).toEqual([
      { text: "Das ist alles.", bold: false },
    ]);
  });

  it("matches a lemma of several words as a phrase", () => {
    const beispiel: HighlightWord = {
      lemma: "zum Beispiel",
      pos: "adverb",
      plural: null,
      forms: null,
    };
    expect(bold("Obst, Zum  Beispiel Äpfel.", beispiel)).toEqual(["Zum  Beispiel"]);
    expect(bold("Ein Beispiel zum Lernen.", beispiel)).toEqual([]);
  });

  it("matches a separable verb's Präteritum when its parts stand together", () => {
    const anfangen: HighlightWord = {
      lemma: "anfangen",
      pos: "verb",
      plural: null,
      forms: { praeteritum: "fing an", partizip2: "angefangen", auxiliary: "haben" },
    };
    expect(bold("Der Film fing an.", anfangen)).toEqual(["fing an"]);
    expect(bold("Wir haben angefangen.", anfangen)).toEqual(["angefangen"]);
    // Known limit: the split present tense is not found.
    expect(bold("Ich fange morgen an.", anfangen)).toEqual([]);
  });

  it("always gives back exactly the sentence it was given", () => {
    const sentences = [
      "Ich habe gestern einen Anruf bekommen.",
      "„Anrufe?“ – „Ja, drei Anrufe!“",
      "",
      "Anruf",
      "   ",
      "Er ging, sie gingen; alle sind gegangen.",
    ];
    for (const sentence of sentences) {
      for (const word of [anruf, gehen, haus, an]) {
        const segments = highlightWord(sentence, word);
        expect(segments.map((segment) => segment.text).join("")).toBe(sentence);
      }
    }
  });
});
