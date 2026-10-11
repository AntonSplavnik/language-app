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
  /** Enrichment has not run yet, so some details may be missing. */
  detailsPending: boolean;
};

const AUXILIARY_3SG: Record<Auxiliary, string> = { haben: "hat", sein: "ist" };

export function cardFront(word: WordView): CardFront {
  return { translation: displayTranslation(word), pos: word.pos };
}

export function cardBack(word: WordView): CardBack {
  return {
    headword: word.pos === "noun" && word.article ? `${word.article} ${word.lemma}` : word.lemma,
    forms: formsLine(word),
    example: word.exampleDe ? { de: word.exampleDe, translation: word.exampleTranslation } : null,
    note: word.note,
    detailsPending: !word.enriched,
  };
}

function formsLine(word: WordView): string | null {
  if (word.pos === "noun") {
    return word.plural ? `pl. die ${word.plural}` : null;
  }
  if (word.pos === "verb" && word.forms) {
    const { praeteritum, partizip2, auxiliary } = word.forms;
    return `${praeteritum} · ${AUXILIARY_3SG[auxiliary]} ${partizip2}`;
  }
  return null;
}
