import type { Article, Pos, VerbForms } from "@language-app/core";
import { z } from "zod";
import type { dictionaryEntries, dictionaryForms } from "../db/schema";

// Maps one line of the kaikki.org German JSONL (Wiktionary via wiktextract) to a
// dictionary_entries row and dictionary_forms rows (docs/design.md §7). Field mapping checked
// against the 2026-10-03 file.

/** An inflected form and the base word it belongs to: ging → gehen (verb). */
export type FormRow = typeof dictionaryForms.$inferInsert;

export type DictionaryRow = Omit<typeof dictionaryEntries.$inferInsert, "id"> & {
  genders: Article[];
  plurals: string[];
  forms: VerbForms | null;
  glossesEn: string[];
} & Pronunciation;

/** IPA and one recording of the entry; each null when Wiktionary has none. */
export type Pronunciation = {
  ipa: string | null;
  /** Wikimedia Commons file name, e.g. "De-Tisch2.ogg" (recordings are credited in the Home footer). */
  audioFile: string | null;
  /** The MP3 transcode on upload.wikimedia.org: iPhone Safari can't play Ogg. */
  audioUrl: string | null;
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

/** Recordings are streamed by the browser straight from Wikimedia Commons (§7). */
const COMMONS_UPLOADS = "https://upload.wikimedia.org/";

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
  // Each sound is checked on its own: a malformed one must not drop the whole entry.
  sounds: z.array(z.unknown()).optional(),
});
type Entry = z.infer<typeof Entry>;
type Form = NonNullable<Entry["forms"]>[number];
type Sense = NonNullable<Entry["senses"]>[number];

/** An IPA transcription (`ipa`) or a recording (`audio` + `mp3_url`); rhymes etc. are ignored. */
const Sound = z.object({
  ipa: z.string().optional(),
  audio: z.string().optional(),
  mp3_url: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
type Sound = z.infer<typeof Sound>;

/** A form-of sense names its base word: `{ word: "gehen" }`. */
const FormOf = z.object({ word: z.string() });

/** The dictionary entry of one line, or null when the line isn't one; see {@link mapLine}. */
export function mapEntry(raw: unknown): DictionaryRow | null {
  return mapLine(raw).entry;
}

/**
 * One line of the file: its dictionary entry (null when it has none, e.g. a line that only points
 * to other words) and the forms its form-of senses name (ging → gehen), each base word once. A
 * form equal to its base word, ignoring case, is left out: the lookup finds that word anyway.
 */
export function mapLine(raw: unknown): { entry: DictionaryRow | null; forms: FormRow[] } {
  const none = { entry: null, forms: [] };
  const parsed = Entry.safeParse(raw);
  if (!parsed.success) return none;
  const entry = parsed.data;

  // The raw all-languages dump also works: keep German only.
  if (entry.lang_code !== undefined && entry.lang_code !== "de") return none;
  const pos = POS[entry.pos];
  if (!pos) return none;

  // Senses like "nominative plural of Tisch" only point to another word.
  const pointers = (entry.senses ?? []).filter(isPointer);
  const senses = (entry.senses ?? []).filter((s) => !isPointer(s));
  return {
    entry: senses.length > 0 ? entryRow(entry, pos, senses) : null,
    forms: formRows(entry.word, pos, pointers),
  };
}

function formRows(form: string, pos: Pos, pointers: Sense[]): FormRow[] {
  const lemmas = pointers.flatMap((sense) =>
    (sense.form_of ?? []).flatMap((target) => {
      const parsed = FormOf.safeParse(target);
      return parsed.success ? [parsed.data.word.trim()] : [];
    }),
  );
  return unique(lemmas)
    .filter((lemma) => lemma && lemma.toLowerCase() !== form.toLowerCase())
    .map((lemma) => ({ form, lemma, pos }));
}

function entryRow(entry: Entry, pos: Pos, senses: Sense[]): DictionaryRow {
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
    ...pronunciation(entry.sounds ?? []),
  };
}

/**
 * The entry's IPA (the first one tagged Germany, otherwise the first: November lists the Austrian
 * /noˈfɛmbɐ/ first) and its best recording: tagged Germany, then untagged, then any (Austria,
 * Bavaria…). Wiktionary lists a recording under every entry of the word, so each meaning of a
 * homograph keeps its own (der Band /bant/, die Band /bɛnt/).
 */
function pronunciation(raw: unknown[]): Pronunciation {
  const sounds = raw.flatMap((s) => {
    const parsed = Sound.safeParse(s);
    return parsed.success ? [parsed.data] : [];
  });
  const germany = (s: Sound) => Boolean(s.tags?.includes("Germany"));

  const ipas = sounds.filter((s) => s.ipa);
  const ipa = (ipas.find(germany) ?? ipas[0])?.ipa ?? null;

  const recordings = sounds.filter(
    (s): s is Sound & { audio: string; mp3_url: string } =>
      Boolean(s.audio) && Boolean(s.mp3_url?.startsWith(COMMONS_UPLOADS)),
  );
  const recording =
    recordings.find(germany) ??
    recordings.find((s) => !s.tags || s.tags.length === 0) ??
    recordings[0];

  return { ipa, audioFile: recording?.audio ?? null, audioUrl: recording?.mp3_url ?? null };
}

function isPointer(sense: Sense): boolean {
  const formOf = Boolean(sense.form_of) || Boolean(sense.tags?.includes("form-of"));
  return formOf && !DERIVED_WORD.test(sense.glosses?.at(-1) ?? "");
}

function genders(senses: Sense[]): Article[] {
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
