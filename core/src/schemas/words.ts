import { z } from "zod";
import { Article, Pos, VerbForms } from "./common";

// List/detail/patch shapes for the word endpoints are added in M8.

/** What a learner sees about one of their words: shared facts plus their own overrides. */
export const WordView = z.object({
  userWordId: z.number().int(),
  lemma: z.string(),
  pos: Pos,
  article: Article.nullable(),
  plural: z.string().nullable(),
  forms: VerbForms.nullable(),
  /** `word_translations.translation` for the learner language. */
  translation: z.string(),
  /** Takes priority over `translation` everywhere it is shown (§5). */
  customTranslation: z.string().nullable(),
  exampleDe: z.string().nullable(),
  exampleTranslation: z.string().nullable(),
  note: z.string().nullable(),
  /** False until enrichment has run (`words.enriched_at`). */
  enriched: z.boolean(),
});
export type WordView = z.infer<typeof WordView>;
