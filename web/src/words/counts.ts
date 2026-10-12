import type { StatsResponse } from "@language-app/core";

type Counts = Pick<StatsResponse, "learning" | "learned">;

/** Practice needs words that are not ignored; until then New import is the main action. */
export const hasWords = ({ learning, learned }: Counts) => learning + learned > 0;

/** The line on Home's My words card. */
export const countsText = ({ learning, learned }: Counts) =>
  `${learning} learning · ${learned} learned`;

/** The second line of Home's Practice button: what it will draw from; null without words. */
export function practiceText({ learning, learned }: Counts): string | null {
  if (learning > 0) return `${learning} ${learning === 1 ? "word" : "words"} to practise`;
  if (learned > 0) return "Review learned words";
  return null;
}
