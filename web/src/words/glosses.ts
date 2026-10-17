import { CUSTOM_TRANSLATION_MAX } from "@language-app/core";

/**
 * A dictionary gloss as a translation (§6.7 step 3): the parts in parentheses dropped, "umbrella
 * (used for protection against rain)" → "umbrella". A gloss that is nothing but parentheses stays
 * as it is. At most the longest translation a word can have.
 */
export function shortGloss(gloss: string): string {
  let text = gloss;
  // Innermost first, so nested parentheses go too.
  for (let previous = ""; previous !== text; ) {
    previous = text;
    text = text.replace(/\([^()]*\)/g, " ");
  }
  const short = text
    .replace(/\s+/g, " ")
    .replace(/\s+([,;.])/g, "$1")
    .replace(/^[\s,;]+|[\s,;]+$/g, "");
  return (short || gloss.trim()).slice(0, CUSTOM_TRANSLATION_MAX);
}

/** The chips under a translation field: each gloss shortened, once, without empty ones. */
export function shortGlosses(glosses: string[]): string[] {
  const chips = glosses.map((gloss) => (gloss.trim() ? shortGloss(gloss) : "")).filter(Boolean);
  return [...new Set(chips)];
}
