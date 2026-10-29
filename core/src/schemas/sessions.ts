import { z } from "zod";
import { ThemeKey } from "../themes";
import { CardResult, SessionSource } from "./common";
import { WordView } from "./words";

/** One flashcard in a practice session (§8.2). */
export const PracticeCard = WordView;
export type PracticeCard = z.infer<typeof PracticeCard>;

/** Most cards in one session (§8.1). */
export const SESSION_SIZE = 20;

/**
 * `GET /api/sessions/options`: how many words each source has, in display order (§8.1). The count
 * of `import` is the most recent past import's (§9.2), that of `theme` the theme's with the most
 * words to practise (§9.1); 0 when there is none.
 */
export const SessionOptionsResponse = z.object({
  options: z.array(
    z.object({
      source: SessionSource,
      /** All the words the source has; a session takes up to {@link SESSION_SIZE}. */
      count: z.number().int().nonnegative(),
    }),
  ),
});
export type SessionOptionsResponse = z.infer<typeof SessionOptionsResponse>;

/**
 * `POST /api/sessions`: `importId`, the import to practise, goes with source `import` only, and
 * `theme`, the theme to practise, with source `theme` only.
 */
export const CreateSessionRequest = z
  .object({
    source: SessionSource,
    importId: z.number().int().positive().optional(),
    theme: ThemeKey.optional(),
  })
  .refine((body) => (body.source === "import") === (body.importId !== undefined), {
    message: "Send importId with the import source, and only with it",
    path: ["importId"],
  })
  .refine((body) => (body.source === "theme") === (body.theme !== undefined), {
    message: "Send theme with the theme source, and only with it",
    path: ["theme"],
  });
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const SessionResponse = z.object({
  id: z.number().int(),
  source: SessionSource,
  cards: z.array(PracticeCard),
});
export type SessionResponse = z.infer<typeof SessionResponse>;

/** `POST /api/sessions/:id/results`: one answered card (§8.4). */
export const CardResultRequest = z.object({
  userWordId: z.number().int().positive(),
  result: CardResult,
  /** Whether the card was turned over before answering. */
  flipped: z.boolean(),
  /** Time from card shown to first flip; null if not flipped. */
  flipMs: z.number().int().nonnegative().nullable(),
  /** Time from card shown to the answer. */
  answerMs: z.number().int().nonnegative(),
});
export type CardResultRequest = z.infer<typeof CardResultRequest>;

export const CardResultResponse = z.object({
  /** False when this card already had an answer in this session (a retried request). */
  recorded: z.boolean(),
});
export type CardResultResponse = z.infer<typeof CardResultResponse>;

/** `POST /api/sessions/:id/finish` (§8.6) */
export const SessionSummary = z.object({
  knew: z.number().int().nonnegative(),
  didntKnow: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  /** Words answered "didn't know", in the order they were answered. */
  missed: z.array(PracticeCard),
});
export type SessionSummary = z.infer<typeof SessionSummary>;
