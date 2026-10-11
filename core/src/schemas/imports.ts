import { z } from "zod";
import { Article, ImportStatus, Pos } from "./common";

/** One entry of `imports.candidates` (§6.3). */
export const Candidate = z.object({
  /** `lemma|pos|article`, empty article for non-nouns. */
  key: z.string(),
  lemma: z.string(),
  pos: Pos,
  article: Article.nullable(),
  translation: z.string(),
  photoIndex: z.number().int().nonnegative(),
  existing: z.enum(["none", "in_my_words"]),
  dictionary: z.object({
    status: z.enum(["match", "mismatch", "not_found"]),
    genders: z.array(Article).optional(),
  }),
});
export type Candidate = z.infer<typeof Candidate>;

/** `POST /api/imports` */
export const CreateImportRequest = z.object({
  name: z.string().trim().max(100).optional(),
});
export type CreateImportRequest = z.infer<typeof CreateImportRequest>;

/** An import with its candidate list; `existing` is up to date when it is read. */
export const ImportView = z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  status: ImportStatus,
  photoCount: z.number().int().nonnegative(),
  candidates: z.array(Candidate),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
export type ImportView = z.infer<typeof ImportView>;

/** `POST /api/imports/:id/photos` */
export const PhotoUploadResponse = z.object({
  pageQuality: z.enum(["ok", "poor"]),
  /** Words read from this photo, before merging with the import's other photos. */
  wordsFound: z.number().int().nonnegative(),
  import: ImportView,
});
export type PhotoUploadResponse = z.infer<typeof PhotoUploadResponse>;

export const SaveDecision = z.object({
  /** The candidate's `key` as the server sent it, even when the article is fixed. */
  key: z.string(),
  action: z.enum(["add", "skip"]),
  /** The dictionary article the learner applied to a mismatch (§6.4). */
  article: Article.optional(),
});
export type SaveDecision = z.infer<typeof SaveDecision>;

/** `POST /api/imports/:id/save` */
export const SaveRequest = z.object({
  decisions: z.array(SaveDecision),
});
export type SaveRequest = z.infer<typeof SaveRequest>;

export const SaveResponse = z.object({
  /** Words newly added to the learner's list as `learning`. */
  added: z.number().int().nonnegative(),
  /** Words newly saved as `ignored`. */
  skipped: z.number().int().nonnegative(),
  /** Added words still waiting for enrichment (example sentence, forms). */
  detailsPending: z.number().int().nonnegative(),
});
export type SaveResponse = z.infer<typeof SaveResponse>;
