import type { Article, Candidate, ExtractedWord, Pos } from "@language-app/core";

export type WordIdentity = { lemma: string; pos: Pos; article: Article | null };

/** A candidate before the comparison with the learner's words and the dictionary check. */
export type NewCandidate = Omit<Candidate, "existing" | "dictionary">;

/** `lemma|pos|article`, empty article for non-nouns (§6.3). Also the identity of a `words` row. */
export const candidateKey = ({ lemma, pos, article }: WordIdentity) =>
  `${lemma}|${pos}|${article ?? ""}`;

/**
 * The words from one photo that are not yet candidates of the import (§6.3). Duplicates are
 * merged by (lemma, pos, article); the first translation wins, so earlier photos win too.
 */
export function newCandidateWords(
  existing: Candidate[],
  words: ExtractedWord[],
  photoIndex: number,
): NewCandidate[] {
  const seen = new Set(existing.map((c) => c.key));
  const result: NewCandidate[] = [];

  for (const raw of words) {
    const lemma = raw.lemma.trim();
    if (!lemma) continue;
    // Only nouns carry an article; anything else the AI sent is noise.
    const article = raw.pos === "noun" ? raw.article : null;
    const key = candidateKey({ lemma, pos: raw.pos, article });
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      key,
      lemma,
      pos: raw.pos,
      article,
      translation: raw.translation.trim(),
      photoIndex,
    });
  }
  return result;
}
