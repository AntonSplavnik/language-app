import { SESSION_SIZE } from "@language-app/core";

/**
 * A source's count on Practice setup (§8.1), in two lines: the number, large, over the rest
 * ("20" over "of 149 words"). A source without words has no number, just "No words".
 */
export function countParts(count: number): { number: number | null; rest: string } {
  if (count === 0) return { number: null, rest: "No words" };
  if (count <= SESSION_SIZE) return { number: count, rest: count === 1 ? "word" : "words" };
  return { number: SESSION_SIZE, rest: `of ${count} words` };
}
