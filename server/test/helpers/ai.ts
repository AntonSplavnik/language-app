import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { EnrichInputWord } from "@language-app/core";
import type { MessageRequest, MessageTransport } from "../../src/ai/transport";

/** A real Claude response recorded with `pnpm --filter server ai:try … --save <name>`. */
export type AiFixture = {
  meta: { kind: "extract" | "enrich"; source: string; requestedModel: string };
  input?: EnrichInputWord[];
  response: BetaMessage;
};

export function loadAiFixture(name: string): AiFixture {
  const url = new URL(`../fixtures/ai/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as AiFixture;
}

/**
 * A transport that answers each request with the next step: a response to return or an error to
 * throw. Records every request it receives.
 */
export function replayTransport(...steps: Array<BetaMessage | Error>) {
  const requests: MessageRequest[] = [];
  const transport: MessageTransport = async (request) => {
    requests.push(structuredClone(request));
    const step = steps.shift();
    if (!step) throw new Error("replayTransport: no more recorded responses");
    if (step instanceof Error) throw step;
    return structuredClone(step);
  };
  return { transport, requests };
}

// Variations of a recorded response, for the cases we can't (or shouldn't) provoke for real.

export const withText = (response: BetaMessage, text: string): BetaMessage => ({
  ...response,
  content: [{ type: "text", text, citations: null }],
});

export const withStopReason = (
  response: BetaMessage,
  stopReason: BetaMessage["stop_reason"],
  extra: Partial<BetaMessage> = {},
): BetaMessage => ({ ...response, stop_reason: stopReason, ...extra });

/** The response as it looks when Claude Opus 5.5 declined and the server-side fallback answered. */
export function asFallback(response: BetaMessage, fallbackModel: string): BetaMessage {
  const refused = { input_tokens: 3000, output_tokens: 12 };
  return {
    ...response,
    model: fallbackModel,
    content: [
      {
        type: "fallback",
        from: { model: response.model },
        to: { model: fallbackModel },
        trigger: { type: "refusal" },
      } as unknown as BetaMessage["content"][number],
      ...response.content,
    ],
    usage: {
      ...response.usage,
      iterations: [
        { type: "message", model: response.model, ...refused, ...noCache },
        {
          type: "fallback_message",
          model: fallbackModel,
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          ...noCache,
        },
      ],
    },
  };
}

const noCache = {
  cache_creation: null,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

/** An SDK error for an HTTP status, as thrown after the SDK's own retries. */
export const apiError = (status: number) =>
  Anthropic.APIError.generate(
    status,
    { type: "error", error: { type: "test_error", message: `HTTP ${status}` } },
    `HTTP ${status}`,
    new Headers(),
  );

export const connectionError = () =>
  new Anthropic.APIConnectionError({ message: "Connection error." });
