import { describe, expect, it } from "vitest";
import { countsText, hasWords, practiceText } from "../src/words/counts";

describe("Home (§10)", () => {
  it("sums up the words on the My words card", () => {
    expect(countsText({ learning: 136, learned: 0 })).toBe("136 learning · 0 learned");
    expect(countsText({ learning: 0, learned: 0 })).toBe("0 learning · 0 learned");
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
