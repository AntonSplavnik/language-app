import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Article, Pos, ThemeKey } from "@language-app/core";
import { asc, count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dictionaryEntries, dictionaryThemes, userWords, words } from "../../src/db/schema";
import { loadDictionary } from "../../src/dictionary/load";
import {
  formatThemesFile,
  parseThemesFile,
  type ThemesRow,
  themesFromDictionary,
} from "../../src/dictionary/themes";
import { first, LEARNER_ID, useTestDb } from "../helpers/db";

const db = useTestDb();
const SAMPLE = new URL("../fixtures/kaikki-sample.jsonl", import.meta.url).pathname;
const THEMES = new URL("../fixtures/dictionary-themes-sample.tsv", import.meta.url).pathname;
const scratch = mkdtempSync(join(tmpdir(), "themes-test-"));

/** A themes file with these lines (after the header), in a scratch folder. */
function themesFile(name: string, lines: string[]): string {
  const path = join(scratch, name);
  writeFileSync(path, `lemma\tpos\tarticle\tthemes\n${lines.join("\n")}\n`);
  return path;
}

const themeRows = () =>
  db
    .select()
    .from(dictionaryThemes)
    .orderBy(asc(dictionaryThemes.lemma), asc(dictionaryThemes.pos), asc(dictionaryThemes.article));

async function addWord(
  lemma: string,
  pos: Pos,
  article: Article | null,
  themes: ThemeKey[] | null = null,
) {
  return first(
    await db
      .insert(words)
      .values({ language: "de", lemma, pos, article, checkStatus: "match", themes })
      .returning({ id: words.id }),
  ).id;
}

const themesOf = async (id: number) =>
  first(await db.select({ themes: words.themes }).from(words).where(eq(words.id, id))).themes;

describe("the themes file (§7 Themes)", () => {
  it("reads one word per line: lemma, part of speech, article, themes", () => {
    const rows = parseThemesFile(
      "lemma\tpos\tarticle\tthemes\nArzt\tnoun\tder\tbody,work\nund\tconjunction\t\t\nEltern\tnoun\t\tfamily\n",
    );
    expect(rows).toEqual([
      { lemma: "Arzt", pos: "noun", article: "der", themes: ["body", "work"] },
      { lemma: "und", pos: "conjunction", article: null, themes: [] },
      { lemma: "Eltern", pos: "noun", article: null, themes: ["family"] },
    ]);
  });

  it("takes empty columns at the end as left out", () => {
    expect(
      parseThemesFile("lemma\tpos\tarticle\tthemes\nund\tconjunction\nHand\tnoun\tdie\n"),
    ).toEqual([
      { lemma: "und", pos: "conjunction", article: null, themes: [] },
      { lemma: "Hand", pos: "noun", article: "die", themes: [] },
    ]);
  });

  it("drops unknown keys and keeps at most 2, as the run does", () => {
    const [row] = parseThemesFile(
      "lemma\tpos\tarticle\tthemes\nTisch\tnoun\tder\thome,furniture,food,work\n",
    );
    expect(row?.themes).toEqual(["home", "food"]);
  });

  it("refuses a line it can't read, naming it", () => {
    expect(() => parseThemesFile("lemma\tpos\tarticle\tthemes\nArzt\n")).toThrow(/line 2/);
    expect(() => parseThemesFile("lemma\tpos\tarticle\tthemes\nA\tnoun\tder\tbody\tx\n")).toThrow(
      /line 2/,
    );
    expect(() =>
      parseThemesFile("lemma\tpos\tarticle\tthemes\nArzt\tnoun\tder\nArzt\tnoun\tder\twork\n"),
    ).toThrow(/line 3: the word is listed twice/);
    expect(() => parseThemesFile("lemma\tpos\tarticle\tthemes\nArzt\tname\t\tbody\n")).toThrow(
      /line 2/,
    );
    expect(() => parseThemesFile("lemma\tpos\tarticle\tthemes\nArzt\tnoun\tden\tbody\n")).toThrow(
      /line 2/,
    );
    expect(() => parseThemesFile("Arzt\tnoun\tder\tbody\n")).toThrow(/header/);
  });

  it("is written sorted, one line per word, and reads back the same", () => {
    const rows: ThemesRow[] = [
      { lemma: "und", pos: "conjunction", article: null, themes: [] },
      { lemma: "See", pos: "noun", article: "die", themes: ["nature"] },
      { lemma: "See", pos: "noun", article: "der", themes: ["nature", "travel"] },
      { lemma: "Arzt", pos: "noun", article: "der", themes: ["body", "work"] },
    ];
    const text = formatThemesFile(rows);
    expect(text).toBe(
      "lemma\tpos\tarticle\tthemes\n" +
        "Arzt\tnoun\tder\tbody,work\n" +
        "See\tnoun\tder\tnature,travel\n" +
        "See\tnoun\tdie\tnature\n" +
        "und\tconjunction\n",
    );
    expect(parseThemesFile(text)).toEqual([rows[3], rows[2], rows[1], rows[0]]);
  });
});

