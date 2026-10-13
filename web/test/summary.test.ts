import { describe, expect, it } from "vitest";
import { knewOf, resultShares } from "../src/practice/summary";

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
