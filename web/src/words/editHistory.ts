import { type HistoryStep, leaveSheet } from "../lib/sheetHistory";

/** What Word detail's Edit link stores in the history entry of Edit word (§10). */
export type EditState = {
  /** The list Word detail was opened from, if any; the detail's Back goes there. */
  from?: string;
  /** Opened from Word detail, so the detail is the history entry right before Edit word. */
  fromDetail?: boolean;
};

/**
 * Save and Cancel return to the word's detail without adding a history entry: back to the detail
 * it was opened from, or (opened directly, e.g. a typed URL) replaced by the detail, which keeps
 * the list to go back to.
 */
export function leaveEdit(id: number, state: EditState | null): HistoryStep {
  return leaveSheet(
    `/words/${id}`,
    Boolean(state?.fromDetail),
    state?.from ? { from: state.from } : undefined,
  );
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
