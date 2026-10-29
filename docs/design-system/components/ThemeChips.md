# ThemeChips

A word's themes as small neutral chips on Word detail's top card, under the forms line (`web/src/components/ThemeChips.tsx`): "Body & health", "Work".

- A list (`ul`, `aria-label="Themes"`) that wraps, 6 px apart. Each chip: 13/600, padding 5 px 10 px, fully round, `surface-raised` ground with `text-soft` text (about 9:1 in light, 10:1 in dark). The labels are THEMES' labels from `core/` (`themeLabel`), main theme first, at most 2.
- **Your choice:** when the learner chose the themes on Edit word, a muted "Your choice" (13 px `muted`, no chip) follows the chips.
- **None:** nothing at all, not an empty row, also when the learner chose none.
- Neutral on purpose: no gender colour (that is GenderChip's), no lime, no icon. Not a button: themes are changed on Edit word (CheckList).
- Consumer provides: `labels` (from `themeChips()` in `web/src/words/themes.ts`, which returns null for none) and `own`.
