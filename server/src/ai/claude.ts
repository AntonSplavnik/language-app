import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type {
  BetaContentBlockParam,
  BetaMessage,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { EnrichOutput, ExtractOutput } from "@language-app/core";
import type { z } from "zod";
import { enrichSystemPrompt, extractSystemPrompt } from "./prompts";
import type { MessageRequest, MessageTransport } from "./transport";
import { type AiClient, AiError } from "./types";
import type { UsageSink } from "./usage";

export const MAX_TOKENS = 16_000;
/** Server-side refusal fallback, routed by refusal category (§11.1). */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type ClaudeAiOptions = {
  transport: MessageTransport;
  recordUsage: UsageSink;
  models: { extract: string; enrich: string };
  effort: Effort;
  learnerLanguage: string;
};

// JSON Schemas for structured outputs, derived once from the Zod schemas in core.
const extractSchema = betaZodOutputFormat(ExtractOutput).schema;
const enrichSchema = betaZodOutputFormat(EnrichOutput).schema;

type CallSpec<T> = {
  callType: "extract" | "enrich";
  model: string;
  system: string;
  content: BetaContentBlockParam[];
  jsonSchema: Record<string, unknown>;
  output: z.ZodType<T>;
};

type Outcome<T> = { ok: true; data: T } | { ok: false; error: AiError };

export function createClaudeAi(options: ClaudeAiOptions): AiClient {
  const { transport, recordUsage, models, effort, learnerLanguage } = options;

  async function call<T>(spec: CallSpec<T>, ctx: { userId: number; importId: number | null }) {
    const request: MessageRequest = {
      model: spec.model,
      max_tokens: MAX_TOKENS,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      // Opus 5.5 always thinks adaptively; effort is the only depth control and defaults to
      // medium, so it is set explicitly. Never send `thinking`: disabling it is a 400.
      output_config: { effort, format: { type: "json_schema", schema: spec.jsonSchema } },
      system: spec.system,
      messages: [{ role: "user", content: spec.content }],
    };

    // One automatic retry when the output does not match the schema (§12).
    for (let attempt = 1; ; attempt++) {
      const started = performance.now();
      const usageBase = { userId: ctx.userId, importId: ctx.importId, callType: spec.callType };

      let response: BetaMessage;
      try {
        response = await transport(request);
      } catch (error) {
        await recordUsage({
          ...usageBase,
          model: spec.model,
          ok: false,
          durationMs: Math.round(performance.now() - started),
        });
        throw toAiError(error);
      }

      const outcome = readResponse(response, spec.output);
      await recordUsage({
        ...usageBase,
        model: response.model,
        ...countTokens(response),
        stopReason: response.stop_reason,
        ok: outcome.ok,
        durationMs: Math.round(performance.now() - started),
      });

      if (outcome.ok) return outcome.data;
      if (outcome.error.code !== "invalid_output" || attempt >= 2) throw outcome.error;
    }
  }

  return {
    extractWords: (jpeg, ctx) =>
      call(
        {
          callType: "extract",
          model: models.extract,
          system: extractSystemPrompt(learnerLanguage),
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: Buffer.from(jpeg).toString("base64"),
              },
            },
            { type: "text", text: "List the German vocabulary on this page." },
          ],
          jsonSchema: extractSchema,
          output: ExtractOutput,
        },
        ctx,
      ),

    enrichWords: (words, ctx) =>
      call(
        {
          callType: "enrich",
          model: models.enrich,
          system: enrichSystemPrompt(learnerLanguage),
          content: [{ type: "text", text: JSON.stringify(words, null, 2) }],
          jsonSchema: enrichSchema,
          output: EnrichOutput,
        },
        ctx,
      ),
  };
}

/** Checks the stop reason before touching the content, then parses and validates the JSON. */
function readResponse<T>(response: BetaMessage, output: z.ZodType<T>): Outcome<T> {
  switch (response.stop_reason) {
    case "refusal":
      return fail(
        "refused",
        `Claude declined the request (${response.stop_details?.category ?? "no category"})`,
      );
    case "max_tokens":
    case "model_context_window_exceeded":
      return fail("too_long", "The response was cut off before it was complete");
  }

  // A fallback can add `fallback` blocks, so look for the text block instead of content[0].
  const text = response.content.find((block) => block.type === "text")?.text;
  if (text === undefined) return fail("invalid_output", "The response had no text");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("invalid_output", "The response was not valid JSON");
  }

  const parsed = output.safeParse(json);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : fail("invalid_output", `The response did not match the schema: ${parsed.error.message}`);
}

const fail = (code: AiError["code"], message: string): Outcome<never> => ({
  ok: false,
  error: new AiError(code, message),
});

/**
 * Total tokens across every model that ran. When a fallback runs, the top-level usage covers only
 * the final attempt; `usage.iterations` lists each one.
 */
function countTokens(response: BetaMessage): { inputTokens: number; outputTokens: number } {
  const usage = response.usage;
  const parts: Array<{
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  }> = usage.iterations?.length ? usage.iterations : [usage];

  return parts.reduce(
    (sum, part) => ({
      inputTokens:
        sum.inputTokens +
        part.input_tokens +
        (part.cache_creation_input_tokens ?? 0) +
        (part.cache_read_input_tokens ?? 0),
      outputTokens: sum.outputTokens + part.output_tokens,
    }),
    { inputTokens: 0, outputTokens: 0 },
  );
}

/** Rate limits, overload and network failures (after the SDK's retries) become `busy`. */
function toAiError(error: unknown): unknown {
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError("busy", "Couldn't reach Claude", { cause: error });
  }
  if (error instanceof Anthropic.APIError && (error.status === 429 || error.status >= 500)) {
    return new AiError("busy", `Claude is busy (${error.status})`, { cause: error });
  }
  // Anything else (bad request, bad API key) is a bug or a configuration problem: let it surface.
  return error;
}
