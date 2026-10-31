import { describe, expect, it } from "vitest";
import { CardResultRequest, SessionSummary } from "../src";

const answer = {
  userWordId: 4,
  result: "didnt_know" as const,
  flipped: false,
  flipMs: null,
  answerMs: 1200,
};

describe("CardResultRequest's round (§8.4)", () => {
  it("is 1 when left out, so a tab open across a deploy still works", () => {
    expect(CardResultRequest.parse(answer).round).toBe(1);
  });

  it("keeps the round it is given", () => {
    expect(CardResultRequest.parse({ ...answer, round: 3 }).round).toBe(3);
  });

  it("takes positive integers only", () => {
    for (const round of [0, -1, 1.5, "2", null]) {
      expect(CardResultRequest.safeParse({ ...answer, round }).success, String(round)).toBe(false);
    }
  });
});

describe("SessionSummary's rounds (§8.6)", () => {
  const summary = { knew: 2, didntKnow: 1, skipped: 0, missed: [], rounds: 3, stillMissed: 0 };

  it("has the rounds and the words still missed", () => {
    expect(SessionSummary.parse(summary)).toEqual(summary);
  });

  it("needs both", () => {
    const { rounds: _rounds, ...noRounds } = summary;
    const { stillMissed: _stillMissed, ...noStillMissed } = summary;
    expect(SessionSummary.safeParse(noRounds).success).toBe(false);
    expect(SessionSummary.safeParse(noStillMissed).success).toBe(false);
  });

  it("counts at least one round, and no negative words", () => {
    expect(SessionSummary.safeParse({ ...summary, rounds: 0 }).success).toBe(false);
    expect(SessionSummary.safeParse({ ...summary, stillMissed: -1 }).success).toBe(false);
  });
});
