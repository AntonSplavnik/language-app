# AnswerButtons

The three answers under a flashcard, in a 3-column grid (gap 10): **Didn't know**, **Skip**, **Knew it**. Each is 64 px, `radius-xl`, a 22 px icon over a 12/700 label.

- Didn't know: `danger-soft` ground, `danger` text, close icon. Skip: `surface` + `border`, arrow-up. Knew it: `accent` fill, `on-accent`, check.
- While a drag points at an answer, its button scales to 1.04 (`armed`).
- Same answers as the swipe (→ knew, ← didn't know, ↑ skip) and the keys (→ ← ↑, Space flips); all three disabled while a card leaves.
- Keep the `aria-label`s "Didn't know" and "Knew it".
