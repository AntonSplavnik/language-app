import type { ImportSummary, SaveResponse } from "@language-app/core";

/**
 * Done's big text and the line under it (§10 screen 3). A save that added nothing says why: every
 * word was already in the list, or every new word was skipped. A reloaded Done screen has no
 * counts any more.
 */
export function doneLines(result: SaveResponse | null): { headline: string; note: string | null } {
  if (!result) return { headline: "Import saved", note: null };
  const skipped =
    result.skipped > 0 ? `${result.skipped} skipped; they won't be suggested again.` : null;
  if (result.added === 0) {
    return {
      headline: "No words added",
      note: skipped ?? "Every word on these pages is already in your list.",
    };
  }
  return {
    headline: `${result.added} ${result.added === 1 ? "word" : "words"} added`,
    note: skipped,
  };
}

/**
 * Whether Done offers to name the import: only a past import (one that added something to learn)
 * without a name.
 */
export const needsName = (imports: ImportSummary[], id: number) =>
  imports.some((item) => item.id === id && !item.name);
