import type { Candidate, ExtractedWord } from "@language-app/core";
import { describe, expect, it } from "vitest";
import { candidateKey, newCandidateWords } from "../../src/imports/candidates";

const word = (
  lemma: string,
  pos: ExtractedWord["pos"],
  article: ExtractedWord["article"],
  translation: string,
): ExtractedWord => ({ lemma, pos, article, translation });

const existing = (w: ExtractedWord, photoIndex = 0): Candidate => ({
  ...w,
  key: candidateKey(w),
  photoIndex,
  existing: "none",
  dictionary: { status: "match" },
});

describe("candidateKey (§6.3)", () => {
  it("is lemma|pos|article, with an empty article for non-nouns", () => {
    expect(candidateKey(word("Tisch", "noun", "der", "table"))).toBe("Tisch|noun|der");
    expect(candidateKey(word("gehen", "verb", null, "to go"))).toBe("gehen|verb|");
  });
});

describe("newCandidateWords", () => {
  it("turns extracted words into candidates for this photo", () => {
    expect(newCandidateWords([], [word("Tisch", "noun", "der", "table")], 2)).toEqual([
      {
        key: "Tisch|noun|der",
        lemma: "Tisch",
        pos: "noun",
        article: "der",
        translation: "table",
        photoIndex: 2,
      },
    ]);
  });

  it("merges duplicates within a photo; the first translation wins", () => {
    const result = newCandidateWords(
      [],
      [word("Tisch", "noun", "der", "table"), word("Tisch", "noun", "der", "desk")],
      0,
    );
    expect(result.map((c) => c.translation)).toEqual(["table"]);
  });

  it("leaves out words already in the import from an earlier photo", () => {
    const earlier = [existing(word("Tisch", "noun", "der", "table"))];
    const result = newCandidateWords(
      earlier,
      [word("Tisch", "noun", "der", "desk"), word("gehen", "verb", null, "to go")],
      1,
    );
    expect(result.map((c) => c.key)).toEqual(["gehen|verb|"]);
  });

  it("the same lemma with another article is another candidate: der See, die See", () => {
    const result = newCandidateWords(
      [],
      [word("See", "noun", "der", "lake"), word("See", "noun", "die", "sea")],
      0,
    );
    expect(result.map((c) => c.key)).toEqual(["See|noun|der", "See|noun|die"]);
  });

  it("tidies what the AI returned: trims, drops articles on non-nouns and empty lemmas", () => {
    const result = newCandidateWords(
      [],
      [word("  schnell ", "adjective", "das", " fast "), word(" ", "noun", "der", "nothing")],
      0,
    );
    expect(result).toEqual([
      {
        key: "schnell|adjective|",
        lemma: "schnell",
        pos: "adjective",
        article: null,
        translation: "fast",
        photoIndex: 0,
      },
    ]);
  });
});
