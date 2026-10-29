import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MessageBatchIndividualResponse } from "@anthropic-ai/sdk/resources/messages/batches";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages";
import type { ThemesInputItem } from "@language-app/core";
import { describe, expect, it } from "vitest";
import {
  type BatchApi,
  type ClassifyItem,
  dictionaryItems,
  runClassify,
  statePathFor,
} from "../../scripts/themes";
import {
  CLASSIFY_EFFORT,
  CLASSIFY_MODEL,
  readThemesAnswer,
  THEME_RULES,
  themesRequest,
} from "../../src/ai/themes";
import { loadDictionary } from "../../src/dictionary/load";
import { parseThemesFile } from "../../src/dictionary/themes";
import { useTestDb } from "../helpers/db";

// The dictionary run (docs/design.md §7 Themes): which words it sends, the requests, how an answer is
// checked, and the resumable run over the Message Batches API, answered here by a fake: `pnpm test`
// never calls Claude.

const db = useTestDb();
const SAMPLE = new URL("../fixtures/kaikki-sample.jsonl", import.meta.url).pathname;
const scratch = mkdtempSync(join(tmpdir(), "classify-test-"));

const item = (
  lemma: string,
  pos: ClassifyItem["pos"],
  article: ClassifyItem["article"] = null,
) => ({
  lemma,
  pos,
  article,
  glosses: [`${lemma} gloss`],
});

/** A finished message whose text is this JSON, as the Batches API returns it. */
function message(json: unknown, extra: Partial<Message> = {}): Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: CLASSIFY_MODEL,
    content: [{ type: "text", text: JSON.stringify(json), citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 200,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    ...extra,
  } as unknown as Message;
}

