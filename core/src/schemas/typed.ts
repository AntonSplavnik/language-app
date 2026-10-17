import { z } from "zod";
import { Article, Pos, VerbForms } from "./common";
import { CUSTOM_TRANSLATION_MAX } from "./words";

// Adding words by hand (docs/design.md §6.7, §9.3): the dictionary search, saving typed words and
// Ask AI.

/** Longest typed text the dictionary search and Ask AI take, counted after trimming. */
export const TYPED_TEXT_MAX = 50;
/** Most texts in one typed list (§10 Add words). */
export const TYPED_LIST_MAX = 30;
/** Most words saved for one typed text: the entries chosen for it (`POST /words`). */
export const TYPED_WORDS_MAX = 5;
/**
 * Most words in one typed list's save (`POST /imports/typed`): every text of the longest list with
 * the most entries chosen for each (30 × 5 = 150).
 */
export const TYPED_IMPORT_MAX = TYPED_LIST_MAX * TYPED_WORDS_MAX;
/** Longest lemma of a typed word. */
export const TYPED_LEMMA_MAX = 100;
/** Fewest letters before suggestions appear. */
export const SUGGEST_MIN = 2;

/**
 * One dictionary entry as Confirm word shows it (§9.3). An entry with several genders (der/das
 * Liter) gives one view per gender; a noun without a gender has a null article.
 */
export const EntryView = z.object({
  entryId: z.number().int(),
  lemma: z.string(),
  pos: Pos,
  article: Article.nullable(),
  /** The entry's first plural. */
  plural: z.string().nullable(),
  forms: VerbForms.nullable(),
  /** Up to 3 English glosses, as Wiktionary writes them. */
  glosses: z.array(z.string()),
  ipa: z.string().nullable(),
  audioUrl: z.string().nullable(),
  /** The learner's `userWordId` when this word (lemma, pos, article) is in their list, any status. */
  inMyWords: z.number().int().nullable(),
});
export type EntryView = z.infer<typeof EntryView>;

/** `GET /api/dictionary/suggest?q=`: the letters typed so far; under 2 the list is empty. */
export const SuggestQuery = z.object({
  q: z.string().trim().max(TYPED_TEXT_MAX).default(""),
});
export type SuggestQuery = z.input<typeof SuggestQuery>;

export const SuggestResponse = z.object({
  /** Up to 8: the entries starting with the letters, topped up with similar words. */
  suggestions: z.array(EntryView),
});
export type SuggestResponse = z.infer<typeof SuggestResponse>;

/** `GET /api/dictionary/lookup?q=`: one typed word. */
export const LookupQuery = z.object({
  q: z.string().trim().min(1).max(TYPED_TEXT_MAX),
});
export type LookupQuery = z.input<typeof LookupQuery>;

/** A base word the typed text is a form of (*ging* → *gehen*), with its entries. */
export const LookupForm = z.object({
  lemma: z.string(),
  pos: Pos,
  entries: z.array(EntryView),
});
export type LookupForm = z.infer<typeof LookupForm>;

/** The first of the three that finds something; the others are empty (§6.7 step 1). */
export const LookupResponse = z.object({
  /** The entries whose lemma is the text, ignoring case. */
  entries: z.array(EntryView),
  /** Only when `entries` is empty: the base words the text is a form of. */
  forms: z.array(LookupForm),
  /** Only when both are empty: up to 5 similar words, the most similar first ("Did you mean…?"). */
  similar: z.array(EntryView),
});
export type LookupResponse = z.infer<typeof LookupResponse>;

/**
 * A word to save (§9.3): from a dictionary entry (`entryId`), or entered by hand or by the AI.
 * Texts are trimmed; an article on a word that isn't a noun is dropped.
 */
export const TypedWord = z.object({
  lemma: z.string().trim().min(1).max(TYPED_LEMMA_MAX),
  pos: Pos,
  article: Article.nullable(),
  translation: z.string().trim().min(1).max(CUSTOM_TRANSLATION_MAX),
  /** The entry it was chosen from; one that no longer fits counts as entered by hand. */
  entryId: z.number().int().positive().optional(),
});
export type TypedWord = z.infer<typeof TypedWord>;

/** `POST /api/words`: the entries chosen for one typed text, saved without an import. */
export const AddWordsRequest = z.object({
  words: z.array(TypedWord).min(1).max(TYPED_WORDS_MAX),
});
export type AddWordsRequest = z.input<typeof AddWordsRequest>;

export const AddedWord = z.object({
  userWordId: z.number().int(),
  lemma: z.string(),
  /** A noun's article; null for every other word. */
  article: Article.nullable(),
});
export type AddedWord = z.infer<typeof AddedWord>;

export const AddWordsResponse = z.object({
  /** The words newly added as `learning`, in the order sent. */
  added: z.array(AddedWord),
  /** Words that were in the learner's list already, in any status; left as they were. */
  alreadyInList: z.number().int().nonnegative(),
  /** Added words still waiting for enrichment (example sentence, forms). */
  detailsPending: z.number().int().nonnegative(),
});
export type AddWordsResponse = z.infer<typeof AddWordsResponse>;

/** `POST /api/imports/typed`: a typed list, saved as one import. */
export const TypedImportRequest = z.object({
  words: z.array(TypedWord).min(1).max(TYPED_IMPORT_MAX),
});
export type TypedImportRequest = z.input<typeof TypedImportRequest>;

export const TypedImportResponse = AddWordsResponse.extend({
  /** The import that holds the added words; null when nothing was added (no import is made). */
  importId: z.number().int().nullable(),
});
export type TypedImportResponse = z.infer<typeof TypedImportResponse>;

/** `POST /api/words/describe`: Ask AI (Call 3, §11.6). */
export const DescribeRequest = z.object({
  text: z.string().trim().min(1).max(TYPED_TEXT_MAX),
  /** Only a translation is asked for, in this entry's sense. */
  entryId: z.number().int().positive().optional(),
});
export type DescribeRequest = z.input<typeof DescribeRequest>;

/** The word the AI thinks the learner meant; with `entryId`, the entry's word. */
export const DescribeResponse = z.object({
  lemma: z.string(),
  pos: Pos,
  article: Article.nullable(),
  translation: z.string(),
});
export type DescribeResponse = z.infer<typeof DescribeResponse>;
