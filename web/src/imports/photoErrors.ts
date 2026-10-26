/**
 * Errors worth retrying with the same photo (§12 Import): the AI busy or unavailable (the credit
 * used up, until it is topped up), an unusable answer, the network, an unexpected server error.
 * Anything else needs another photo, or retrying can't help.
 */
const RETRYABLE = new Set([
  "ai_busy",
  "ai_unavailable",
  "ai_invalid_output",
  "network",
  "internal",
  "http_error",
]);

export const isRetryable = (code: string) => RETRYABLE.has(code);
