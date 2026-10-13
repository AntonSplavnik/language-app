/** A letter heading of My words and the words under it (§10). */
export type LetterGroup<T> = { letter: string; words: T[] };

/**
 * Splits the list, already sorted by the server, into letter sections. Accents are folded, so
 * *Ärger* sits under A, and words that don't start with a letter go under "#". A new section
 * starts only where the letter changes from the word before, so the order is never changed.
 */
export function groupByLetter<T extends { lemma: string }>(words: T[]): LetterGroup<T>[] {
  const groups: LetterGroup<T>[] = [];
  for (const word of words) {
    const letter = initial(word.lemma);
    const last = groups.at(-1);
    if (last?.letter === letter) last.words.push(word);
    else groups.push({ letter, words: [word] });
  }
  return groups;
}

function initial(lemma: string): string {
  // NFD splits Ä into A and a combining mark; ß upper-cases to "SS", hence the first character.
  const base = (lemma.trimStart()[0] ?? "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
  const first = base[0] ?? "";
  return /\p{L}/u.test(first) ? first : "#";
}
