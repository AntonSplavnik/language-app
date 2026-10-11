import type { Article, Pos, VerbForms } from "@language-app/core";
import { z } from "zod";
import type { dictionaryEntries } from "../db/schema";

// Maps one line of the kaikki.org German JSONL (Wiktionary via wiktextract) to a
// dictionary_entries row (docs/design.md §7). Field mapping checked against the 2026-10-03 file.

export type DictionaryRow = Omit<typeof dictionaryEntries.$inferInsert, "id"> & {
  genders: Article[];
  plurals: string[];
  forms: VerbForms | null;
  glossesEn: string[];
};

/** Wiktionary part of speech → ours. Anything else (proper names, phrases, affixes…) is skipped. */
const POS: Record<string, Pos> = {
  noun: "noun",
  verb: "verb",
  adj: "adjective",
  adv: "adverb",
  pron: "pronoun",
  prep: "preposition",
  postp: "preposition",
  conj: "conjunction",
  det: "determiner",
  article: "determiner",
  num: "numeral",
  particle: "particle",
  intj: "interjection",
  contraction: "other",
};

const GENDER_TAGS: Array<[tag: string, article: Article]> = [
  ["masculine", "der"],
  ["feminine", "die"],
  ["neuter", "das"],
];

const MAX_GLOSSES = 5;

/**
 * Wiktionary files derived words under form-of too ("female equivalent of Freund", "agent noun
 * of lehren", "diminutive of Blume"). They are words in their own right and are kept; only
 * inflected forms ("nominative plural of Tisch") are pointers to skip.
 */
const DERIVED_WORD =
  /^(female equivalent|male equivalent|feminine|agent noun|diminutive|augmentative|gerund|verbal noun)\b.*\bof\b/i;

const Entry = z.object({
  word: z.string(),
  pos: z.string(),
  lang_code: z.string().optional(),
  forms: z.array(z.object({ form: z.string(), tags: z.array(z.string()).optional() })).optional(),
  senses: z
    .array(
      z.object({
        tags: z.array(z.string()).optional(),
        glosses: z.array(z.string()).optional(),
        form_of: z.array(z.unknown()).optional(),
      }),
    )
    .optional(),
});
type Entry = z.infer<typeof Entry>;
type Form = NonNullable<Entry["forms"]>[number];

export function mapEntry(raw: unknown): DictionaryRow | null {
  const parsed = Entry.safeParse(raw);
  if (!parsed.success) return null;
  const entry = parsed.data;

  // The raw all-languages dump also works: keep German only.
  if (entry.lang_code !== undefined && entry.lang_code !== "de") return null;
  const pos = POS[entry.pos];
  if (!pos) return null;

  // Senses like "nominative plural of Tisch" only point to another word.
  const senses = (entry.senses ?? []).filter((s) => !isPointer(s));
  if (senses.length === 0) return null;

  const forms = entry.forms ?? [];
  return {
    lemma: entry.word,
    pos,
    genders: pos === "noun" ? genders(senses) : [],
    plurals: pos === "noun" ? unique(formsTagged(forms, ["plural"])).filter((p) => p !== "-") : [],
    forms: pos === "verb" ? verbForms(forms) : null,
    glossesEn: unique(senses.map((s) => s.glosses?.at(-1)).filter((g) => g !== undefined)).slice(
      0,
      MAX_GLOSSES,
    ),
  };
}

function isPointer(sense: NonNullable<Entry["senses"]>[number]): boolean {
  const formOf = Boolean(sense.form_of) || Boolean(sense.tags?.includes("form-of"));
  return formOf && !DERIVED_WORD.test(sense.glosses?.at(-1) ?? "");
}

function genders(senses: NonNullable<Entry["senses"]>): Article[] {
  const tags = new Set(senses.flatMap((s) => s.tags ?? []));
  return GENDER_TAGS.filter(([tag]) => tags.has(tag)).map(([, article]) => article);
}

/**
 * Präteritum, Partizip II and auxiliary from the head forms. Verbs listed with both haben and
 * sein (fahren, aufstehen) get no forms: a card shows one auxiliary, so enrichment picks it.
 */
function verbForms(forms: Form[]): VerbForms | null {
  const [praeteritum] = formsTagged(forms, ["past"]);
  const [partizip2] = formsTagged(forms, ["participle", "past"]);
  const auxiliaries = unique(formsTagged(forms, ["auxiliary"])).filter(
    (a): a is VerbForms["auxiliary"] => a === "haben" || a === "sein",
  );
  const [auxiliary] = auxiliaries;
  if (!praeteritum || !partizip2 || !auxiliary || auxiliaries.length > 1) return null;
  return { praeteritum, partizip2, auxiliary };
}

/** Forms whose tags are exactly `tags`: the plain head forms, not table cells or qualified variants. */
function formsTagged(forms: Form[], tags: string[]): string[] {
  const wanted = [...tags].sort().join(",");
  return forms.filter((f) => [...(f.tags ?? [])].sort().join(",") === wanted).map((f) => f.form);
}

const unique = <T>(items: T[]): T[] => [...new Set(items)];
