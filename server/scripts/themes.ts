import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  MessageBatchIndividualResponse,
  MessageBatchRequestCounts,
} from "@anthropic-ai/sdk/resources/messages/batches";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages";
import { THEMES, type ThemeKey } from "@language-app/core";
import { asc } from "drizzle-orm";
import {
  CLASSIFY_EFFORT,
  CLASSIFY_MODEL,
  classifyThemesSystemPrompt,
  readThemesAnswer,
  type ThemesWord,
  themesRequest,
} from "../src/ai/themes";
import type { Executor } from "../src/db/client";
import { dictionaryEntries } from "../src/db/schema";
import { formatThemesFile, type ThemesRow } from "../src/dictionary/themes";

// The dictionary run (docs/design.md §7, Themes): every distinct dictionary word themed once, through
// the Message Batches API, into the file import:wiktionary loads. The CLI is themes-classify.ts.

/** A dictionary word to theme: its identity, as `words` keys it, and up to three glosses. */
export type ClassifyItem = ThemesWord;

/** Words per request: a few hundred, so a request's answer stays well within max_tokens. */
export const CHUNK_SIZE = 200;
/** Rounds of batches before giving up on words that never got a usable answer. */
export const MAX_ROUNDS = 3;
/** Glosses per word, and the longest one sent; Wiktionary's are sometimes paragraphs. */
const GLOSSES = 3;
const GLOSS_MAX = 120;

/** USD per million tokens on the Batches API: half of Claude Haiku 5.5's $0.10 / $0.50 (§11.4). */
export const BATCH_PRICES = { input: 0.05, output: 0.25 };

/**
 * Every distinct (lemma, part of speech, article) of the dictionary, sorted as the file is. A
 * noun's article comes from its entry's genders, so an entry with two genders gives two words
 * (der/das Liter); a noun without a gender (Eltern) and every other word have none. The glosses
 * are taken from the word's entries in turn (die Bank: bench, then bank), up to three.
 */
export async function dictionaryItems(
  db: Executor,
  { only, limit }: { only?: Set<string>; limit?: number } = {},
): Promise<ClassifyItem[]> {
  const entries = await db
    .select({
      lemma: dictionaryEntries.lemma,
      pos: dictionaryEntries.pos,
      genders: dictionaryEntries.genders,
      glosses: dictionaryEntries.glossesEn,
    })
    .from(dictionaryEntries)
    .orderBy(asc(dictionaryEntries.id));

  const byKey = new Map<string, { item: ClassifyItem; senses: string[][] }>();
  for (const entry of entries) {
    if (only && !only.has(entry.lemma)) continue;
    const articles = entry.pos === "noun" && entry.genders.length > 0 ? entry.genders : [null];
    for (const article of articles) {
      const key = itemKey({ lemma: entry.lemma, pos: entry.pos, article });
      const found = byKey.get(key);
      if (found) found.senses.push(entry.glosses);
      else {
        byKey.set(key, {
          item: { lemma: entry.lemma, pos: entry.pos, article, glosses: [] },
          senses: [entry.glosses],
        });
      }
    }
  }

  const items = [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, { item, senses }]) => ({ ...item, glosses: takeInTurn(senses) }));
  return limit === undefined ? items : items.slice(0, limit);
}

/** The key the themes file sorts by: lemma, part of speech and article, tab-separated. */
const itemKey = (item: Pick<ClassifyItem, "lemma" | "pos" | "article">) =>
  `${item.lemma}\t${item.pos}\t${item.article ?? ""}`;

/** The first gloss of each sense, then the second of each, and so on, up to three, shortened. */
function takeInTurn(senses: string[][]): string[] {
  const glosses: string[] = [];
  for (let i = 0; glosses.length < GLOSSES && senses.some((s) => i < s.length); i++) {
    for (const sense of senses) {
      const gloss = sense[i]?.trim();
      if (!gloss || glosses.includes(gloss)) continue;
      glosses.push(gloss.length > GLOSS_MAX ? `${gloss.slice(0, GLOSS_MAX - 1)}…` : gloss);
      if (glosses.length === GLOSSES) break;
    }
  }
  return glosses;
}

