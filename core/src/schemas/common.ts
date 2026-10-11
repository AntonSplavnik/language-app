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

export const SessionSource = z.enum(["last_import", "last_7_days", "not_learned"]);
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
