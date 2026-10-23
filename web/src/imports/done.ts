import type { ImportSource, ImportSummary, SaveResponse } from "@language-app/core";
import type { PastImports } from "./usePastImports";

/**
 * What Done is opened with: the save's counts, and for a typed list its source (§10 screen 3). A
 * reloaded Done screen has none of it.
 */
export type DoneState = SaveResponse & { source?: ImportSource };

/**
 * Done's big text and the line under it (§10 screen 3). A save that added nothing says why: every
 * word was already in the list, or every new word was ignored. A reloaded Done screen has no
 * counts any more.
 */
export function doneLines(result: SaveResponse | null): { headline: string; note: string | null } {
  if (!result) return { headline: "Import saved", note: null };
  const ignored =
    result.skipped > 0 ? `${result.skipped} ignored; they won't be suggested again.` : null;
  if (result.added === 0) {
    return {
      headline: "No words added",
      note: ignored ?? "Every word on these pages is already in your list.",
    };
  }
  return {
    headline: `${result.added} ${result.added === 1 ? "word" : "words"} added`,
    note: ignored,
  };
}

/**
 * Whether Done offers to name the import: only a past import (one that added something to learn)
 * without a name.
 */
export const needsName = (imports: ImportSummary[], id: number) =>
  imports.some((item) => item.id === id && !item.name);

/**
 * How the import's words came in: from the save that opened Done, else from the past imports (a
 * reloaded Done screen), else photos.
 */
export function doneSource(result: DoneState | null, past: PastImports, id: number): ImportSource {
  if (result?.source) return result.source;
  if (past.kind === "ready") return past.imports.find((item) => item.id === id)?.source ?? "photos";
  return "photos";
}

/**
 * Done's way to add more: Import more pages (after PDF pages, from the PDF again, which suggests
 * the pages after these), or Type more words after a typed list.
 */
export function moreWords(source: ImportSource): { to: string; label: string } {
  switch (source) {
    case "typed":
      return { to: "/words/new?mode=list", label: "Type more words" };
    case "pdf":
      return { to: "/imports/new/pdf", label: "Import more pages" };
    case "photos":
      return { to: "/imports/new", label: "Import more pages" };
  }
}
