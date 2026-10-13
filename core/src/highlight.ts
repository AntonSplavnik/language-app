import type { WordView } from "./schemas/words";

/** A piece of a sentence; the pieces in order make up the whole sentence. */
export type HighlightSegment = { text: string; bold: boolean };

export type HighlightWord = Pick<WordView, "lemma" | "pos" | "plural" | "forms">;

/** Letters after a known form that still count as the same word: Anruf → Anrufen, geh → gehst. */
const MAX_ENDING = 3;
/** Shorter forms match only whole words, so "an" never bolds the start of "Anruf". */
const MIN_PREFIX = 3;

// Letter runs, with combining marks in case an umlaut arrives decomposed.
const WORD = /[\p{L}\p{M}]+/gu;

type Token = { text: string; start: number; end: number };

/**
 * Splits an example sentence so the word it illustrates can be shown in bold (§10 Word detail).
 *
 * A word of the sentence matches when it equals, ignoring case, the lemma, the plural (nouns),
 * the Präteritum or Partizip II (verbs) or the verb's stem (gehen → geh, wandern → wander), or
 * starts with one of them (3 letters or more) followed by at most 3 letters: Anrufe, Anrufs, gehst
 * and Häuser (via the plural) match, Anrufbeantworter doesn't. A form of several words, such as
 * "zum Beispiel" or the Präteritum "fing an", matches only as a whole phrase. Known limit: the split
 * present tense of a separable verb ("Ich fange morgen an") is not found.
 */
export function highlightWord(sentence: string, word: HighlightWord): HighlightSegment[] {
  const tokens = tokenize(sentence);
  const bold = new Array<boolean>(sentence.length).fill(false);

  for (const form of candidates(word)) {
    const parts = tokenize(form);
    for (let first = 0; parts.length > 0 && first + parts.length <= tokens.length; first++) {
      const match =
        parts.length === 1
          ? matchesWord(tokens[first], parts[0])
          : matchesPhrase({ sentence, tokens, first }, { form, parts });
      if (match) bold.fill(true, tokens[first]?.start, tokens[first + parts.length - 1]?.end);
    }
  }

  return segments(sentence, bold);
}

function candidates(word: HighlightWord): string[] {
  const list = [word.lemma];
  if (word.plural) list.push(word.plural);
  if (word.pos === "verb") {
    if (word.forms) list.push(word.forms.praeteritum, word.forms.partizip2);
    const stem = verbStem(word.lemma);
    if (stem) list.push(stem);
  }
  return list;
}

/** gehen → geh, wandern → wander; null for a lemma of several words. */
function verbStem(lemma: string): string | null {
  if (/\s/.test(lemma.trim())) return null;
  if (lemma.endsWith("en")) return lemma.slice(0, -2);
  if (lemma.endsWith("n")) return lemma.slice(0, -1);
  return null;
}

function matchesWord(token: Token | undefined, form: Token | undefined): boolean {
  if (!token || !form) return false;
  const text = normalize(token.text);
  const known = normalize(form.text);
  if (text === known) return true;
  return (
    known.length >= MIN_PREFIX && text.startsWith(known) && text.length - known.length <= MAX_ENDING
  );
}

function tokenize(text: string): Token[] {
  return Array.from(text.matchAll(WORD), (match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/** Every word equal, with the same separators between them (any run of spaces counts as one). */
function matchesPhrase(
  at: { sentence: string; tokens: Token[]; first: number },
  phrase: { form: string; parts: Token[] },
): boolean {
  return phrase.parts.every((part, j) => {
    const token = at.tokens[at.first + j];
    if (!token || normalize(token.text) !== normalize(part.text)) return false;
    if (j === 0) return true;
    const gap = at.sentence.slice(at.tokens[at.first + j - 1]?.end, token.start);
    const expected = phrase.form.slice(phrase.parts[j - 1]?.end, part.start);
    return squeeze(gap) === squeeze(expected);
  });
}

// Only for comparing: the segments keep the sentence's own characters.
const normalize = (text: string) => text.normalize("NFC").toLowerCase();
const squeeze = (text: string) => text.replace(/\s+/g, " ");

/** Runs of equally bold characters. */
function segments(sentence: string, bold: boolean[]): HighlightSegment[] {
  const result: HighlightSegment[] = [];
  let start = 0;
  for (let i = 1; i <= sentence.length; i++) {
    if (i === sentence.length || bold[i] !== bold[start]) {
      result.push({ text: sentence.slice(start, i), bold: bold[start] ?? false });
      start = i;
    }
  }
  return result.length > 0 ? result : [{ text: sentence, bold: false }];
}
