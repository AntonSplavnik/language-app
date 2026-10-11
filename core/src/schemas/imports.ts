import { z } from "zod";
import { Article, Pos } from "./common";

// Request/response shapes for the import endpoints are added in M4.

/** One entry of `imports.candidates` (§6.3). */
export const Candidate = z.object({
  /** `lemma|pos|article`, empty article for non-nouns. */
  key: z.string(),
  lemma: z.string(),
  pos: Pos,
  article: Article.nullable(),
  translation: z.string(),
  photoIndex: z.number().int().nonnegative(),
  existing: z.enum(["none", "in_my_words"]),
  dictionary: z.object({
    status: z.enum(["match", "mismatch", "not_found"]),
    genders: z.array(Article).optional(),
  }),
});
export type Candidate = z.infer<typeof Candidate>;
