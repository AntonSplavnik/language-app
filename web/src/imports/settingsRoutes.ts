import { type HistoryStep, leaveSheet } from "../lib/sheetHistory";

// Settings → Imports → Import → Rename import (§10 screens 10–13).

export const SETTINGS_URL = "/settings";
export const IMPORTS_URL = "/settings/imports";
export const importPageUrl = (id: number) => `${IMPORTS_URL}/${id}`;
export const renameImportUrl = (id: number) => `${importPageUrl(id)}/rename`;

/** What the import page's Rename row stores in the history entry of Rename import. */
export type RenameState = {
  /** Opened from the import's page, so that page is the history entry right before it. */
  fromImport?: boolean;
};

/**
 * Save and Cancel on Rename import return to the import's page without adding a history entry:
 * back to the page it was opened from, or (opened directly) replaced by it, as on Edit word.
 */
export const leaveRename = (id: number, state: RenameState | null): HistoryStep =>
  leaveSheet(importPageUrl(id), Boolean(state?.fromImport));

/** What an import's page and Rename import say when the import isn't listed (any more). */
export const IMPORT_MISSING = {
  text: "This import is not in your list any more.",
  to: IMPORTS_URL,
  label: "Imports",
};
