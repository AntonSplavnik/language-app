import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { EnrichedWord, EnrichInputWord } from "@language-app/core";
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

/**
 * A transport that builds each response from its request, for calls that run in parallel or in
 * no fixed order. Records every request it receives.
 */
export function respondingTransport(respond: (request: MessageRequest) => BetaMessage | Error) {
  const requests: MessageRequest[] = [];
  const transport: MessageTransport = async (request) => {
    requests.push(structuredClone(request));
    const result = respond(request);
    if (result instanceof Error) throw result;
    return structuredClone(result);
  };
  return { transport, requests };
}

/** True when the request is an extract call (it carries the page photo). */
export const isExtractRequest = (request: MessageRequest) =>
  JSON.stringify(request.messages[0]?.content).includes('"type":"image"');

/** The words an enrich request sent (§11.3). */
export function enrichInputOf(request: MessageRequest): EnrichInputWord[] {
  const content = request.messages[0]?.content;
  const text = Array.isArray(content) && content[0]?.type === "text" ? content[0].text : "[]";
  return JSON.parse(text) as EnrichInputWord[];
}

/**
 * A made-up but well-formed enrich response for a request: an example sentence per word and
 * invented forms where they were asked for. `change` can alter or drop single entries.
 */
export function fakeEnrichResponse(
  request: MessageRequest,
  change: (entry: EnrichedWord, input: EnrichInputWord) => EnrichedWord | null = (e) => e,
): BetaMessage {
  const base = loadAiFixture("enrich-batch").response;
  const words = enrichInputOf(request).flatMap((input) => {
    const entry: EnrichedWord = {
      ref: input.ref,
      lemma: input.lemma,
      exampleDe: `Das ist ein Beispiel mit ${input.lemma}.`,
      exampleTranslation: `This is an example with ${input.translation}.`,
      plural: input.needsForms && input.pos === "noun" ? `${input.lemma}-AI` : null,
      forms:
        input.needsForms && input.pos === "verb"
          ? {
              praeteritum: `${input.lemma}-prät`,
              partizip2: `${input.lemma}-p2`,
              auxiliary: "haben",
            }
          : null,
    };
    const changed = change(entry, input);
    return changed ? [changed] : [];
  });
  return withText(base, JSON.stringify({ words }));
}