/** The part of the Message Batches API the run uses; the SDK's `client.messages.batches`. */
export type BatchApi = {
  create(body: {
    requests: Array<{ custom_id: string; params: MessageCreateParamsNonStreaming }>;
  }): Promise<{ id: string }>;
  retrieve(id: string): Promise<{
    id: string;
    processing_status: "in_progress" | "canceling" | "ended";
    request_counts: MessageBatchRequestCounts;
  }>;
  results(id: string): Promise<AsyncIterable<MessageBatchIndividualResponse>>;
};

/**
 * What a run has done so far, saved after every step so an interrupted run goes on where it was:
 * the batches sent (with which words each request carried) and every word's themes once answered.
 */
type ClassifyState = {
  /** Which run this is: the words, the prompt, the model and effort. */
  fingerprint: string;
  /** Per word, in the order of the items: its themes, or null until answered. */
  themes: Array<ThemeKey[] | null>;
  batches: Array<{
    id: string;
    round: number;
    /** custom_id → the words (their positions in the items) that request carried. */
    requests: Record<string, number[]>;
    done: boolean;
  }>;
  inputTokens: number;
  outputTokens: number;
  /** Requests that came back without a usable answer, by why. */
  failures: Record<string, number>;
};

/** The state file of a run that writes `out`: beside it, `….state.json` (git-ignored). */
export const statePathFor = (out: string) => `${out.replace(/\.tsv$/, "")}.state.json`;

const fingerprintOf = (items: ClassifyItem[]) =>
  createHash("sha256")
    .update(JSON.stringify([CLASSIFY_MODEL, CLASSIFY_EFFORT, classifyThemesSystemPrompt(), items]))
    .digest("hex")
    .slice(0, 16);

export type ClassifyOptions = {
  items: ClassifyItem[];
  api: BatchApi;
  /** The themes file to write once every word is answered. */
  out: string;
  chunkSize?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
};

export type ClassifySummary = {
  items: number;
  answered: number;
  /** Words still without an answer after MAX_ROUNDS; left out of the file. */
  missing: number;
  withThemes: number;
  inputTokens: number;
  outputTokens: number;
  /** At batch prices. */
  cost: number;
};

/**
 * Themes every item through the Message Batches API and writes the themes file (§7 Themes). The words
 * go a few hundred per request, all requests of a round in one batch. A failed request, and words
 * an answer left out, go again in the next round, for at most MAX_ROUNDS rounds; words still
 * without an answer then are left out of the file, so their saved words stay undecided and
 * enrichment themes them. Resumable: the state is saved beside the output after every step.
 */
