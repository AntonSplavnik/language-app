import { z } from "zod";
import { THEMES_MAX, ThemeKey } from "../themes";
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
  /** Wikimedia Commons file name of the recording, e.g. "De-Tisch2.ogg". */
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

/** Longest custom translation and note the learner can save (§10 Edit word). */
export const CUSTOM_TRANSLATION_MAX = 200;
export const NOTE_MAX = 2000;

/** The order of the word list: by lemma ignoring case (A–Z), or the most recently added first. */
export const WordSort = z.enum(["az", "newest"]);
export type WordSort = z.infer<typeof WordSort>;

/** `GET /api/words?status=&q=&importId=&theme=&groupId=&sort=` (§9.1). */
export const WordListQuery = z.object({
  /** Absent: every status. */
  status: WordStatus.optional(),
  /** Case-insensitive substring of the German lemma, the stored or the custom translation. */
  q: z.string().max(100).optional(),
  /** Only the words this import created; an id that isn't one of the learner's matches nothing. */
  importId: z.coerce.number().int().positive().optional(),
  /** Only the words with this theme among their effective ones; a key not in THEMES is refused. */
  theme: ThemeKey.optional(),
  /** Only the words in this group; an id that isn't one of the learner's groups matches nothing. */
  groupId: z.coerce.number().int().positive().optional(),
  /** `az` when absent. */
  sort: WordSort.optional(),
});
export type WordListQuery = z.infer<typeof WordListQuery>;

/**
 * A word's themes as the learner sees them (§5): their own choice when they made one, else the
 * shared word's, else none. 0–2 keys, the main one first.
 */
const EffectiveThemes = z.array(ThemeKey).max(THEMES_MAX);

/** One row of the word list: the word plus enough progress for a small hint. */
export const WordListItem = WordView.extend({
  status: WordStatus,
  themes: EffectiveThemes,
  timesSeen: z.number().int().nonnegative(),
  correctStreak: z.number().int().nonnegative(),
  /** When the word was added to the learner's list (My words' day headings). */
  addedAt: z.iso.datetime(),
});
export type WordListItem = z.infer<typeof WordListItem>;

export const WordListResponse = z.object({
  /**
   * `az`: by lemma, ignoring case. `newest`: the most recently added first, then the newest row
   * first.
   */
  words: z.array(WordListItem),
  /**
   * Words per status that match `q`, `importId`, `theme` and `groupId` (all of them without any),
   * whatever `status` asked for.
   */
  counts: z.record(WordStatus, z.number().int().nonnegative()),
});
export type WordListResponse = z.infer<typeof WordListResponse>;

/** One of the learner's themes (§9.1): how many of their words have it. */
export const ThemeSummary = z.object({
  key: ThemeKey,
  /** The learner's words with the theme, in every status (My words' view menu). */
  words: z.number().int().nonnegative(),
  /** Those of them `learning` or `learned`: what a theme session draws on (§8.1). */
  practisable: z.number().int().nonnegative(),
});
export type ThemeSummary = z.infer<typeof ThemeSummary>;

/** `GET /api/themes`: the learner's themes that have words, in THEMES order. */
export const ThemeListResponse = z.object({ themes: z.array(ThemeSummary) });
export type ThemeListResponse = z.infer<typeof ThemeListResponse>;

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
  themes: EffectiveThemes,
  /** The shared word's themes, what Use suggested goes back to; none when it has none. */
  suggestedThemes: EffectiveThemes,
  /** Whether `themes` is the learner's own choice (Word detail's "Your choice"). */
  themesOwn: z.boolean(),
});
export type WordDetail = z.infer<typeof WordDetail>;

/**
 * `PATCH /api/words/:userWordId`. Absent fields stay as they are; an empty or blank text (or null)
 * clears it. Texts are trimmed. `themes: null` drops the learner's own choice.
 */
export const UpdateWordRequest = z.object({
  status: WordStatus.optional(),
  customTranslation: z.string().max(CUSTOM_TRANSLATION_MAX).nullable().optional(),
  note: z.string().max(NOTE_MAX).nullable().optional(),
  /** The learner's own themes, 0–2 keys of THEMES; null goes back to the word's (§9.1). */
  themes: z
    .array(ThemeKey)
    .max(THEMES_MAX)
    .refine((keys) => new Set(keys).size === keys.length, "A theme can be chosen once")
    .nullable()
    .optional(),
});
export type UpdateWordRequest = z.infer<typeof UpdateWordRequest>;

/** `DELETE /api/words/:userWordId` */
export const DeleteWordResponse = z.object({ deleted: z.literal(true) });
export type DeleteWordResponse = z.infer<typeof DeleteWordResponse>;
