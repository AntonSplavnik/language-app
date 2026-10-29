import { z } from "zod";

// The learner's own groups of words (docs/design.md §9.5, M13.2): made from a selection in My
// words, renamed and deleted in Settings → Groups, practised from Practice setup's Group card.

/** Longest group name, e.g. "Doctor visit", counted after trimming. */
export const GROUP_NAME_MAX = 40;

/**
 * Most words one request adds to or removes from a group: Select all takes a whole tab, and
 * 5,000 is more than a list holds today.
 */
export const GROUP_WORDS_MAX = 5000;

/** A group's name: trimmed, 1–40 characters. Unique per account, ignoring case (the server's). */
export const GroupName = z.string().trim().min(1).max(GROUP_NAME_MAX);

/** The learner's words (`user_words.id`) a request is about: 1–5,000, each once. */
export const UserWordIds = z
  .array(z.number().int().positive())
  .min(1)
  .max(GROUP_WORDS_MAX)
  .refine((ids) => new Set(ids).size === ids.length, "A word can be sent once");

/** One of the learner's groups, with how many of their words it holds. */
export const GroupSummary = z.object({
  id: z.number().int(),
  name: z.string(),
  /** Its words, in every status (My words' Filter screen). */
  words: z.number().int().nonnegative(),
  /** Those of them `learning` or `learned`: what a group session draws on (§8.1). */
  practisable: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type GroupSummary = z.infer<typeof GroupSummary>;

/** `GET /api/groups`: every group of the learner's, empty ones too, newest first. */
export const GroupListResponse = z.object({ groups: z.array(GroupSummary) });
export type GroupListResponse = z.infer<typeof GroupListResponse>;

/** `POST /api/groups`: a new group, with the selected words in it when there are some. */
export const CreateGroupRequest = z.object({
  name: GroupName,
  userWordIds: UserWordIds.optional(),
});
export type CreateGroupRequest = z.infer<typeof CreateGroupRequest>;

/** The new group, and how many words went into it. */
export const CreateGroupResponse = z.object({
  group: GroupSummary,
  added: z.number().int().nonnegative(),
});
export type CreateGroupResponse = z.infer<typeof CreateGroupResponse>;

/** `PATCH /api/groups/:id` → the group (`GroupSummary`). */
export const RenameGroupRequest = z.object({ name: GroupName });
export type RenameGroupRequest = z.infer<typeof RenameGroupRequest>;

/** `POST` and `DELETE /api/groups/:id/words`. */
export const GroupWordsRequest = z.object({ userWordIds: UserWordIds });
export type GroupWordsRequest = z.infer<typeof GroupWordsRequest>;

/** Words newly put into the group; those already in it are skipped and not counted. */
export const AddToGroupResponse = z.object({ added: z.number().int().nonnegative() });
export type AddToGroupResponse = z.infer<typeof AddToGroupResponse>;

/** Words taken out of the group; those not in it are skipped and not counted. */
export const RemoveFromGroupResponse = z.object({ removed: z.number().int().nonnegative() });
export type RemoveFromGroupResponse = z.infer<typeof RemoveFromGroupResponse>;

/** `DELETE /api/groups/:id` answers 204, without a body. */
export const NoContent = z.undefined();
