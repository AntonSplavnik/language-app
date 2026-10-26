import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaMessage,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

export type MessageRequest = MessageCreateParamsNonStreaming;

/**
 * Sends one Messages API request. The real one talks to Claude; tests pass one that replays
 * recorded responses, so `pnpm test` never calls the API.
 */
export type MessageTransport = (request: MessageRequest) => Promise<BetaMessage>;

export function anthropicTransport(
  apiKey: string,
  /** `fetch`: where the SDK sends its requests; tests answer them without reaching the API. */
  { fetch }: { fetch?: typeof globalThis.fetch } = {},
): MessageTransport {
  // Without a key the server still starts; only AI calls fail, with a clear message.
  if (!apiKey) {
    return () => Promise.reject(new Error("ANTHROPIC_API_KEY is not set; add it to .env"));
  }
  // SDK defaults: 2 retries on 408, 409, 429, 5xx and connection errors (never on a 400 or 402);
  // 10-minute timeout.
  const client = new Anthropic({ apiKey, ...(fetch ? { fetch } : {}) });
  return (request) => client.beta.messages.create(request);
}
