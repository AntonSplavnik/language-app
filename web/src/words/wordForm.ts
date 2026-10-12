import type { UpdateWordRequest, WordDetail } from "@language-app/core";

/** The editable texts on Word detail, as typed. */
export type WordDraft = { customTranslation: string; note: string };

type Saved = Pick<WordDetail, "customTranslation" | "note">;

export const draftOf = (word: Saved): WordDraft => ({
  customTranslation: word.customTranslation ?? "",
  note: word.note ?? "",
});

/**
 * What Save sends: the texts that differ from the saved ones, trimmed as the server stores them.
 * An emptied text clears the field. Null when nothing changed, which keeps Save hidden.
 */
export function changesOf(saved: Saved, draft: WordDraft): UpdateWordRequest | null {
  const changes: UpdateWordRequest = {};
  const customTranslation = draft.customTranslation.trim();
  if (customTranslation !== (saved.customTranslation ?? "")) {
    changes.customTranslation = customTranslation;
  }
  const note = draft.note.trim();
  if (note !== (saved.note ?? "")) changes.note = note;
  return Object.keys(changes).length > 0 ? changes : null;
}
