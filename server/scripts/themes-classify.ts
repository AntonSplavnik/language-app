// The dictionary run (docs/design.md §7 Themes): themes every distinct (lemma, part of speech, article)
// of dictionary_entries once, with up to three of its glosses, through the Message Batches API
// (half price; Claude Haiku 5.5 at low effort, structured output), and writes
// server/data/dictionary-themes.tsv, which import:wiktionary loads. Run it on the Mac, against the
// Mac's dictionary; never in tests or production. Paid: see --estimate first.
//
//   pnpm --filter server themes:classify             the whole dictionary
//   pnpm --filter server themes:classify --estimate  count the words, estimate tokens and cost
//   pnpm --filter server themes:classify --limit 300 [--only lemmas.txt] [--out file.tsv]
//
// --limit N themes only the first N words, and --only a file of lemmas (one per line) only those;
// either is a sample, written to server/data/dictionary-themes.sample.tsv (git-ignored), never to
// the real file. Resumable: batch ids and the answers so far are kept beside the output
// (….state.json, git-ignored), so running the same command again goes on where it stopped.
// --estimate counts input tokens with the API's token counting, which is free and runs no model.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { CLASSIFY_EFFORT, CLASSIFY_MODEL, themesRequest } from "../src/ai/themes";
import { loadEnvFile, parseConfig } from "../src/config";
import { createDb } from "../src/db/client";
import { DICTIONARY_THEMES_FILE } from "../src/dictionary/load";
import { parseThemesFile } from "../src/dictionary/themes";
import { databaseName } from "./prompt";
import {
  BATCH_PRICES,
  batchCost,
  CHUNK_SIZE,
  type ClassifyItem,
  dictionaryItems,
  runClassify,
  statePathFor,
  themeCounts,
} from "./themes";

const SAMPLE_FILE = fileURLToPath(new URL("../data/dictionary-themes.sample.tsv", import.meta.url));
/**
 * Output tokens per word, thinking included, measured on the sample run of 2026-10-29 (294 words,
 * 7,579 tokens out; Claude Haiku 5.5, low effort); --estimate uses it, as output can't be counted
 * ahead.
 */
const OUTPUT_TOKENS_PER_WORD = 26;
/** Requests --estimate counts the input tokens of, spread over the run. */
const COUNTED_REQUESTS = 5;

const { values } = parseArgs({
  options: {
    estimate: { type: "boolean" },
    limit: { type: "string" },
    only: { type: "string" },
    out: { type: "string" },
  },
});
const fromHere = (path: string) => resolve(process.env.INIT_CWD ?? process.cwd(), path);
const limit = values.limit === undefined ? undefined : Number(values.limit);
if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) {
  console.error("--limit takes a whole number above 0");
  process.exit(1);
}
const only = values.only
  ? new Set(
      readFileSync(fromHere(values.only), "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#")),
    )
  : undefined;
const sample = limit !== undefined || only !== undefined;
const out = values.out ? fromHere(values.out) : sample ? SAMPLE_FILE : DICTIONARY_THEMES_FILE;

loadEnvFile();
const config = parseConfig(process.env);
console.log(`Database: ${databaseName(config.DATABASE_URL)}`);
const db = createDb(config.DATABASE_URL);
const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

try {
  const items = await dictionaryItems(db, { only, limit });
  if (items.length === 0) {
    throw new Error("No dictionary words to theme: load the dictionary first (import:wiktionary)");
  }
  const requests = Math.ceil(items.length / CHUNK_SIZE);
  console.log(
    `${items.length} dictionary words${sample ? " (a sample)" : ""}, ${requests} requests of up ` +
      `to ${CHUNK_SIZE}, ${CLASSIFY_MODEL} at ${CLASSIFY_EFFORT} effort, Message Batches API`,
  );

  if (values.estimate) await estimate(items, requests);
  else await classify(items);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}

/** Input tokens counted on a few requests (free), output from the measured tokens per word. */
async function estimate(items: ClassifyItem[], requests: number) {
  const counted: number[] = [];
  const step = Math.max(1, Math.floor(requests / COUNTED_REQUESTS));
  for (let r = 0; r < requests && counted.length < COUNTED_REQUESTS; r += step) {
    const words = items.slice(r * CHUNK_SIZE, (r + 1) * CHUNK_SIZE);
    const { model, system, messages, output_config } = themesRequest(words);
    const { input_tokens } = await client.messages.countTokens({
      model,
      system,
      messages,
      output_config,
    });
    counted.push(input_tokens / words.length);
  }
  const perWord = counted.reduce((sum, n) => sum + n, 0) / counted.length;
  const input = Math.round(perWord * items.length);
  const output = OUTPUT_TOKENS_PER_WORD * items.length;
  console.log(
    `Input: ≈${input.toLocaleString("en")} tokens (${perWord.toFixed(1)} a word, prompt ` +
      `included, counted on ${counted.length} requests with the token counting API)`,
  );
  console.log(
    `Output: ≈${output.toLocaleString("en")} tokens (${OUTPUT_TOKENS_PER_WORD} a word, as ` +
      "measured on the sample run of 2026-10-29)",
  );
  console.log(
    `Cost: ≈$${batchCost(input, output).toFixed(3)} at batch prices ($${BATCH_PRICES.input} / ` +
      `$${BATCH_PRICES.output} per million tokens in / out). Nothing was sent to the model.`,
  );
}

async function classify(items: ClassifyItem[]) {
  console.log(`Writing ${out}; state in ${statePathFor(out)}`);
  const started = performance.now();
  const summary = await runClassify({
    items,
    api: client.messages.batches,
    out,
    log: (line) => console.log(line),
  });
  const minutes = ((performance.now() - started) / 60_000).toFixed(1);
  console.log(
    `\n${summary.answered} of ${summary.items} words themed (${summary.withThemes} with a theme, ` +
      `${summary.answered - summary.withThemes} with none) in ${minutes} min.`,
  );
  console.log(
    `Tokens: ${summary.inputTokens.toLocaleString("en")} in, ` +
      `${summary.outputTokens.toLocaleString("en")} out ` +
      `(${(summary.outputTokens / Math.max(summary.answered, 1)).toFixed(1)} out a word); ` +
      `cost $${summary.cost.toFixed(4)} at batch prices.`,
  );
  console.log("Words per theme:");
  for (const line of themeCounts(parseThemesFile(readFileSync(out, "utf8")))) console.log(line);
}
