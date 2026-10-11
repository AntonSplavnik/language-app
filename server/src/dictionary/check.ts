import type { Article, Candidate, Pos } from "@language-app/core";

const ARTICLE_ORDER: Article[] = ["der", "die", "das"];

/**
 * The dictionary check for one new candidate (§6.3), given every dictionary entry found for its
 * lemma and part of speech. Genders are merged across entries: der See and die See both match.
 */
export function checkWord(
  word: { pos: Pos; article: Article | null },
  entries: Array<{ genders: Article[] }>,
): Candidate["dictionary"] {
  if (entries.length === 0) return { status: "not_found" };
  if (word.pos !== "noun") return { status: "match" };

  const known = new Set(entries.flatMap((e) => e.genders));
  // No gender in the dictionary (plural-only nouns such as Eltern): nothing to contradict.
  if (known.size === 0) return { status: "match" };
  if (word.article && known.has(word.article)) return { status: "match" };

  return { status: "mismatch", genders: ARTICLE_ORDER.filter((a) => known.has(a)) };
}
