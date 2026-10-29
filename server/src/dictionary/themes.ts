import { Article, knownThemes, Pos, type ThemeKey } from "@language-app/core";
import { and, inArray, isNull, type SQL, sql } from "drizzle-orm";
import type { Executor } from "../db/client";
import { dictionaryThemes, words } from "../db/schema";

// The dictionary's themes (docs/design.md §7 Themes): the file the one-off dictionary run
// (`themes:classify`) writes and `import:wiktionary` loads (`DICTIONARY_THEMES_FILE` in load.ts),
// and the step that gives words still without themes the dictionary's.
//
// The file is tab-separated, one dictionary word per line (lemma, part of speech, a noun's
// article, its theme keys joined by commas), sorted, under a header line. Plain text: git stores
// it compressed, and a later run changes only the lines it changes.

const HEADER = "lemma\tpos\tarticle\tthemes";

/** One word of the themes file, keyed as `words` is. */
export type ThemesRow = {
  lemma: string;
  pos: Pos;
  article: Article | null;
  themes: ThemeKey[];
};

/**
 * Reads a themes file. Every line must have its four columns, a known part of speech and an
 * article only of der, die or das; the themes are checked against THEMES as the run checks them
 * (unknown keys dropped, at most 2 kept). A line it can't read is an error naming it.
 */
export function parseThemesFile(text: string): ThemesRow[] {
  const lines = text.split("\n");
  if (lines[0]?.replace(/\r$/, "") !== HEADER) {
    throw new Error(`Not a themes file: its first line must be the header "${HEADER}"`);
  }
  const rows: ThemesRow[] = [];
  const seen = new Set<string>();
  lines.forEach((raw, index) => {
    const line = raw.replace(/\r$/, "");
    if (index === 0 || line === "") return;
    const fail = (why: string) => new Error(`Themes file, line ${index + 1}: ${why} ("${line}")`);

    // Empty columns at the end may be left out (an editor may strip the tabs).
    const columns = line.split("\t");
    if (columns.length < 2 || columns.length > 4) {
      throw fail("expected lemma, pos, article and themes");
    }
    const [lemma = "", posText = "", articleText = "", themesText = ""] = columns;
    const pos = Pos.safeParse(posText);
    const article = articleText === "" ? null : Article.safeParse(articleText).data;
    if (!lemma) throw fail("no lemma");
    if (!pos.success) throw fail(`unknown part of speech "${posText}"`);
    if (article === undefined) throw fail(`unknown article "${articleText}"`);

    const key = `${lemma}\t${pos.data}\t${article ?? ""}`;
    if (seen.has(key)) throw fail("the word is listed twice");
    seen.add(key);
    rows.push({
      lemma,
      pos: pos.data,
      article,
      themes: knownThemes(themesText === "" ? [] : themesText.split(",")),
    });
  });
  return rows;
}

/**
 * Writes rows as a themes file: the header, then one line per word, sorted. Empty columns at the
 * end are left out ("und\tconjunction": no article, no theme).
 */
export function formatThemesFile(rows: ThemesRow[]): string {
  const lines = rows
    .map((row) =>
      [row.lemma, row.pos, row.article ?? "", row.themes.join(",")].join("\t").replace(/\t+$/, ""),
    )
    .sort(byCodePoint);
  return `${[HEADER, ...lines].join("\n")}\n`;
}

/** The same order on every machine, whatever its locale: by code point. */
const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Rows per INSERT; each row is four values in four array parameters. */
const THEMES_BATCH = 20_000;

/** Replaces dictionary_themes with these rows, inside the dictionary's load (§7 Themes). */
export async function replaceDictionaryThemes(tx: Executor, rows: ThemesRow[]): Promise<void> {
  await tx.execute(sql`TRUNCATE ${dictionaryThemes}`);
  for (let i = 0; i < rows.length; i += THEMES_BATCH) {
    const batch = rows.slice(i, i + THEMES_BATCH);
    const column = (pick: (row: ThemesRow) => string | null) => sql.param(batch.map(pick));
    // Arrays of arrays can't be unnested row by row, so the themes travel joined by commas.
    await tx.execute(sql`
      INSERT INTO ${dictionaryThemes} (lemma, pos, article, themes)
      SELECT lemma, pos, article, string_to_array(themes, ',')
      FROM unnest(
        ${column((r) => r.lemma)}::text[],
        ${column((r) => r.pos)}::text[],
        ${column((r) => r.article)}::text[],
        ${column((r) => r.themes.join(","))}::text[]
      ) AS t(lemma, pos, article, themes)`);
  }
}

/**
 * Gives words still without themes the dictionary's themes for their (lemma, part of speech,
 * article), in one statement: the given words (a save, enrichment's dictionary step), or every
 * word (loading the dictionary). A word whose themes are decided, `{}` included, is left alone.
 * Returns how many words got themes.
 */
export async function themesFromDictionary(tx: Executor, wordIds?: number[]): Promise<number> {
  if (wordIds?.length === 0) return 0;
  const which: SQL | undefined = wordIds ? inArray(words.id, wordIds) : undefined;
  const updated = await tx
    .update(words)
    .set({ themes: sql`${dictionaryThemes.themes}` })
    .from(dictionaryThemes)
    .where(
      and(
        which,
        isNull(words.themes),
        // The dictionary is the German one.
        sql`${words.language} = 'de'`,
        sql`${dictionaryThemes.lemma} = ${words.lemma}`,
        sql`${dictionaryThemes.pos} = ${words.pos}`,
        // A word's article is null for everything but nouns, as the dictionary's is.
        sql`${dictionaryThemes.article} IS NOT DISTINCT FROM ${words.article}`,
      ),
    )
    .returning({ id: words.id });
  return updated.length;
}