describe("dictionaryItems: what the dictionary run sends (§7 Themes)", () => {
  it("one item per (lemma, part of speech, article), a noun with two genders twice", async () => {
    await loadDictionary(db, SAMPLE);
    const items = await dictionaryItems(db);
    const keys = items.map((i) => `${i.lemma} ${i.pos} ${i.article ?? "-"}`);

    expect(keys).toEqual(expect.arrayContaining(["Liter noun das", "Liter noun der"]));
    expect(keys).toEqual(expect.arrayContaining(["See noun der", "See noun die"]));
    // A plural-only noun has no gender, so no article.
    expect(keys).toContain("Eltern noun -");
    expect(keys).toEqual(expect.arrayContaining(["nicht adverb -", "nicht interjection -"]));
    // Two entries for die Bank are one word.
    expect(keys.filter((k) => k === "Bank noun die")).toHaveLength(1);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("sorted, as the file is", async () => {
    await loadDictionary(db, SAMPLE);
    const items = await dictionaryItems(db);
    const lines = items.map((i) => `${i.lemma}\t${i.pos}\t${i.article ?? ""}`);
    expect(lines).toEqual([...lines].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it("up to three glosses, taken from each entry in turn so every meaning is there", async () => {
    await loadDictionary(db, SAMPLE);
    const bank = (await dictionaryItems(db)).find((i) => i.lemma === "Bank");
    expect(bank?.glosses).toHaveLength(3);
    expect(bank?.glosses[0]).toMatch(/^bench/);
    expect(bank?.glosses[1]).toMatch(/^bank \(financial institution\)/);
  });

  it("only the lemmas asked for, then the first N", async () => {
    await loadDictionary(db, SAMPLE);
    const only = await dictionaryItems(db, { only: new Set(["See", "und", "Quatsch"]) });
    expect(only.map((i) => `${i.lemma} ${i.pos} ${i.article ?? "-"}`)).toEqual([
      "See noun der",
      "See noun die",
      "und conjunction -",
      "und interjection -",
    ]);
    const all = await dictionaryItems(db);
    expect(await dictionaryItems(db, { limit: 5 })).toEqual(all.slice(0, 5));
  });
});

describe("the dictionary run's request (§7 Themes)", () => {
  const items = [item("Arzt", "noun", "der"), item("und", "conjunction")];

  it("is Haiku 5.5 at low effort with structured output, numbering the words", () => {
    const params = themesRequest(items);
    expect(CLASSIFY_MODEL).toBe("claude-haiku-5-5");
    expect(CLASSIFY_EFFORT).toBe("low");
    expect(params.model).toBe(CLASSIFY_MODEL);
    expect(params.output_config?.effort).toBe("low");
    expect(params.output_config?.format?.type).toBe("json_schema");
    // Haiku 5.5 thinks adaptively by default; nothing to set, and no server-side fallback.
    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("fallbacks");

    const sent = JSON.parse(String(params.messages[0]?.content)) as ThemesInputItem[];
    expect(sent).toEqual([
      { ref: 0, lemma: "Arzt", pos: "noun", article: "der", glosses: ["Arzt gloss"] },
      { ref: 1, lemma: "und", pos: "conjunction", article: null, glosses: ["und gloss"] },
    ]);
  });

  it("sends the same rules as Call 2", () => {
    expect(String(themesRequest(items).system)).toContain(THEME_RULES);
  });
});

describe("readThemesAnswer: an answer checked against THEMES (§7 Themes)", () => {
  const items = [
    item("Arzt", "noun", "der"),
    item("Tisch", "noun", "der"),
    item("und", "conjunction"),
  ];

  it("matches each answer to its word by ref; unknown keys dropped, at most 2 kept", () => {
    const answer = readThemesAnswer(
      message({
        words: [
          { ref: 2, lemma: "und", themes: [] },
          { ref: 0, lemma: "Arzt", themes: ["body", "medicine", "work", "school"] },
          { ref: 1, lemma: "Tisch", themes: ["home"] },
        ],
      }),
      items,
    );
    expect(answer.problem).toBeUndefined();
    expect([...answer.themes.entries()].sort()).toEqual([
      [0, ["body", "work"]],
      [1, ["home"]],
      [2, []],
    ]);
  });

  it("leaves out an answer whose lemma isn't its word's, and words without an answer", () => {
    const answer = readThemesAnswer(
      message({
        words: [
          { ref: 0, lemma: "Tisch", themes: ["home"] },
          { ref: 1, lemma: " Tisch ", themes: ["home"] },
          { ref: 7, lemma: "Stuhl", themes: ["home"] },
        ],
      }),
      items,
    );
    expect([...answer.themes.keys()]).toEqual([1]);
  });

  it("a refusal, a cut-off answer or invalid JSON answer nothing", () => {
    for (const bad of [
      message({ words: [] }, { stop_reason: "refusal" }),
      message({ words: [] }, { stop_reason: "max_tokens" }),
      { ...message({}), content: [{ type: "text", text: "not json", citations: null }] },
      message({ items: [] }),
    ] as Message[]) {
      const answer = readThemesAnswer(bad, items);
      expect(answer.themes.size).toBe(0);
      expect(answer.problem).toBeTruthy();
    }
  });
});

/**
 * A fake Message Batches API: answers each request with `answer`, after `pollsUntilEnded` polls.
 * Records the batches created.
 */
function fakeBatches(
  answer: (customId: string, sent: ThemesInputItem[]) => MessageBatchIndividualResponse["result"],
  { pollsUntilEnded = 1 }: { pollsUntilEnded?: number } = {},
) {
  const batches = new Map<
    string,
    { requests: Array<{ custom_id: string; sent: ThemesInputItem[] }>; polls: number }
  >();
  const api: BatchApi = {
    async create({ requests }) {
      const id = `msgbatch_${batches.size + 1}`;
      batches.set(id, {
        requests: requests.map((r) => ({
          custom_id: r.custom_id,
          sent: JSON.parse(String(r.params.messages[0]?.content)) as ThemesInputItem[],
        })),
        polls: 0,
      });
      return { id };
    },
    async retrieve(id) {
      const batch = batches.get(id);
      if (!batch) throw new Error(`no batch ${id}`);
      batch.polls++;
      return {
        id,
        processing_status: batch.polls >= pollsUntilEnded ? "ended" : "in_progress",
        request_counts: { processing: 0, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
      };
    },
    async results(id) {
      const batch = batches.get(id);
      if (!batch) throw new Error(`no batch ${id}`);
      return (async function* () {
        for (const request of batch.requests) {
          yield { custom_id: request.custom_id, result: answer(request.custom_id, request.sent) };
        }
      })();
    },
  };
  return { api, batches };
}

/** Every word answered with one theme, "home". */
const answerAll = (
  _id: string,
  sent: ThemesInputItem[],
): MessageBatchIndividualResponse["result"] => ({
  type: "succeeded",
  message: message({ words: sent.map((s) => ({ ref: s.ref, lemma: s.lemma, themes: ["home"] })) }),
});

const ITEMS: ClassifyItem[] = [
  item("Arzt", "noun", "der"),
  item("Bank", "noun", "die"),
  item("See", "noun", "der"),
  item("See", "noun", "die"),
  item("und", "conjunction"),
];

function runOptions(
  name: string,
  api: BatchApi,
  extra: Partial<Parameters<typeof runClassify>[0]> = {},
) {
  const out = join(scratch, `${name}.tsv`);
  const lines: string[] = [];
  return {
    out,
    lines,
    options: {
      items: ITEMS,
      api,
      out,
      chunkSize: 2,
      pollMs: 0,
      sleep: async () => {},
      log: (line: string) => lines.push(line),
      ...extra,
    },
  };
}

describe("runClassify: the run over the Message Batches API (§7 Themes)", () => {
  it("sends the words a few per request in one batch, then writes the file", async () => {
    const fake = fakeBatches(answerAll);
    const run = runOptions("all", fake.api);

    const summary = await runClassify(run.options);

    expect([...fake.batches.values()].map((b) => b.requests.map((r) => r.sent.length))).toEqual([
      [2, 2, 1],
    ]);
    expect(parseThemesFile(readFileSync(run.out, "utf8"))).toHaveLength(5);
    expect(summary).toMatchObject({ items: 5, answered: 5, missing: 0 });
    expect(summary.inputTokens).toBe(3000);
    expect(summary.outputTokens).toBe(600);
  });

  it("sends again what a failed request or a missing answer left out, in a later round", async () => {
    const fake = fakeBatches((customId, sent) => {
      // The first round's first request fails, and its last answer forgets und.
      if (customId === "r1-0") {
        return {
          type: "errored",
          error: { type: "error", error: { type: "overloaded_error", message: "busy" } },
        } as MessageBatchIndividualResponse["result"];
      }
      const answered = customId.startsWith("r1-") ? sent.filter((s) => s.lemma !== "und") : sent;
      return answerAll(customId, answered);
    });
    const run = runOptions("retry", fake.api);

    const summary = await runClassify(run.options);

    const sizes = [...fake.batches.values()].map((b) =>
      b.requests.map((r) => r.sent.map((s) => s.lemma)),
    );
    expect(sizes).toEqual([
      [["Arzt", "Bank"], ["See", "See"], ["und"]],
      [["Arzt", "Bank"], ["und"]],
    ]);
    expect(summary).toMatchObject({ answered: 5, missing: 0 });
  });

  it("is resumable: an interrupted run goes on with its batch instead of sending it again", async () => {
    const fake = fakeBatches(answerAll, { pollsUntilEnded: 2 });
    const interrupted = runOptions("resume", fake.api, {
      sleep: async () => {
        throw new Error("interrupted");
      },
    });

    await expect(runClassify(interrupted.options)).rejects.toThrow("interrupted");
    const state = JSON.parse(readFileSync(statePathFor(interrupted.out), "utf8"));
    expect(state.batches.map((b: { id: string }) => b.id)).toEqual(["msgbatch_1"]);
    expect(existsSync(interrupted.out)).toBe(false);

    const resumed = runOptions("resume", fake.api);
    const summary = await runClassify(resumed.options);

    expect(fake.batches.size).toBe(1);
    expect(summary).toMatchObject({ answered: 5, missing: 0 });
    expect(parseThemesFile(readFileSync(resumed.out, "utf8"))).toHaveLength(5);
  });

  it("refuses the state of another run (other words, prompt or model)", async () => {
    const fake = fakeBatches(answerAll);
    const first = runOptions("other", fake.api);
    await runClassify(first.options);

    const second = runOptions("other", fake.api, { items: ITEMS.slice(0, 3) });
    await expect(runClassify(second.options)).rejects.toThrow(/state .* another run/);
  });

  it("gives up after a few rounds, writing the words it has and naming the rest", async () => {
    const fake = fakeBatches((customId, sent) =>
      answerAll(
        customId,
        sent.filter((s) => s.lemma !== "und"),
      ),
    );
    const run = runOptions("give-up", fake.api);

    const summary = await runClassify(run.options);

    expect(summary).toMatchObject({ answered: 4, missing: 1 });
    expect(fake.batches.size).toBe(3);
    expect(parseThemesFile(readFileSync(run.out, "utf8")).map((r) => r.lemma)).not.toContain("und");
    expect(run.lines.join("\n")).toMatch(/1 word without an answer.*und/s);
  });

  it("makes the output's folder when it isn't there yet (server/data/ before the first run)", async () => {
    const run = runOptions("unused", fakeBatches(answerAll).api);
    const out = join(scratch, "not-yet", "dictionary-themes.tsv");
    await runClassify({ ...run.options, out });
    expect(parseThemesFile(readFileSync(out, "utf8"))).toHaveLength(5);
    expect(existsSync(statePathFor(out))).toBe(true);
  });

  it("state lives next to the output", () => {
    expect(statePathFor("/x/dictionary-themes.tsv")).toBe("/x/dictionary-themes.state.json");
    expect(statePathFor("/x/dictionary-themes.sample.tsv")).toBe(
      "/x/dictionary-themes.sample.state.json",
    );
  });
});
