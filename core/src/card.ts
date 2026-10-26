import type { Auxiliary, Pos } from "./schemas/common";
import type { WordView } from "./schemas/words";

/** The learner's own translation wins over the stored one wherever a translation is shown (§5). */
export function displayTranslation(
  word: Pick<WordView, "translation" | "customTranslation">,
): string {
  const custom = word.customTranslation?.trim();
  return custom ? custom : word.translation;
}

export type CardFront = {
  translation: string;
  pos: Pos;
};

export type CardBack = {
  /** "der Tisch" for nouns, the lemma otherwise. */
  headword: string;
  /** "pl. die Tische" or "ging · ist gegangen"; null when there is nothing to show. */
  forms: string | null;
  example: { de: string; translation: string | null } | null;
  note: string | null;
  /**
   * Enrichment has not run yet, so some details may be missing. Never for an account without AI,
   * which has no way to add them (§6.7).
   */
  detailsPending: boolean;
  /** The recording a speaker button plays on tap; null when there is none. Never on the front. */
  audioUrl: string | null;
};

const AUXILIARY_3SG: Record<Auxiliary, string> = { haben: "hat", sein: "ist" };

export function cardFront(word: WordView): CardFront {
  return { translation: displayTranslation(word), pos: word.pos };
}

/** `aiEnabled`: whether the signed-in account has the AI features (true unless said otherwise). */
export function cardBack(
  word: WordView,
  { aiEnabled = true }: { aiEnabled?: boolean } = {},
): CardBack {
  return {
    headword: word.pos === "noun" && word.article ? `${word.article} ${word.lemma}` : word.lemma,
    forms: formsText(word),
    example: word.exampleDe ? { de: word.exampleDe, translation: word.exampleTranslation } : null,
    note: word.note,
    detailsPending: aiEnabled && !word.enriched,
    audioUrl: word.audioUrl,
  };
}

/**
 * A word's forms as the card back writes them: "pl. die Tische", "ging · ist gegangen"; null when
 * there are none. Also a dictionary entry's, on Confirm word (§10 screen 15).
 */
export function formsText(word: Pick<WordView, "pos" | "plural" | "forms">): string | null {
  if (word.pos === "noun") {
    return word.plural ? `pl. die ${word.plural}` : null;
  }
  if (word.pos === "verb" && word.forms) {
    const { praeteritum, partizip2, auxiliary } = word.forms;
    return `${praeteritum} · ${AUXILIARY_3SG[auxiliary]} ${partizip2}`;
  }
  return null;
}
