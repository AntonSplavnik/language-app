# TextField

Text inputs, in two settings:

- **On a card** (Edit word): the field is a card (padding 18), an uppercase `label`, then the input sunk into it: `bg` fill, 1 px `track` border, `radius-field`, 52 px (textarea min 120 px, padding 14 16, line-height 1.45), 17 px text; then help text 13 px `muted`.
- **On the page** (Import's name): a 14/600 label with "(optional)" in `muted`, the input 52 px on `surface` + `border`.
- Never below 16 px text (iOS zoom). Focus: 2 px `accent-ink` inset outline.
- Placeholders show the current value or an example ("phone call", "e.g. Lesson 4"), never instructions.
