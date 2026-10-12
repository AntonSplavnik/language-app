import { z } from "zod";
import {
  Article,
  CheckStatus,
  FormsSource,
  LastResult,
  Pos,
  VerbForms,
  WordStatus,
} from "./common";

/** What a learner sees about one of their words: shared facts plus their own overrides. */
export const WordView = z.object({
  userWordId: z.number().int(),
  lemma: z.string(),
  pos: Pos,
  article: Article.nullable(),
  plural: z.string().nullable(),
  forms: VerbForms.nullable(),
  /** `word_translations.translation` for the learner language. */
  translation: z.string(),
  /** Takes priority over `translation` everywhere it is shown (§5). */
  customTranslation: z.string().nullable(),
  exampleDe: z.string().nullable(),
  exampleTranslation: z.string().nullable(),
  note: z.string().nullable(),
  /** False until enrichment has run (`words.enriched_at`). */
  enriched: z.boolean(),
  /** Pronunciation from Wiktionary (§7), e.g. "/tɪʃ/"; null when it has none. */
  ipa: z.string().nullable(),
  /** Wikimedia Commons file name of the recording, for the credit link (`commonsFileUrl`). */
  audioFile: z.string().nullable(),
  /** The recording as MP3, played from upload.wikimedia.org on tap; null when there is none. */
  audioUrl: z.string().nullable(),
});
export type WordView = z.infer<typeof WordView>;

/** `POST /api/words/enrich-pending` (§6.6, §9). */
export const EnrichPendingResponse = z.object({
  /** Words that got their details in this run. */
  enriched: z.number().int().nonnegative(),
  /** The learner's words still without details (e.g. the AI was busy). */
  pending: z.number().int().nonnegative(),
});
export type EnrichPendingResponse = z.infer<typeof EnrichPendingResponse>;

/** Longest custom translation and note the learner can save (§10 Word detail). */
export const CUSTOM_TRANSLATION_MAX = 200;
export const NOTE_MAX = 2000;

/** `GET /api/words?status=&q=` (§9). */
export const WordListQuery = z.object({
  /** Absent: every status. */
  status: WordStatus.optional(),
  /** Case-insensitive substring of the German lemma, the stored or the custom translation. */
  q: z.string().max(100).optional(),
});
export type WordListQuery = z.infer<typeof WordListQuery>;

/** One row of the word list: the word plus enough progress for a small hint. */
export const WordListItem = WordView.extend({
  status: WordStatus,
  timesSeen: z.number().int().nonnegative(),
  correctStreak: z.number().int().nonnegative(),
});
export type WordListItem = z.infer<typeof WordListItem>;

export const WordListResponse = z.object({
  /** Alphabetical by lemma, ignoring case. */
  words: z.array(WordListItem),
  /** Words per status that match `q` (all of them without `q`), whatever `status` asked for. */
  counts: z.record(WordStatus, z.number().int().nonnegative()),
});
export type WordListResponse = z.infer<typeof WordListResponse>;

/** `GET /api/words/:userWordId`: everything about one of the learner's words (§10 Word detail). */
export const WordDetail = WordView.extend({
  status: WordStatus,
  /** Where the plural / verb forms came from; null until enrichment has run. */
  formsSource: FormsSource.nullable(),
  /** How the word was checked against the dictionary when it was first saved (§6.5). */
  checkStatus: CheckStatus,
  timesSeen: z.number().int().nonnegative(),
  timesCorrect: z.number().int().nonnegative(),
  correctStreak: z.number().int().nonnegative(),
  lastResult: LastResult.nullable(),
  lastPracticedAt: z.iso.datetime().nullable(),
  addedAt: z.iso.datetime(),
});
export type WordDetail = z.infer<typeof WordDetail>;

/**
 * `PATCH /api/words/:userWordId`. Absent fields stay as they are; an empty or blank text (or null)
 * clears it. Texts are trimmed.
 */
export const UpdateWordRequest = z.object({
  status: WordStatus.optional(),
  customTranslation: z.string().max(CUSTOM_TRANSLATION_MAX).nullable().optional(),
  note: z.string().max(NOTE_MAX).nullable().optional(),
});
export type UpdateWordRequest = z.infer<typeof UpdateWordRequest>;

/** `DELETE /api/words/:userWordId` */
export const DeleteWordResponse = z.object({ deleted: z.literal(true) });
export type DeleteWordResponse = z.infer<typeof DeleteWordResponse>;
