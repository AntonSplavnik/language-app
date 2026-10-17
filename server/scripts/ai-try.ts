// Runs one real Claude call by hand, prints the result, tokens, latency and cost, and can save the
// raw response as a test fixture.
//
//   pnpm --filter server ai:try extract <photo> [--save <name>]
//   pnpm --filter server ai:try enrich <words.json> [--save <name>]
//   pnpm --filter server ai:try describe <text> [--entry <entry.json>] [--save <name>]
//
// Photos are shrunk exactly like the web app does (JPEG, longest side 1600 px, quality 0.85),
// using macOS `sips`. Paths are relative to the directory you run the command from. For describe
// (Ask AI, §11.6), `--entry` is a JSON file with the chosen entry: { lemma, pos, article, glosses }.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { DescribeInput, EnrichInputWord } from "@language-app/core";
import { z } from "zod";
import { createClaudeAi } from "../src/ai/claude";
import { describeSystemPrompt, enrichSystemPrompt, extractSystemPrompt } from "../src/ai/prompts";
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
const KINDS = ["extract", "enrich", "describe"] as const;
type Kind = (typeof KINDS)[number];

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { save: { type: "string" }, entry: { type: "string" } },
});
const [kindArg, inputArg] = positionals;
if (!KINDS.includes(kindArg as Kind) || !inputArg) {
  console.error(
    "Usage: ai:try extract <photo> [--save name] | ai:try enrich <words.json> [--save name] | " +
      "ai:try describe <text> [--entry entry.json] [--save name]",
  );
  process.exit(1);
}
const kind = kindArg as Kind;
const resolveInput = (path: string) => resolve(process.env.INIT_CWD ?? process.cwd(), path);

loadEnvFile();
const config = parseConfig(process.env);
const MODELS: Record<Kind, string> = {
  extract: config.AI_MODEL_EXTRACT,
  enrich: config.AI_MODEL_ENRICH,
  describe: config.AI_MODEL_DESCRIBE,
};
const SYSTEM_PROMPTS: Record<Kind, (language: string) => string> = {
  extract: extractSystemPrompt,
  enrich: enrichSystemPrompt,
  describe: describeSystemPrompt,
};

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
  models: MODELS,
  effort: config.AI_EFFORT,
  learnerLanguage: LEARNER_LANGUAGE,
});
const ctx = { userId: SINGLE_USER_ID, importId: null };

const started = performance.now();
let result: unknown;
let input: EnrichInputWord[] | DescribeInput | undefined;
try {
  if (kind === "extract") {
    const jpeg = shrinkLikeTheBrowser(resolveInput(inputArg));
    console.log(`Photo: ${basename(inputArg)} → ${Math.round(jpeg.length / 1024)} KB JPEG`);
    const output = await ai.extractWords(jpeg, ctx);
    result = output;
    console.table(output.words);
    console.log(`Page quality: ${output.pageQuality} · ${output.words.length} words`);
  } else if (kind === "enrich") {
    const words = z
      .array(EnrichInputWord)
      .parse(JSON.parse(readFileSync(resolveInput(inputArg), "utf8")));
    input = words;
    const output = await ai.enrichWords(words, ctx);
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
  } else {
    const described = DescribeInput.parse({
      text: inputArg,
      ...(values.entry
        ? { entry: JSON.parse(readFileSync(resolveInput(values.entry), "utf8")) }
        : {}),
    });
    input = described;
    const output = await ai.describeWord(described, ctx);
    result = output;
    console.log(`"${described.text}"${described.entry ? ` (entry ${described.entry.lemma})` : ""}`);
    console.log(output);
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
  const system = SYSTEM_PROMPTS[kind](LEARNER_LANGUAGE);
  const fixture = {
    meta: {
      kind,
      source: kind === "describe" ? inputArg : basename(inputArg),
      recordedAt: new Date().toISOString(),
      requestedModel: MODELS[kind],
      effort: config.AI_EFFORT,
      promptHash: createHash("sha256").update(system).digest("hex").slice(0, 12),
      durationMs: usage.at(-1)?.durationMs,
    },
    ...(input ? { input } : {}),
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
