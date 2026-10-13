import {
  type CheckStatus,
  cardBack,
  LEARNED_STREAK,
  type WordDetail,
  type WordListItem,
} from "@language-app/core";

/** The short progress text on a My words row, and what a screen reader says instead. */
export type ProgressLabel = { kind: "new" | "streak"; text: string; spoken: string };

export function progressLabel(
  word: Pick<WordListItem, "status" | "timesSeen" | "correctStreak">,
): ProgressLabel | null {
  // Learned words need no mark (their tab says it), and ignored words are never practised.
  if (word.status !== "learning") return null;
  if (word.timesSeen === 0) return { kind: "new", text: "new", spoken: "Not practised yet" };
  const inARow = Math.min(word.correctStreak, LEARNED_STREAK);
  return {
    kind: "streak",
    text: `${inARow}/${LEARNED_STREAK}`,
    spoken: `${inARow} of ${LEARNED_STREAK} right in a row`,
  };
}

/**
 * Right answers in a row towards learned, as bars on Word detail (§10). Unlike the list's mark, a
 * word never practised shows the empty bars rather than "new".
 */
export type StreakLabel = { filled: number; text: string; spoken: string };

export function streakLabel(
  word: Pick<WordDetail, "status" | "correctStreak">,
): StreakLabel | null {
  if (word.status !== "learning") return null;
  const filled = Math.min(word.correctStreak, LEARNED_STREAK);
  return {
    filled,
    text: `${filled}/${LEARNED_STREAK}`,
    spoken: `${filled} of ${LEARNED_STREAK} right in a row`,
  };
}

/** How the word was checked against the dictionary when it was saved (§6.3, §6.5). */
export function checkLabel(check: CheckStatus): { text: string; warning: boolean } {
  switch (check) {
    case "match":
      return { text: "Found in Wiktionary", warning: false };
    case "mismatch_fixed":
      return { text: "Article corrected to match Wiktionary", warning: false };
    case "mismatch_kept":
      return { text: "Wiktionary gives a different article; the AI's was kept", warning: true };
    case "not_in_dictionary":
      return { text: "Not in Wiktionary, so the grammar comes from the AI", warning: false };
  }
}

/**
 * The one line on Word detail about where the word's grammar came from, only when it is worth
 * knowing (§10): an article Wiktionary disagrees with, or forms the AI wrote. Null for the usual
 * case, a word found in Wiktionary with its forms from there.
 */
export function sourceNote(word: WordDetail): { text: string; warning: boolean } | null {
  if (word.checkStatus !== "match") return checkLabel(word.checkStatus);
  if (word.formsSource === "ai" && cardBack(word).forms) {
    return { text: "Forms from AI", warning: false };
  }
  return null;
}

/** "Seen 4 times · Last: didn't know, yesterday · Added 3 Oct" (§10 Word detail). */
export function historyLine(
  word: Pick<WordDetail, "timesSeen" | "lastResult" | "lastPracticedAt" | "addedAt">,
  now: Date = new Date(),
): string {
  const parts = [`Seen ${word.timesSeen} ${word.timesSeen === 1 ? "time" : "times"}`];
  if (word.lastPracticedAt) {
    const result = word.lastResult === "knew" ? "knew it" : "didn't know";
    parts.push(`Last: ${result}, ${dayText(word.lastPracticedAt, now)}`);
  }
  parts.push(`Added ${dayText(word.addedAt, now)}`);
  return parts.join(" · ");
}

const DAY_MS = 24 * 60 * 60 * 1000;
const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** "today", "yesterday", "3 days ago" within a week, otherwise the date. */
export function dayText(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  // Rounded, because a day with a clock change is 23 or 25 hours long.
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days > 1 && days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}
