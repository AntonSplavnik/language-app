import {
  sameThemes,
  type ThemeKey,
  type UpdateWordRequest,
  type WordDetail,
} from "@language-app/core";

/** What the learner can change on Edit word: the texts as typed, and the themes checked. */
export type WordDraft = { customTranslation: string; note: string; themes: ThemeKey[] };

type Saved = Pick<
  WordDetail,
  "customTranslation" | "note" | "themes" | "suggestedThemes" | "themesOwn"
>;

export const draftOf = (word: Saved): WordDraft => ({
  customTranslation: word.customTranslation ?? "",
  note: word.note ?? "",
  themes: word.themes,
});

/**
 * What Save sends: the texts that differ from the saved ones, trimmed as the server stores them,
 * and the themes when the checked ones differ from those shown (§10). An emptied text clears the
 * field. Themes that are the word's own again go back to them (`null`), so the learner follows the
 * word's from then on. Null when nothing changed, which keeps Save disabled.
 */
export function changesOf(saved: Saved, draft: WordDraft): UpdateWordRequest | null {
  const changes: UpdateWordRequest = {};
  const customTranslation = draft.customTranslation.trim();
  if (customTranslation !== (saved.customTranslation ?? "")) {
    changes.customTranslation = customTranslation;
  }
  const note = draft.note.trim();
  if (note !== (saved.note ?? "")) changes.note = note;
  if (!sameThemes(draft.themes, saved.themes)) {
    changes.themes = sameThemes(draft.themes, saved.suggestedThemes) ? null : draft.themes;
  }
  return Object.keys(changes).length > 0 ? changes : null;
}
