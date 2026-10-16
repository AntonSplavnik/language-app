# RoundButton

A 44 px circle (`ui.round`) for the header's icon-only actions: Back (chevron-left), Word detail's Edit (pencil), Flashcards' End practice (close).

- `surface` fill, 1 px `border`, the icon 20 px in `text`; pressed `surface-muted`; focus ring `accent-ink`.
- Always an `aria-label` ("Back", "Edit word", "End practice"); the icon is `aria-hidden`.
- Back is a `Link` to the screen's parent; `Page` renders it from its `back` prop. Never use the ‹ glyph.
