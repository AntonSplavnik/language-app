// What the screens leave out for an account without AI (docs/design.md §10): photo and PDF import,
// Ask AI and Add details. The web app knows `aiEnabled` from GET /api/auth/get-session; the server
// refuses the AI routes anyway (403 ai_not_enabled).

/** Add words' one-line note for an account without AI: why there is no photo import. */
export const AI_NOT_INCLUDED =
  "Importing photos and PDF pages uses AI, which isn't included in your account.";

/** Where New import leads: the Import screen, or for an account without AI straight to Add words. */
export const newImportPath = (aiEnabled: boolean) => (aiEnabled ? "/imports/new" : "/words/new");

/** The screens that start a photo or PDF import. */
const AI_IMPORT_PAGES = new Set(["/imports/new", "/imports/new/pdf"]);

/**
 * Where a page goes for an account without AI, or null to show it: starting a photo or PDF import
 * opens Add words instead. An import that exists stays reachable, so one begun before AI was
 * switched off can still be reviewed and saved.
 */
export function withoutAiRedirect(aiEnabled: boolean, pathname: string): string | null {
  return !aiEnabled && AI_IMPORT_PAGES.has(pathname) ? "/words/new" : null;
}

/** Add words' back button: to New import, or Home when New import is Add words itself. */
export const addWordsBack = (aiEnabled: boolean) => (aiEnabled ? "/imports/new" : "/");

/** The hint under Home's New import while the list is empty. */
export const newImportHint = (aiEnabled: boolean) =>
  aiEnabled
    ? "Photograph the pages you studied to collect their new words."
    : "Type the words you studied to start your list.";

/** "N words without details" with Add details: only with AI, and only while words wait. */
export const showsAddDetails = (aiEnabled: boolean, pending: number) => aiEnabled && pending > 0;

/** The AI features card on Account (§10 screen 19). */
export const aiFeaturesText = (aiEnabled: boolean) =>
  aiEnabled
    ? "Included: photo and PDF import, Ask AI, example sentences"
    : "Not included in your account";