export async function runClassify(options: ClassifyOptions): Promise<ClassifySummary> {
  const { items, api, out } = options;
  const chunkSize = options.chunkSize ?? CHUNK_SIZE;
  const pollMs = options.pollMs ?? 30_000;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const log = options.log ?? (() => {});
  const statePath = statePathFor(out);
  const fingerprint = fingerprintOf(items);
  // server/data/ is in the repo only once the file is.
  mkdirSync(dirname(out), { recursive: true });

  const state = loadState(statePath, fingerprint, items.length);
  const save = () => {
    // Written whole, then moved into place, so an interruption never leaves half a file.
    writeFileSync(`${statePath}.tmp`, JSON.stringify(state));
    renameSync(`${statePath}.tmp`, statePath);
  };

  for (;;) {
    const open = state.batches.filter((batch) => !batch.done);
    if (open.length > 0) {
      let waiting = false;
      for (const batch of open) {
        const status = await api.retrieve(batch.id);
        if (status.processing_status !== "ended") {
          const c = status.request_counts;
          log(
            `  ${batch.id}: ${status.processing_status}, ${c.processing} requests processing, ` +
              `${c.succeeded} done`,
          );
          waiting = true;
          continue;
        }
        await collect(api, batch, items, state);
        batch.done = true;
        save();
        log(`  ${batch.id}: ended; ${answeredCount(state)} of ${items.length} words answered`);
      }
      if (waiting) await sleep(pollMs);
      continue;
    }

    const unanswered = state.themes.flatMap((themes, index) => (themes ? [] : [index]));
    const round = state.batches.length + 1;
    if (unanswered.length === 0 || round > MAX_ROUNDS) break;

    const requests: Record<string, number[]> = {};
    for (let i = 0; i < unanswered.length; i += chunkSize) {
      requests[`r${round}-${i / chunkSize}`] = unanswered.slice(i, i + chunkSize);
    }
    const { id } = await api.create({
      requests: Object.entries(requests).map(([custom_id, indexes]) => ({
        custom_id,
        params: themesRequest(indexes.map((index) => items[index] as ClassifyItem)),
      })),
    });
    state.batches.push({ id, round, requests, done: false });
    save();
    log(
      `Round ${round}: sent ${unanswered.length} words in ${Object.keys(requests).length} ` +
        `requests as batch ${id}`,
    );
  }

  const rows: ThemesRow[] = items.flatMap((item, index) => {
    const themes = state.themes[index];
    return themes ? [{ ...item, themes }] : [];
  });
  writeFileSync(out, formatThemesFile(rows));

  const missing = items.filter((_, index) => !state.themes[index]);
  if (missing.length > 0) {
    const names = missing.slice(0, 20).map((item) => itemKey(item).replaceAll("\t", " ").trim());
    log(
      `${missing.length} ${missing.length === 1 ? "word" : "words"} without an answer after ` +
        `${MAX_ROUNDS} rounds, left out of the file: ${names.join(", ")}` +
        (missing.length > names.length ? ", …" : ""),
    );
  }
  for (const [why, count] of Object.entries(state.failures)) {
    log(`Requests without a usable answer: ${count} (${why})`);
  }

  return {
    items: items.length,
    answered: rows.length,
    missing: missing.length,
    withThemes: rows.filter((row) => row.themes.length > 0).length,
    inputTokens: state.inputTokens,
    outputTokens: state.outputTokens,
    cost: batchCost(state.inputTokens, state.outputTokens),
  };
}

export const batchCost = (inputTokens: number, outputTokens: number) =>
  (inputTokens * BATCH_PRICES.input + outputTokens * BATCH_PRICES.output) / 1e6;

function loadState(path: string, fingerprint: string, count: number): ClassifyState {
  if (!existsSync(path)) {
    return {
      fingerprint,
      themes: Array.from({ length: count }, () => null),
      batches: [],
      inputTokens: 0,
      outputTokens: 0,
      failures: {},
    };
  }
  const state = JSON.parse(readFileSync(path, "utf8")) as ClassifyState;
  if (state.fingerprint !== fingerprint) {
    throw new Error(
      `The state in ${path} is from another run (other words, prompt or model). ` +
        "Delete it to start this run from the beginning.",
    );
  }
  return state;
}

/** Reads a finished batch's results into the state: themes per word, tokens, failures. */
async function collect(
  api: BatchApi,
  batch: ClassifyState["batches"][number],
  items: ClassifyItem[],
  state: ClassifyState,
) {
  for await (const response of await api.results(batch.id)) {
    const indexes = batch.requests[response.custom_id];
    if (!indexes) continue;
    const result = response.result;
    if (result.type !== "succeeded") {
      state.failures[result.type] = (state.failures[result.type] ?? 0) + 1;
      continue;
    }
    const usage = result.message.usage;
    state.inputTokens +=
      usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0);
    state.outputTokens += usage.output_tokens;

    const answer = readThemesAnswer(
      result.message,
      indexes.map((index) => items[index] as ClassifyItem),
    );
    if (answer.problem) state.failures[answer.problem] = (state.failures[answer.problem] ?? 0) + 1;
    for (const [ref, themes] of answer.themes) {
      const index = indexes[ref];
      if (index !== undefined) state.themes[index] = themes;
    }
  }
}

const answeredCount = (state: ClassifyState) => state.themes.filter(Boolean).length;

/** How many answered words got each theme, most first, and how many got none. */
export function themeCounts(rows: Array<{ themes: ThemeKey[] }>): string[] {
  const counts = new Map<string, number>(THEMES.map((theme) => [theme.key, 0]));
  let none = 0;
  for (const row of rows) {
    if (row.themes.length === 0) none++;
    for (const key of row.themes) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [
    ...[...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, n]) => `  ${key.padEnd(14)} ${String(n).padStart(6)}`),
    `  ${"(none)".padEnd(14)} ${String(none).padStart(6)}`,
  ];
}
