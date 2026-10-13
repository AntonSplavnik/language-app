/** What Word detail's Edit link stores in the history entry of Edit word (§10). */
export type EditState = {
  /** The list Word detail was opened from, if any; the detail's Back goes there. */
  from?: string;
  /** Opened from Word detail, so the detail is the history entry right before Edit word. */
  fromDetail?: boolean;
};

/** Go back a number of history entries, or replace Edit word's entry with another screen. */
export type HistoryStep = { back: number } | { to: string; state?: { from: string } };

/**
 * Save and Cancel return to the word's detail without adding a history entry: back to the detail
 * it was opened from, or (opened directly, e.g. a typed URL) replaced by the detail.
 */
export function leaveEdit(id: number, state: EditState | null): HistoryStep {
  if (state?.fromDetail) return { back: 1 };
  return { to: `/words/${id}`, state: state?.from ? { from: state.from } : undefined };
}

/**
 * After deleting, the list, and Back must not lead to the deleted word. Opened from a detail that
 * was opened from a list, the history is list → detail → edit, so going back two entries lands
 * on that list. Otherwise Edit word's entry is replaced by the list.
 */
export function afterDelete(listUrl: string, state: EditState | null): HistoryStep {
  if (state?.fromDetail && state.from) return { back: 2 };
  return { to: listUrl };
}
