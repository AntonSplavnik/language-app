// Runs one real Claude call by hand, prints the result, tokens, latency and cost, and can save the
// raw response as a test fixture.
//
//   pnpm --filter server ai:try extract <photo> [--save <name>]
//   pnpm --filter server ai:try enrich <words.json> [--save <name>]
//
// Photos are shrunk exactly like the web app does (JPEG, longest side 1600 px, quality 0.85),
// using macOS `sips`. Paths are relative to the directory you run the command from.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { EnrichInputWord } from "@language-app/core";
import { z } from "zod";
import { createClaudeAi } from "../src/ai/claude";
import { enrichSystemPrompt, extractSystemPrompt } from "../src/ai/prompts";
import { anthropicTransport, type MessageTransport } from "../src/ai/transport";
import type { UsageRecord } from "../src/ai/usage";
import { loadEnvFile, parseConfig } from "../src/config";
import { SINGLE_USER_ID } from "../src/user";
import { shrinkLikeTheBrowser } from "./shrink-photo";

/** USD per million input / output tokens (docs/design.md §11.4). */
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

const FIXTURES_DIR = fileURLToPath(new URL("../test/fixtures/ai/", import.meta.url));
const LEARNER_LANGUAGE = "en";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { save: { type: "string" } },
});
const [kind, inputPath] = positionals;
if ((kind !== "extract" && kind !== "enrich") || !inputPath) {
  console.error(
    "Usage: ai:try extract <photo> [--save name] | ai:try enrich <words.json> [--save name]",
  );
  process.exit(1);
}
const resolveInput = (path: string) => resolve(process.env.INIT_CWD ?? process.cwd(), path);

loadEnvFile();
const config = parseConfig(process.env);

const responses: BetaMessage[] = [];
const usage: UsageRecord[] = [];
const realTransport = anthropicTransport(config.ANTHROPIC_API_KEY);
const transport: MessageTransport = async (request) => {
  const response = await realTransport(request);
  responses.push(response);
  return response;
};

const ai = createClaudeAi({
  transport,
  recordUsage: async (record) => {
    usage.push(record);
  },
  models: { extract: config.AI_MODEL_EXTRACT, enrich: config.AI_MODEL_ENRICH },
  effort: config.AI_EFFORT,
  learnerLanguage: LEARNER_LANGUAGE,
});
const ctx = { userId: SINGLE_USER_ID, importId: null };

const started = performance.now();
let result: unknown;
let enrichInput: EnrichInputWord[] | undefined;
try {
  if (kind === "extract") {
    const jpeg = shrinkLikeTheBrowser(resolveInput(inputPath));
    console.log(`Photo: ${basename(inputPath)} → ${Math.round(jpeg.length / 1024)} KB JPEG`);
    const output = await ai.extractWords(jpeg, ctx);
    result = output;
    console.table(output.words);
    console.log(`Page quality: ${output.pageQuality} · ${output.words.length} words`);
  } else {
    enrichInput = z
      .array(EnrichInputWord)
      .parse(JSON.parse(readFileSync(resolveInput(inputPath), "utf8")));
    const output = await ai.enrichWords(enrichInput, ctx);
    result = output;
    for (const word of output.words) {
      const forms = word.plural
        ? `pl. ${word.plural}`
        : word.forms
          ? JSON.stringify(word.forms)
          : "";
      console.log(
        `#${word.ref} ${word.lemma} ${forms}\n   ${word.exampleDe}\n   ${word.exampleTranslation}`,
      );
    }
  }
} catch (error) {
  console.error(
    `\nFailed: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  printUsage(performance.now() - started);
}

if (values.save && result !== undefined) {
  const response = responses.at(-1);
  const system =
    kind === "extract"
      ? extractSystemPrompt(LEARNER_LANGUAGE)
      : enrichSystemPrompt(LEARNER_LANGUAGE);
  const fixture = {
    meta: {
      kind,
      source: basename(inputPath),
      recordedAt: new Date().toISOString(),
      requestedModel: kind === "extract" ? config.AI_MODEL_EXTRACT : config.AI_MODEL_ENRICH,
      effort: config.AI_EFFORT,
      promptHash: createHash("sha256").update(system).digest("hex").slice(0, 12),
      durationMs: usage.at(-1)?.durationMs,
    },
    ...(enrichInput ? { input: enrichInput } : {}),
    response,
  };
  mkdirSync(FIXTURES_DIR, { recursive: true });
  const path = join(FIXTURES_DIR, `${values.save}.json`);
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`Saved fixture: ${path}`);
}

function printUsage(totalMs: number) {
  console.log("\nAttempts:");
  let cost = 0;
  for (const u of usage) {
    const [inPrice, outPrice] = PRICES[u.model] ?? [Number.NaN, Number.NaN];
    const attemptCost = ((u.inputTokens ?? 0) * inPrice + (u.outputTokens ?? 0) * outPrice) / 1e6;
    cost += attemptCost;
    console.log(
      `  ${u.ok ? "ok    " : "failed"} ${u.model} · ${u.inputTokens ?? "-"} in / ${u.outputTokens ?? "-"} out · ` +
        `${u.stopReason ?? "no response"} · ${((u.durationMs ?? 0) / 1000).toFixed(1)} s · $${attemptCost.toFixed(4)}`,
    );
  }
  console.log(`Total: ${(totalMs / 1000).toFixed(1)} s · $${cost.toFixed(4)}`);
}
