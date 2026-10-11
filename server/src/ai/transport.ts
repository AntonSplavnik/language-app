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

export function anthropicTransport(apiKey: string): MessageTransport {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set; add it to .env");
  // SDK defaults: 2 retries on 429, 5xx and connection errors; 10-minute timeout.
  const client = new Anthropic({ apiKey });
  return (request) => client.beta.messages.create(request);
}
