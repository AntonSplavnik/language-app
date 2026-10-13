import type { StatsResponse, WordListResponse } from "@language-app/core";

type Counts = Pick<StatsResponse, "learning" | "learned">;

/** Practice needs words that are not ignored; until then New import is the main action. */
export const hasWords = ({ learning, learned }: Counts) => learning + learned > 0;

/** The line on Home's My words tile. */
export const countsText = ({ learning, learned }: Counts) =>
  `${learning} learning · ${learned} learned`;

/**
 * Home's deck card: the words not ignored, and the share of them learned. Rounded down, so the
 * card never says 100% while a word is still being learned; an empty deck is 0%.
 */
export function deckSummary({ learning, learned }: Counts): {
  total: number;
  learnedPercent: number;
} {
  const total = learning + learned;
  return { total, learnedPercent: total === 0 ? 0 : Math.floor((learned * 100) / total) };
}

/** The second line of Home's Practice button: what it will draw from; null without words. */
export function practiceText({ learning, learned }: Counts): string | null {
  if (learning > 0) return `${learning} ${learning === 1 ? "word" : "words"} to practise`;
  if (learned > 0) return "Review learned words";
  return null;
}

/** "164 words" at the top of My words: every tab together. */
export function wordCount(counts: WordListResponse["counts"]): string {
  const total = counts.learning + counts.learned + counts.ignored;
  return `${total} ${total === 1 ? "word" : "words"}`;
}
