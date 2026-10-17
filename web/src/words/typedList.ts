import { TYPED_LIST_MAX, TYPED_TEXT_MAX } from "@language-app/core";

/** A bullet or a number at the start of a pasted line: "- ", "• ", "* ", "1. ", "2) ". */
const LIST_MARK = /^(?:[-–•*·]|\d+[.)])\s+/;

/**
 * The words of a typed list (§10 Add words), one per line: trimmed, inner spaces single, a pasted
 * bullet or number dropped, cut at the most the dictionary looks up; blank lines and repeats
 * (ignoring case) don't count. More than 30 are too many for one list.
 */
export function typedLines(text: string): { words: string[]; tooMany: boolean } {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const word = line
      .trim()
      .replace(LIST_MARK, "")
      .replace(/\s+/g, " ")
      .slice(0, TYPED_TEXT_MAX)
      .trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  return { words, tooMany: words.length > TYPED_LIST_MAX };
}

/** "5 words" under the list. */
export const countText = (count: number) =>
  count === 0 ? "No words yet" : `${count} ${count === 1 ? "word" : "words"}`;
