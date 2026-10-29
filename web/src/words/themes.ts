import {
  sameThemes,
  THEMES_MAX,
  type ThemeKey,
  themeLabel,
  type WordDetail,
} from "@language-app/core";

// A word's themes on Word detail and Edit word (docs/design.md §10 screens 8 and 9).

/**
 * A tap on a theme of Edit word's Themes card: it is checked (after those already checked, so the
 * first stays the main one) or unchecked. With 2 checked, a third tap changes nothing and
 * `limited` says so ("At most 2 themes").
 */
export function toggleTheme(
  checked: ThemeKey[],
  key: ThemeKey,
): { themes: ThemeKey[]; limited: boolean } {
  if (checked.includes(key)) return { themes: checked.filter((k) => k !== key), limited: false };
  if (checked.length >= THEMES_MAX) return { themes: checked, limited: true };
  return { themes: [...checked, key], limited: false };
}

/** Whether the checked themes differ from the word's, which shows Use suggested. */
export const usesOwnThemes = (checked: ThemeKey[], suggested: ThemeKey[]) =>
  !sameThemes(checked, suggested);

/**
 * Word detail's themes: their labels, and whether they are the learner's own choice ("Your
 * choice"). Nothing when there are none.
 */
export function themeChips(
  word: Pick<WordDetail, "themes" | "themesOwn">,
): { labels: string[]; own: boolean } | null {
  if (word.themes.length === 0) return null;
  return { labels: word.themes.map(themeLabel), own: word.themesOwn };
}
