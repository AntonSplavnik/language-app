import type { HistoryStep } from "../lib/sheetHistory";

// Filter and Add to group return to My words without adding a history entry (docs/design.md §10),
// so Back from My words then goes where it went before they were opened, also with iOS Safari's
// swipe back. Opened from My words, they go back one entry, and My words, back on the URL it had,
// replaces it with the list chosen (`takeListReturn`); opened directly, they are replaced by it.

/** The list My words is to show once it is back, in memory only. */
let pending: string | null = null;

/** Returns to My words showing `listUrl` (a filter chosen, or the list after adding to a group). */
export function returnToList(listUrl: string, openedFromList: boolean): HistoryStep {
  pending = openedFromList ? listUrl : null;
  return openedFromList ? { back: 1 } : { to: listUrl };
}

/** Returns to My words as it was (Back, Cancel): `listUrl` is used only when opened directly. */
export function backToList(listUrl: string, openedFromList: boolean): HistoryStep {
  pending = null;
  return openedFromList ? { back: 1 } : { to: listUrl };
}

/**
 * The list My words is to show instead of `current`, once: null when nothing was chosen, or when
 * the choice is the list already shown.
 */
export function takeListReturn(current: string): string | null {
  const url = pending;
  pending = null;
  return url !== null && url !== current ? url : null;
}