describe("loading the dictionary's themes (§7 Themes)", () => {
  it("loads dictionary_themes from the file with the dictionary", async () => {
    const result = await loadDictionary(db, SAMPLE, { themes: THEMES });

    expect(result.themes).toBe(13);
    const rows = await themeRows();
    expect(rows).toHaveLength(13);
    expect(rows).toEqual(
      expect.arrayContaining([
        { lemma: "Bank", pos: "noun", article: "die", themes: ["offices", "shopping"] },
        { lemma: "Eltern", pos: "noun", article: null, themes: ["family"] },
        // der See and die See differ.
        { lemma: "See", pos: "noun", article: "der", themes: ["nature", "travel"] },
        { lemma: "See", pos: "noun", article: "die", themes: ["nature"] },
        // Checked against THEMES as it loads: an unknown key dropped, at most 2 kept.
        { lemma: "Morgen", pos: "noun", article: "der", themes: ["time"] },
        { lemma: "Tisch", pos: "noun", article: "der", themes: ["home", "food"] },
        { lemma: "und", pos: "conjunction", article: null, themes: [] },
      ]),
    );
  });

  it("is replaced with the dictionary, not added to", async () => {
    await loadDictionary(db, SAMPLE, { themes: THEMES });
    const smaller = themesFile("smaller.tsv", ["Tisch\tnoun\tder\thome"]);
    const result = await loadDictionary(db, SAMPLE, { themes: smaller });

    expect(result.themes).toBe(1);
    expect(await themeRows()).toEqual([
      { lemma: "Tisch", pos: "noun", article: "der", themes: ["home"] },
    ]);
  });

  it("gives existing words without themes the dictionary's, in one go", async () => {
    const tisch = await addWord("Tisch", "noun", "der");
    const derSee = await addWord("See", "noun", "der");
    const dieSee = await addWord("See", "noun", "die");
    const und = await addWord("und", "conjunction", null);
    const regenschirm = await addWord("Regenschirm", "noun", "der"); // not in the file
    const tischWrongCase = await addWord("tisch", "noun", "der"); // keyed exactly, as words are

    const result = await loadDictionary(db, SAMPLE, { themes: THEMES });

    expect(result.wordsThemed).toBe(4);
    expect(await themesOf(tisch)).toEqual(["home", "food"]);
    expect(await themesOf(derSee)).toEqual(["nature", "travel"]);
    expect(await themesOf(dieSee)).toEqual(["nature"]);
    // Decided, no theme: {} rather than null.
    expect(await themesOf(und)).toEqual([]);
    expect(await themesOf(regenschirm)).toBeNull();
    expect(await themesOf(tischWrongCase)).toBeNull();
  });

  it("leaves words that have themes alone, and a learner's own choice too", async () => {
    const decided = await addWord("Tisch", "noun", "der", ["work"]);
    const none = await addWord("Handy", "noun", "das", []);
    await db.insert(userWords).values({
      userId: LEARNER_ID,
      wordId: decided,
      status: "learning",
      themes: ["free-time"],
    });

    const result = await loadDictionary(db, SAMPLE, { themes: THEMES });

    expect(result.wordsThemed).toBe(0);
    expect(await themesOf(decided)).toEqual(["work"]);
    expect(await themesOf(none)).toEqual([]);
    const [own] = await db.select({ themes: userWords.themes }).from(userWords);
    expect(own?.themes).toEqual(["free-time"]);
  });

  it("without the file loads no themes and changes nothing else", async () => {
    await loadDictionary(db, SAMPLE, { themes: THEMES });
    const before = await themeRows();
    const word = await addWord("See", "noun", "die");

    const result = await loadDictionary(db, SAMPLE, { themes: join(scratch, "missing.tsv") });

    expect(result.themes).toBeNull();
    expect(result.wordsThemed).toBe(0);
    expect(result.inserted).toBeGreaterThan(0);
    expect(await themeRows()).toEqual(before);
    expect(await themesOf(word)).toBeNull();
  });

  it("a file it can't read stops the whole load, leaving the dictionary as it was", async () => {
    await loadDictionary(db, SAMPLE, { themes: THEMES });
    const entries = (await db.select({ n: count() }).from(dictionaryEntries))[0]?.n;
    const broken = themesFile("broken.tsv", ["Tisch\tnoun\tder\thome", "Arzt\tdoctor\tder"]);

    await expect(loadDictionary(db, SAMPLE, { themes: broken })).rejects.toThrow(/line 3/);
    expect((await db.select({ n: count() }).from(dictionaryEntries))[0]?.n).toBe(entries);
    expect(await themeRows()).toHaveLength(13);
  });
});

describe("themesFromDictionary (§7 Themes, saving a word)", () => {
  it("gives the named words still without themes the dictionary's", async () => {
    await loadDictionary(db, SAMPLE, { themes: THEMES });
    const bank = await addWord("Bank", "noun", "die");
    const handy = await addWord("Handy", "noun", "das");
    const decided = await addWord("Eltern", "noun", null, ["home"]);

    expect(await themesFromDictionary(db, [bank, decided])).toBe(1);
    expect(await themesOf(bank)).toEqual(["offices", "shopping"]);
    // Not named: left for later.
    expect(await themesOf(handy)).toBeNull();
    expect(await themesOf(decided)).toEqual(["home"]);
  });

  it("does nothing for no words", async () => {
    expect(await themesFromDictionary(db, [])).toBe(0);
  });
});
