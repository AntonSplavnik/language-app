import { describe, expect, it } from "vitest";
import { knewOf, resultShares, roundsLine } from "../src/practice/summary";

describe("Summary results (§8.6)", () => {
  it("counts the cards knew out of every card answered, skipped ones included", () => {
    expect(knewOf({ knew: 14, didntKnow: 4, skipped: 2 })).toEqual({ knew: 14, of: 20 });
    expect(knewOf({ knew: 0, didntKnow: 3, skipped: 0 })).toEqual({ knew: 0, of: 3 });
    expect(knewOf({ knew: 0, didntKnow: 0, skipped: 5 })).toEqual({ knew: 0, of: 5 });
  });

  it("has no headline for a session without cards", () => {
    expect(knewOf({ knew: 0, didntKnow: 0, skipped: 0 })).toBeNull();
  });

  it("splits the bar in the order knew, didn't know, skipped", () => {
    expect(resultShares({ knew: 14, didntKnow: 4, skipped: 2 })).toEqual([
      { result: "knew", count: 14 },
      { result: "didnt_know", count: 4 },
      { result: "skipped", count: 2 },
    ]);
  });

  it("leaves out the answers nobody gave", () => {
    expect(resultShares({ knew: 20, didntKnow: 0, skipped: 0 })).toEqual([
      { result: "knew", count: 20 },
    ]);
    expect(resultShares({ knew: 0, didntKnow: 2, skipped: 1 })).toEqual([
      { result: "didnt_know", count: 2 },
      { result: "skipped", count: 1 },
    ]);
    expect(resultShares({ knew: 0, didntKnow: 0, skipped: 0 })).toEqual([]);
  });
});

describe("Summary's line (§8.6)", () => {
  const summary = { knew: 3, didntKnow: 2, skipped: 1, rounds: 1, stillMissed: 0 };

  it("says how many words the learner stopped with", () => {
    expect(roundsLine({ ...summary, rounds: 2, stillMissed: 5 })).toBe("5 words still missed");
    expect(roundsLine({ ...summary, rounds: 3, stillMissed: 1 })).toBe("1 word still missed");
  });

  it("says it after stopping before any repeat, too", () => {
    expect(roundsLine({ ...summary, rounds: 1, stillMissed: 2 })).toBe("2 words still missed");
  });

  it("says how many rounds it took when none are left", () => {
    expect(roundsLine({ ...summary, rounds: 3 })).toBe("Done in 3 rounds");
    expect(roundsLine({ ...summary, rounds: 2 })).toBe("Done in 2 rounds");
  });

  it("says when nothing was missed", () => {
    expect(roundsLine({ ...summary, didntKnow: 0 })).toBe("No words missed");
    expect(roundsLine({ ...summary, didntKnow: 0, skipped: 0 })).toBe("No words missed");
  });

  it("has no line when every card was skipped, or there were none", () => {
    expect(roundsLine({ knew: 0, didntKnow: 0, skipped: 4, rounds: 1, stillMissed: 0 })).toBeNull();
    expect(roundsLine({ knew: 0, didntKnow: 0, skipped: 0, rounds: 1, stillMissed: 0 })).toBeNull();
  });
});
