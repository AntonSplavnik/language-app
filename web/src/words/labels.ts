import {
  type CheckStatus,
  type FormsSource,
  LEARNED_STREAK,
  type WordListItem,
} from "@language-app/core";

/** The small progress mark on a My words row. */
export type ProgressHint = { kind: "new" } | { kind: "streak"; filled: number; of: number };

export function progressHint(
  word: Pick<WordListItem, "status" | "timesSeen" | "correctStreak">,
): ProgressHint | null {
  // Ignored words are never practised; a learned word nobody practised was marked by hand.
  if (word.status === "ignored") return null;
  if (word.timesSeen === 0) return word.status === "learning" ? { kind: "new" } : null;
  return {
    kind: "streak",
    filled: Math.min(word.correctStreak, LEARNED_STREAK),
    of: LEARNED_STREAK,
  };
}

/** The hint for screen readers. */
export const hintLabel = (hint: ProgressHint | null) =>
  !hint
    ? ""
    : hint.kind === "new"
      ? "Not practised yet"
      : `${hint.filled} of ${hint.of} right in a row`;

export const FORMS_SOURCE_LABEL: Record<FormsSource, string> = {
  dictionary: "from Wiktionary",
  ai: "from AI",
};

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
