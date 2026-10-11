import type { CardResult, LastResult, WordStatus } from "./schemas/common";

/** Correct answers in a row that mark a word as learned (§8.5). */
export const LEARNED_STREAK = 3;

/** The progress fields of a `user_words` row. */
export type Progress = {
  status: WordStatus;
  timesSeen: number;
  timesCorrect: number;
  correctStreak: number;
  lastResult: LastResult | null;
  lastPracticedAt: Date | null;
};

/** Applies one flashcard answer to a word's progress (§8.5). Returns a new object. */
export function applyResult(progress: Progress, result: CardResult, now: Date): Progress {
  // Ignored words are never practised; if one slips through, its status must not change.
  const canChangeStatus = progress.status !== "ignored";

  switch (result) {
    case "skipped":
      return progress;

    case "knew": {
      const correctStreak = progress.correctStreak + 1;
      return {
        status: canChangeStatus && correctStreak >= LEARNED_STREAK ? "learned" : progress.status,
        timesSeen: progress.timesSeen + 1,
        timesCorrect: progress.timesCorrect + 1,
        correctStreak,
        lastResult: "knew",
        lastPracticedAt: now,
      };
    }

    case "didnt_know":
      return {
        status: canChangeStatus && progress.status === "learned" ? "learning" : progress.status,
        timesSeen: progress.timesSeen + 1,
        timesCorrect: progress.timesCorrect,
        correctStreak: 0,
        lastResult: "didnt_know",
        lastPracticedAt: now,
      };
  }
}
