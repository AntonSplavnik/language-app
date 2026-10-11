import { describe, expect, it } from "vitest";
import { applyResult, type Progress } from "../src";

const now = new Date("2026-10-11T12:00:00Z");
const earlier = new Date("2026-10-10T08:00:00Z");

const fresh: Progress = {
  status: "learning",
  timesSeen: 0,
  timesCorrect: 0,
  correctStreak: 0,
  lastResult: null,
  lastPracticedAt: null,
};

describe("applyResult (§8.5)", () => {
  it("knew: counts the answer and extends the streak", () => {
    expect(applyResult(fresh, "knew", now)).toEqual({
      status: "learning",
      timesSeen: 1,
      timesCorrect: 1,
      correctStreak: 1,
      lastResult: "knew",
      lastPracticedAt: now,
    });
  });

  it("knew: the third correct answer in a row marks the word learned", () => {
    const afterTwo = { ...fresh, timesSeen: 2, timesCorrect: 2, correctStreak: 2 };
    const result = applyResult(afterTwo, "knew", now);
    expect(result.correctStreak).toBe(3);
    expect(result.status).toBe("learned");
  });

  it("knew: two in a row is not enough", () => {
    const afterOne = { ...fresh, timesSeen: 1, timesCorrect: 1, correctStreak: 1 };
    expect(applyResult(afterOne, "knew", now).status).toBe("learning");
  });

  it("knew: a learned word stays learned and its streak keeps growing", () => {
    const learned = { ...fresh, status: "learned" as const, correctStreak: 3 };
    const result = applyResult(learned, "knew", now);
    expect(result.status).toBe("learned");
    expect(result.correctStreak).toBe(4);
  });

  it("didnt_know: counts a view, resets the streak, keeps the correct count", () => {
    const progress = { ...fresh, timesSeen: 4, timesCorrect: 3, correctStreak: 2 };
    expect(applyResult(progress, "didnt_know", now)).toEqual({
      status: "learning",
      timesSeen: 5,
      timesCorrect: 3,
      correctStreak: 0,
      lastResult: "didnt_know",
      lastPracticedAt: now,
    });
  });

  it("didnt_know: a learned word goes back to learning", () => {
    const learned = { ...fresh, status: "learned" as const, correctStreak: 5 };
    expect(applyResult(learned, "didnt_know", now).status).toBe("learning");
  });

  it("skipped: changes nothing, not even the last result or practice time", () => {
    const progress = {
      ...fresh,
      timesSeen: 2,
      correctStreak: 1,
      lastResult: "knew" as const,
      lastPracticedAt: earlier,
    };
    expect(applyResult(progress, "skipped", now)).toEqual(progress);
  });

  it("never changes the status of an ignored word", () => {
    const ignored = { ...fresh, status: "ignored" as const, correctStreak: 2 };
    expect(applyResult(ignored, "knew", now).status).toBe("ignored");
    expect(applyResult(ignored, "didnt_know", now).status).toBe("ignored");
  });

  it("does not mutate its input", () => {
    const progress = { ...fresh };
    applyResult(progress, "knew", now);
    expect(progress).toEqual(fresh);
  });
});
