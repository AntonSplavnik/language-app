import { z } from "zod";
import { Article, Pos, VerbForms } from "./common";

// Outputs of the two Claude calls (§11). These are converted to JSON Schema for structured
// outputs, so keep them plain: no refine, transform or default.

export const ExtractedWord = z.object({
  lemma: z.string(),
  pos: Pos,
  article: Article.nullable(),
  translation: z.string(),
});
export type ExtractedWord = z.infer<typeof ExtractedWord>;

export const ExtractOutput = z.object({
  pageQuality: z.enum(["ok", "poor"]),
  words: z.array(ExtractedWord),
});
export type ExtractOutput = z.infer<typeof ExtractOutput>;

export const EnrichInputWord = z.object({
  /** Position in the batch; the output repeats it so results match their word reliably. */
  ref: z.number().int(),
  lemma: z.string(),
  pos: Pos,
  article: Article.nullable(),
  translation: z.string(),
  needsForms: z.boolean(),
});
export type EnrichInputWord = z.infer<typeof EnrichInputWord>;

export const EnrichedWord = z.object({
  ref: z.number().int(),
  /** Echoed as a sanity check that the entry belongs to the word with this ref. */
  lemma: z.string(),
  exampleDe: z.string(),
  exampleTranslation: z.string(),
  plural: z.string().nullable(),
  forms: VerbForms.nullable(),
});
export type EnrichedWord = z.infer<typeof EnrichedWord>;

export const EnrichOutput = z.object({
  words: z.array(EnrichedWord),
});
export type EnrichOutput = z.infer<typeof EnrichOutput>;
