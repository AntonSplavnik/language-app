import type {
  DescribeInput,
  DescribeOutput,
  EnrichInputWord,
  EnrichOutput,
  ExtractOutput,
} from "@language-app/core";

/**
 * Who a call is for: its cost lands on their `ai_usage` row, and the AI writes in their language
 * (the signed-in learner's, from the session; §17.3).
 */
export type AiCallContext = {
  userId: number;
  importId: number | null;
  learnerLanguage: string;
};

/**
 * The three Claude calls (§11). Kept behind an interface so tests can replay recorded responses
 * and another provider could be added without touching the import flow.
 */
export interface AiClient {
  /** Call 1 (§11.2): the German words on one page photo (JPEG). */
  extractWords(jpeg: Uint8Array, ctx: AiCallContext): Promise<ExtractOutput>;
  /** Call 2 (§11.3): example sentences, plus plural/verb forms where asked, for up to 30 words. */
  enrichWords(words: EnrichInputWord[], ctx: AiCallContext): Promise<EnrichOutput>;
  /** Call 3 (§11.6): the word a typed text means, or a translation of a chosen entry (Ask AI). */
  describeWord(input: DescribeInput, ctx: AiCallContext): Promise<DescribeOutput>;
}

export type AiErrorCode =
  /** Rate limited, overloaded or unreachable after the SDK's own retries; worth retrying later. */
  | "busy"
  /**
   * The Anthropic credit is used up (400 "credit balance is too low", or 402 `billing_error`):
   * nothing works until it is topped up, so it isn't retried (§12).
   */
  | "unavailable"
  /** Declined by safety classifiers, after the server-side fallback also declined. */
  | "refused"
  /** The response did not match the schema twice in a row. */
  | "invalid_output"
  /** The output hit `max_tokens`: too many words on one photo. */
  | "too_long";

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AiError";
  }
}
