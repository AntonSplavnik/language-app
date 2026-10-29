import { SESSION_SIZE, type ThemeKey, type ThemeSummary, themeLabel } from "@language-app/core";

/**
 * A source's count on Practice setup (§8.1), in two lines: the number, large, over the rest
 * ("20" over "of 149 words"). A source without words has no number, just "No words".
 */
export function countParts(count: number): { number: number | null; rest: string } {
  if (count === 0) return { number: null, rest: "No words" };
  if (count <= SESSION_SIZE) return { number: count, rest: count === 1 ? "word" : "words" };
  return { number: SESSION_SIZE, rest: `of ${count} words` };
}

/** A theme with words to practise, with its label, as the Theme card's menu lists it. */
export type LabelledTheme = ThemeSummary & { label: string };

/**
 * The Theme card's menu (§10 screen 4): the themes with words to practise, in THEMES order (as
 * `GET /themes` gives them), and the one it starts on, the one with the most (the first of equals).
 * Without any, the menu is empty and the card has no words.
 */
export function themeMenu(themes: ThemeSummary[]): {
  themes: LabelledTheme[];
  start: ThemeKey | null;
} {
  const practisable = themes
    .filter((theme) => theme.practisable > 0)
    .map((theme) => ({ ...theme, label: themeLabel(theme.key) }));
  const start = practisable.reduce<LabelledTheme | null>(
    (most, theme) => (most === null || theme.practisable > most.practisable ? theme : most),
    null,
  );
  return { themes: practisable, start: start?.key ?? null };
}
