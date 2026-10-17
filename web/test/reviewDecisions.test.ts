import type { Candidate } from "@language-app/core";
import { describe, expect, it } from "vitest";
import {
  BULK_LABELS,
  choiceLabel,
  countAdds,
  initialDecisions,
  reviewReducer,
  reviewSummary,
  saveLabel,
  toSaveDecisions,
} from "../src/state/reviewDecisions";

const candidate = (key: string, overrides: Partial<Candidate> = {}): Candidate => {
  const [lemma = "", pos = "noun", article = ""] = key.split("|");
  return {
    key,
    lemma,
    pos: pos as Candidate["pos"],
    article: (article || null) as Candidate["article"],
    translation: lemma.toLowerCase(),
    photoIndex: 0,
    existing: "none",
    dictionary: { status: "match" },
    ...overrides,
  };
};

const tisch = candidate("Tisch|noun|der");
const zeitung = candidate("Zeitung|noun|der", {
  dictionary: { status: "mismatch", genders: ["die"] },
});
const und = candidate("und|conjunction|");
const known = candidate("gehen|verb|", { existing: "in_my_words" });
const candidates = [tisch, zeitung, und, known];

describe("review decisions (§6.4)", () => {
  it("every new word starts as Add; words already in my list are not part of the review", () => {
    const decisions = initialDecisions(candidates);
    expect(decisions).toEqual({
      "Tisch|noun|der": { action: "add" },
      "Zeitung|noun|der": { action: "add" },
      "und|conjunction|": { action: "add" },
    });
    expect(countAdds(decisions)).toBe(3);
  });

  it("tapping a row toggles Add and Skip", () => {
    const once = reviewReducer(initialDecisions(candidates), {
      type: "toggle",
      key: "und|conjunction|",
    });
    expect(once["und|conjunction|"]?.action).toBe("skip");
    const twice = reviewReducer(once, { type: "toggle", key: "und|conjunction|" });
    expect(twice["und|conjunction|"]?.action).toBe("add");
  });

  it("Add all / Skip all set every word and keep applied articles", () => {
    let decisions = reviewReducer(initialDecisions(candidates), {
      type: "applyArticle",
      key: "Zeitung|noun|der",
      article: "die",
    });
    decisions = reviewReducer(decisions, { type: "setAll", action: "skip" });
    expect(Object.values(decisions).map((d) => d.action)).toEqual(["skip", "skip", "skip"]);
    expect(decisions["Zeitung|noun|der"]?.article).toBe("die");
    expect(countAdds(reviewReducer(decisions, { type: "setAll", action: "add" }))).toBe(3);
  });

  it("applying the dictionary article can be undone", () => {
    const applied = reviewReducer(initialDecisions(candidates), {
      type: "applyArticle",
      key: "Zeitung|noun|der",
      article: "die",
    });
    expect(applied["Zeitung|noun|der"]).toEqual({ action: "add", article: "die" });
    const undone = reviewReducer(applied, { type: "clearArticle", key: "Zeitung|noun|der" });
    expect(undone["Zeitung|noun|der"]).toEqual({ action: "add" });
  });

  it("the save payload keeps the original key and carries the applied article", () => {
    let decisions = initialDecisions(candidates);
    decisions = reviewReducer(decisions, {
      type: "applyArticle",
      key: "Zeitung|noun|der",
      article: "die",
    });
    decisions = reviewReducer(decisions, { type: "toggle", key: "und|conjunction|" });

    expect(toSaveDecisions(candidates, decisions)).toEqual([
      { key: "Tisch|noun|der", action: "add" },
      { key: "Zeitung|noun|der", action: "add", article: "die" },
      { key: "und|conjunction|", action: "skip" },
    ]);
  });

  it("restores saved decisions for words still in the review and ignores stale ones", () => {
    const saved = {
      "und|conjunction|": { action: "skip" as const },
      "Zeitung|noun|der": { action: "add" as const, article: "die" as const },
      "Weg|noun|der": { action: "skip" as const }, // no longer a candidate
      "gehen|verb|": { action: "skip" as const }, // now in my words
    };
    expect(initialDecisions(candidates, saved)).toEqual({
      "Tisch|noun|der": { action: "add" },
      "Zeitung|noun|der": { action: "add", article: "die" },
      "und|conjunction|": { action: "skip" },
    });
  });

  it("a saved article that the dictionary does not offer is dropped", () => {
    const saved = { "Zeitung|noun|der": { action: "add" as const, article: "das" as const } };
    expect(initialDecisions(candidates, saved)["Zeitung|noun|der"]).toEqual({ action: "add" });
  });
});

describe("Review wording: Practice / Ignore (§6.4, §10 screen 3)", () => {
  it("each word is Practice or Ignore; the API keeps add and skip", () => {
    expect(choiceLabel("add")).toBe("Practice");
    expect(choiceLabel("skip")).toBe("Ignore");
    expect(BULK_LABELS).toEqual({ add: "Practice all", skip: "Ignore all" });
  });

  it("the summary counts the words to practise", () => {
    expect(reviewSummary(9, 8)).toEqual({ fresh: "9 new words", adds: "8 to practise" });
    expect(reviewSummary(1, 0)).toEqual({ fresh: "1 new word", adds: "0 to practise" });
  });

  it("the save button says what saving does", () => {
    expect(saveLabel({ adds: 8, fresh: 9, saving: false })).toBe("Save 8 words");
    expect(saveLabel({ adds: 1, fresh: 9, saving: false })).toBe("Save 1 word");
    expect(saveLabel({ adds: 0, fresh: 9, saving: false })).toBe("Ignore all 9 words");
    expect(saveLabel({ adds: 0, fresh: 1, saving: false })).toBe("Ignore 1 word");
    expect(saveLabel({ adds: 0, fresh: 0, saving: false })).toBe("Finish");
    expect(saveLabel({ adds: 8, fresh: 9, saving: true })).toBe("Adding details…");
    expect(saveLabel({ adds: 0, fresh: 9, saving: true })).toBe("Saving…");
  });
});
