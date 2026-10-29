import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  Message,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/messages/messages";
import {
  knownThemes,
  THEMES,
  type ThemeKey,
  type ThemesInputItem,
  ThemesOutput,
} from "@language-app/core";

// How the AI chooses a word's themes (docs/design.md §7, Themes), written once: the dictionary
// run (`themes:classify`) and enrichment (Call 2) both send this text, so the two can't drift
// apart. After changing it, re-record Call 2's fixture (`ai:try enrich … --save enrich-batch`),
// run `pnpm test:live`, and run the dictionary again for the words it could affect.

/** The theme list and the rules for choosing, for a system prompt. */
export const THEME_RULES = `Themes group a learner's words by topic, as a German textbook for adult beginners (A1–B1) groups its vocabulary into chapters. The learner later picks a theme to practise its words, so give a word the themes where they would look for it.

The themes (key: what belongs to it):
${THEMES.map((theme) => `- ${theme.key}: ${theme.about}`).join("\n")}

How to choose:
- Give 0, 1 or 2 keys from this list, the main one first. One is the usual number.
- Add a second theme only when the word belongs to it just as much as to the first: "Arzt" is body, work; "Kellner" is food, work; "Handy" is communication, technology. A loose link is not enough: "Kühlschrank" is home only, "Zug" is travel only, "Banane" is food only.
- A job or profession gets work; when it belongs to the field of another theme, that theme comes first and work second ("Lehrerin": school, work). Workplaces and work tasks get work too.
- Verbs and adjectives of a topic get its theme as nouns do: "kochen" and "lecker" are food, "kaufen" and "teuer" are shopping, "wohnen" is home, "krank" is body.
- Give none ([]) to words that belong to no topic in particular:
  - grammar words: articles, pronouns, prepositions, conjunctions, particles, auxiliary and modal verbs ("der", "ich", "mit", "und", "weil", "doch", "werden", "können");
  - general words used in every topic: verbs such as "machen", "haben", "geben", "gehen", "nehmen", "bekommen", "sagen", "sehen", "hören", "öffnen"; adjectives and adverbs such as "gut", "neu", "groß", "richtig", "sehr", "hier", "auch", "vielleicht"; nouns such as "Sache", "Art", "Problem", "Beispiel", "Teil".
- Words that name a time, a number, a colour or a feeling get that theme, however short or common: "heute", "oft", "Montag" are time; "zwei", "halb" are numbers; "rot" is colours; "traurig" is feelings.
- When a word has several meanings, theme the meaning that is meant (from its translation or glosses). When it could be any of them, theme its most common everyday meaning; a second theme may cover a second meaning that is just as common ("Birne", pear and light bulb: food, home).
- Specialist and rare words get the theme of the everyday area they belong to ("Antibiotikum": body; "Dativ": school; "Gerste": food, nature); a specialist word that fits no theme gets none (most words of mathematics, chemistry or philosophy).`;

/**
 * The dictionary run's prompt (§7 Themes): only themes, for a numbered list of dictionary words with
 * their English glosses. Used by `themes:classify` alone; the app themes words through Call 2.
 */
export const classifyThemesSystemPrompt = (): string =>
  `You sort German dictionary words into themes for a vocabulary app.

The user message is a JSON list of German words from Wiktionary, each with its part of speech, a noun's article and up to three English glosses (its meanings). For every word return one entry with the same "ref" and "lemma", and "themes": its theme keys.

${THEME_RULES}

Return exactly one entry for every input word, in the input order.`;

/** The dictionary run's model and effort (§7 Themes): cheap, and themes need little thought. */
export const CLASSIFY_MODEL = "claude-haiku-5-5";
export const CLASSIFY_EFFORT = "low";
/** Room for a few hundred short answers and the thinking before them. */
const CLASSIFY_MAX_TOKENS = 16_000;

const themesSchema = zodOutputFormat(ThemesOutput).schema;

/** A word of the dictionary run, before it is numbered within its request. */
export type ThemesWord = Omit<ThemesInputItem, "ref">;

/**
 * One request of the dictionary run, for the Message Batches API: the words numbered by their
 * position (`ref`), one per line. Claude Haiku 5.5 thinks adaptively by default and has no
 * server-side fallback, so neither `thinking` nor `fallbacks` is sent; effort is set explicitly.
 */
export function themesRequest(words: ThemesWord[]): MessageCreateParamsNonStreaming {
  const input: ThemesInputItem[] = words.map((word, ref) => ({ ref, ...word }));
  return {
    model: CLASSIFY_MODEL,
    max_tokens: CLASSIFY_MAX_TOKENS,
    output_config: {
      effort: CLASSIFY_EFFORT,
      format: { type: "json_schema", schema: themesSchema },
    },
    system: classifyThemesSystemPrompt(),
    messages: [
      { role: "user", content: `[\n${input.map((i) => JSON.stringify(i)).join(",\n")}\n]` },
    ],
  };
}

export type ThemesAnswer = {
  /** Each answered word's themes, by its position in the request. */
  themes: Map<number, ThemeKey[]>;
  /** Why nothing could be read, when nothing could. */
  problem?: string;
};

/**
 * Reads one answer of the dictionary run (§7 Themes): the stop reason first, then the JSON against the
 * schema. Each entry is matched to its word by `ref` and kept only when it names that word's
 * lemma; its themes are checked against THEMES (unknown keys dropped, at most 2 kept). Words
 * without a usable entry are left out, to be sent again.
 */
export function readThemesAnswer(message: Message, words: ThemesWord[]): ThemesAnswer {
  const nothing = (problem: string): ThemesAnswer => ({ themes: new Map(), problem });
  if (message.stop_reason === "refusal") return nothing("refused");
  if (message.stop_reason === "max_tokens") return nothing("cut off at max_tokens");

  const text = message.content.find((block) => block.type === "text")?.text;
  if (text === undefined) return nothing("no text");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return nothing("not valid JSON");
  }
  const parsed = ThemesOutput.safeParse(json);
  if (!parsed.success) return nothing("didn't match the schema");

  const themes = new Map<number, ThemeKey[]>();
  for (const entry of parsed.data.words) {
    const word = words[entry.ref];
    if (!word || entry.lemma.trim() !== word.lemma) continue;
    themes.set(entry.ref, knownThemes(entry.themes));
  }
  return { themes };
}
