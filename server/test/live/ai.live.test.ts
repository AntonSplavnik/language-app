// Real Claude API calls (~15¢ per run). Run with `pnpm test:live` after changing anything under
// server/src/ai, before milestones, and when switching models (§13).
// Uses up to two photos from server/test/live/photos/ (git-ignored), a 3-word enrich batch and two
// Ask AI calls.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EnrichInputWord, knownThemes } from "@language-app/core";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { shrinkLikeTheBrowser } from "../../scripts/shrink-photo";
import { createClaudeAi } from "../../src/ai/claude";
import { anthropicTransport } from "../../src/ai/transport";
import type { UsageRecord } from "../../src/ai/usage";
import { loadEnvFile, parseConfig } from "../../src/config";
import { LEARNER_ID } from "../helpers/db";

const photosDir = fileURLToPath(new URL("./photos/", import.meta.url));
const photos = readdirSync(photosDir)
  .filter((name) => /\.(jpe?g|png|heic)$/i.test(name))
  .sort()
  .slice(0, 2);

const ctx = { userId: LEARNER_ID, importId: null, learnerLanguage: "en" };
const usage: UsageRecord[] = [];

function liveAi() {
  loadEnvFile();
  const config = parseConfig(process.env);
  return createClaudeAi({
    transport: anthropicTransport(config.ANTHROPIC_API_KEY),
    recordUsage: async (record) => {
      usage.push(record);
    },
    models: {
      extract: config.AI_MODEL_EXTRACT,
      enrich: config.AI_MODEL_ENRICH,
      describe: config.AI_MODEL_DESCRIBE,
    },
    effort: config.AI_EFFORT,
  });
}

describe("live Claude calls", () => {
  let ai: ReturnType<typeof createClaudeAi>;
  beforeAll(() => {
    ai = liveAi();
  });

  it.skipIf(photos.length === 0).each(photos)(
    "extracts a sensible word list from %s",
    async (name) => {
      const result = await ai.extractWords(shrinkLikeTheBrowser(`${photosDir}${name}`), ctx);

      expect(result.pageQuality).toBe("ok");
      expect(result.words.length).toBeGreaterThanOrEqual(20);
      for (const word of result.words) {
        expect(word.lemma, "lemma must not carry an article").not.toMatch(/^(der|die|das) /);
        if (word.pos === "noun")
          expect(word.article, `${word.lemma} needs an article`).not.toBeNull();
        else expect(word.article, `${word.lemma} is not a noun`).toBeNull();
      }
    },
  );

  it("enriches a small batch, one entry per word with forms and themes", async () => {
    const all = z
      .array(EnrichInputWord)
      .parse(
        JSON.parse(
          readFileSync(new URL("../fixtures/ai/enrich-input.json", import.meta.url), "utf8"),
        ),
      );
    const input = all.filter((w) => ["Schreibtisch", "Garage", "aufstehen"].includes(w.lemma));

    const { words } = await ai.enrichWords(input, ctx);

    expect(words.map((w) => w.ref)).toEqual(input.map((w) => w.ref));
    const byLemma = new Map(words.map((w) => [w.lemma, w]));
    expect(byLemma.get("Schreibtisch")?.plural).toBeTruthy();
    expect(byLemma.get("aufstehen")?.forms?.auxiliary).toBe("sein");
    expect(byLemma.get("Garage")).toMatchObject({ plural: null, forms: null });
    for (const word of words) expect(word.exampleDe.length).toBeGreaterThan(5);
    // Themes (§11.3): only known keys, at most 2; a desk and a garage belong to some theme.
    for (const word of words) expect(knownThemes(word.themes), word.lemma).toEqual(word.themes);
    expect(byLemma.get("Schreibtisch")?.themes.length).toBeGreaterThan(0);
    expect(byLemma.get("Garage")?.themes.length).toBeGreaterThan(0);
  });

  it("Ask AI corrects a misspelt noun to its base form with its article", async () => {
    const result = await ai.describeWord({ text: "Regenschrim" }, ctx);
    expect(result).toMatchObject({
      german: true,
      lemma: "Regenschirm",
      pos: "noun",
      article: "der",
    });
    expect(result.translation.toLowerCase()).toContain("umbrella");
  });

  it("Ask AI says an English word isn't German", async () => {
    expect((await ai.describeWord({ text: "umbrella" }, ctx)).german).toBe(false);
  });

  it("every call stayed under a minute", () => {
    for (const record of usage) expect(record.durationMs ?? 0).toBeLessThan(60_000);
    console.log(
      usage
        .map(
          (u) =>
            `${u.callType} ${u.model}: ${u.inputTokens} in / ${u.outputTokens} out, ${u.durationMs} ms`,
        )
        .join("\n"),
    );
  });
});
