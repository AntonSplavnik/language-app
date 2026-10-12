import type { Article, Pos } from "@language-app/core";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { words } from "../../src/db/schema";
import { loadDictionary } from "../../src/dictionary/load";
import { backfillPronunciation } from "../../src/words/pronunciation";
import { first, useTestDb } from "../helpers/db";

const db = useTestDb();
const SAMPLE = new URL("../fixtures/kaikki-sample.jsonl", import.meta.url).pathname;

beforeEach(async () => {
  await loadDictionary(db, SAMPLE);
});

/** A shared word as saved before pronunciation existed: enriched, but without IPA or recording. */
async function addWord(
  lemma: string,
  pos: Pos,
  article: Article | null,
  values: Partial<typeof words.$inferInsert> = {},
) {
  const row = first(
    await db
      .insert(words)
      .values({
        language: "de",
        lemma,
        pos,
        article,
        checkStatus: "match",
        enrichedAt: new Date(),
        ...values,
      })
      .returning({ id: words.id }),
  );
  return row.id;
}

const pronunciationOf = async (id: number) =>
  first(
    await db
      .select({ ipa: words.ipa, audioFile: words.audioFile, audioUrl: words.audioUrl })
      .from(words)
      .where(eq(words.id, id)),
  );

describe("backfillPronunciation (§6.6)", () => {
  it("fills words without a pronunciation, choosing the entry as enrichment does", async () => {
    const tisch = await addWord("Tisch", "noun", "der");
    const dieBand = await addWord("Band", "noun", "die");
    const nicht = await addWord("nicht", "particle", null);
    const pending = await addWord("schnell", "adjective", null, { enrichedAt: null });
    const unknown = await addWord("Kühlschrank", "noun", "der");

    expect(await backfillPronunciation(db)).toEqual({ checked: 5, updated: 4 });

    expect(await pronunciationOf(tisch)).toEqual({
      ipa: "/tɪʃ/",
      audioFile: "De-Tisch2.ogg",
      audioUrl:
        "https://upload.wikimedia.org/wikipedia/commons/transcoded/d/de/De-Tisch2.ogg/De-Tisch2.ogg.mp3",
    });
    expect(await pronunciationOf(dieBand)).toMatchObject({
      ipa: "/bɛnt/",
      audioFile: "De-Band2.ogg",
    });
    expect(await pronunciationOf(nicht)).toMatchObject({ audioFile: "De-nicht2.ogg" });
    expect(await pronunciationOf(pending)).toMatchObject({ audioFile: "De-schnell.ogg" });
    expect(await pronunciationOf(unknown)).toEqual({ ipa: null, audioFile: null, audioUrl: null });
  });

  it("leaves a word that already has a pronunciation alone", async () => {
    const own = {
      ipa: "/tiʃ/",
      audioFile: "De-mine.ogg",
      audioUrl: "https://upload.wikimedia.org/x.mp3",
    };
    const tisch = await addWord("Tisch", "noun", "der", own);
    const ipaOnly = await addWord("schnell", "adjective", null, { ipa: "/ʃnɛl/" });

    expect(await backfillPronunciation(db)).toEqual({ checked: 0, updated: 0 });
    expect(await pronunciationOf(tisch)).toEqual(own);
    expect(await pronunciationOf(ipaOnly)).toMatchObject({ ipa: "/ʃnɛl/", audioFile: null });
  });

  it("running it again changes nothing", async () => {
    await addWord("Tisch", "noun", "der");
    await addWord("Kühlschrank", "noun", "der");
    expect(await backfillPronunciation(db)).toEqual({ checked: 2, updated: 1 });
    expect(await backfillPronunciation(db)).toEqual({ checked: 1, updated: 0 });
  });

  it("does nothing without words", async () => {
    expect(await backfillPronunciation(db)).toEqual({ checked: 0, updated: 0 });
  });
});
