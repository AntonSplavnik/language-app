# TextField

Text inputs (`ui.input`), in two settings:

- **On a card** (Edit word, Rename import, Done's Name this import): the field is a card (padding 18), an uppercase `label` (`ui.label`), then the input sunk into it (`ui.input` + `ui.sunk`): `bg` fill, 1 px `track` border, `radius-field`, 52 px (textarea min 120 px, padding 14 16, line-height 1.45), 17 px text; then help text 13 px `muted`. On Done a Save pill (`ui.pill`) sits beside the field; on Edit word and Rename import, Cancel and Save are in the sheet header (PageHeader).
- **On the page** (Import's name; PDF pages' From, To and name): a `<label class="ui.field">` holding a `ui.fieldLabel` (14/600; "(optional)" after it in `ui.optional`, `muted` 500) and `ui.input` alone, 52 px on `surface` + `border`, 16 px text, 8 px apart. PDF pages' From and To are `inputmode="numeric"` at 18 px, tabular (PdfPages).
- Never below 16 px text (iOS zoom). Placeholder in `muted`. Focus: 2 px `accent-ink` inset outline.
- Placeholders show the current value or an example ("phone call", "e.g. Lesson 4", the import's day), never instructions.
