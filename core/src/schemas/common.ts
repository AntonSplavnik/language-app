import { z } from "zod";

// Value sets from docs/design.md §5. The database stores them as text; these are the source of truth.

export const Pos = z.enum([
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "determiner",
  "numeral",
  "particle",
  "interjection",
  "other",
]);
export type Pos = z.infer<typeof Pos>;

export const Article = z.enum(["der", "die", "das"]);
export type Article = z.infer<typeof Article>;

export const WordStatus = z.enum(["learning", "learned", "ignored"]);
export type WordStatus = z.infer<typeof WordStatus>;

export const CardResult = z.enum(["knew", "didnt_know", "skipped"]);
export type CardResult = z.infer<typeof CardResult>;

/** `user_words.last_result`: only answers that count, never `skipped`. */
export const LastResult = z.enum(["knew", "didnt_know"]);
export type LastResult = z.infer<typeof LastResult>;

export const CheckStatus = z.enum([
  "match",
  "mismatch_fixed",
  "mismatch_kept",
  "not_in_dictionary",
]);
export type CheckStatus = z.infer<typeof CheckStatus>;

export const FormsSource = z.enum(["dictionary", "ai"]);
export type FormsSource = z.infer<typeof FormsSource>;

export const ImportStatus = z.enum(["collecting", "reviewing", "done"]);
export type ImportStatus = z.infer<typeof ImportStatus>;

/**
 * How an import's words came in: photographed pages, pages of a PDF rendered to images (§6.8), or
 * a list typed by hand (§5, §6.7).
 */
export const ImportSource = z.enum(["photos", "pdf", "typed"]);
export type ImportSource = z.infer<typeof ImportSource>;

/** `ai_usage.call_type`: the three Claude calls (§11). */
export const AiCallType = z.enum(["extract", "enrich", "describe"]);
export type AiCallType = z.infer<typeof AiCallType>;

/** Where a practice session takes its words from (§8.1); `import` is one past import (§9.2). */
export const SessionSource = z.enum(["import", "last_7_days", "not_learned"]);
export type SessionSource = z.infer<typeof SessionSource>;

export const Auxiliary = z.enum(["haben", "sein"]);
export type Auxiliary = z.infer<typeof Auxiliary>;

/** `words.forms` for verbs (§5). Other parts of speech have no forms. */
export const VerbForms = z.object({
  praeteritum: z.string(),
  partizip2: z.string(),
  auxiliary: Auxiliary,
});
export type VerbForms = z.infer<typeof VerbForms>;

/** Body of every non-2xx API response. */
export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
