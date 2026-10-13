import { describe, expect, it } from "vitest";
import { countsText, deckSummary, hasWords, practiceText } from "../src/words/counts";

describe("Home (§10)", () => {
  it("sums up the words on the My words card", () => {
    expect(countsText({ learning: 136, learned: 0 })).toBe("136 learning · 0 learned");
    expect(countsText({ learning: 0, learned: 0 })).toBe("0 learning · 0 learned");
  });

  it("counts the deck: every word not ignored, and the share learned", () => {
    expect(deckSummary({ learning: 149, learned: 0 })).toEqual({ total: 149, learnedPercent: 0 });
    expect(deckSummary({ learning: 30, learned: 10 })).toEqual({ total: 40, learnedPercent: 25 });
    expect(deckSummary({ learning: 0, learned: 7 })).toEqual({ total: 7, learnedPercent: 100 });
  });

  it("rounds the learned share down, so it never shows 100% early or 1% too soon", () => {
    expect(deckSummary({ learning: 1, learned: 199 }).learnedPercent).toBe(99);
    expect(deckSummary({ learning: 2, learned: 1 }).learnedPercent).toBe(33);
    expect(deckSummary({ learning: 149, learned: 1 }).learnedPercent).toBe(0);
  });

  it("an empty deck is 0% learned", () => {
    expect(deckSummary({ learning: 0, learned: 0 })).toEqual({ total: 0, learnedPercent: 0 });
  });

  it("says what Practice draws from: the words still being learned", () => {
    expect(practiceText({ learning: 136, learned: 12 })).toBe("136 words to practise");
    expect(practiceText({ learning: 1, learned: 0 })).toBe("1 word to practise");
  });

  it("offers a review once every word is learned", () => {
    expect(practiceText({ learning: 0, learned: 5 })).toBe("Review learned words");
  });

  it("has nothing to practise without words", () => {
    expect(practiceText({ learning: 0, learned: 0 })).toBeNull();
    expect(hasWords({ learning: 0, learned: 0 })).toBe(false);
    expect(hasWords({ learning: 0, learned: 1 })).toBe(true);
  });
});
