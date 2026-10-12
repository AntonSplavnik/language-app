// Word recordings come from Wikimedia Commons via Wiktionary (docs/design.md §7). Each file has
// its own free licence, shown on its Commons page, which Word detail links as the credit.

const COMMONS_FILE_PAGE = "https://commons.wikimedia.org/wiki/File:";

/** The Wikimedia Commons page of a recording, e.g. "De-Tisch2.ogg" → …/wiki/File:De-Tisch2.ogg. */
export function commonsFileUrl(fileName: string): string {
  return COMMONS_FILE_PAGE + encodeURIComponent(fileName.replaceAll(" ", "_"));
}
