import { z } from "zod";
import { Article, Pos, VerbForms } from "./common";

// Inputs and outputs of the three Claude calls (§11) and of the dictionary's themes run (§7 Themes).
// The outputs are converted to JSON Schema for structured outputs, so keep them plain: no refine,
// transform or default.

/**
 * Themes as the AI answers them: any text, so an unknown key is dropped (`knownThemes`) rather than
 * failing the whole answer. The SDK would only turn an enum into a description anyway (§11.1).
 */
const ThemeAnswer = z
  .array(z.string())
  .describe("Theme keys from the list, the main one first; [] when none fits");

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
  /**
   * The word's theme keys (§7 Themes). Any text is accepted here: an unknown key is dropped later
   * (`knownThemes`) rather than failing the whole batch.
   */
  themes: ThemeAnswer,
});
export type EnrichedWord = z.infer<typeof EnrichedWord>;

export const EnrichOutput = z.object({
  words: z.array(EnrichedWord),
});
export type EnrichOutput = z.infer<typeof EnrichOutput>;

/** Call 3 (§11.6): what the learner typed and, for a translation only, the entry they chose. */
export const DescribeInput = z.object({
  text: z.string(),
  entry: z
    .object({
      lemma: z.string(),
      pos: Pos,
      article: Article.nullable(),
      glosses: z.array(z.string()),
    })
    .optional(),
});
export type DescribeInput = z.infer<typeof DescribeInput>;

export const DescribeOutput = z.object({
  /** False when the text isn't a German word (English, nonsense); the rest is then ignored. */
  german: z.boolean(),
  lemma: z.string(),
  pos: Pos,
  article: Article.nullable(),
  translation: z.string(),
});
export type DescribeOutput = z.infer<typeof DescribeOutput>;

/**
 * The dictionary run (`themes:classify`, §7 Themes): one dictionary word, numbered within its request
 * as Call 2 numbers its words, with up to three of its glosses.
 */
export const ThemesInputItem = z.object({
  ref: z.number().int(),
  lemma: z.string(),
  pos: Pos,
  article: Article.nullable(),
  glosses: z.array(z.string()),
});
export type ThemesInputItem = z.infer<typeof ThemesInputItem>;

export const ThemedWord = z.object({
  ref: z.number().int(),
  /** Echoed as a sanity check that the answer belongs to the word with this ref. */
  lemma: z.string(),
  themes: ThemeAnswer,
});
export type ThemedWord = z.infer<typeof ThemedWord>;

export const ThemesOutput = z.object({
  words: z.array(ThemedWord),
});
export type ThemesOutput = z.infer<typeof ThemesOutput>;
