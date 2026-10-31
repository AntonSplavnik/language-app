# RoundButton

A 44 px circle (`ui.round`) for the header's icon-only actions: Back (chevron-left), Word detail's Edit (pencil), Flashcards' End practice (close), Home's Settings (gear, at the right end of the title's line).

- `surface` fill, 1 px `border`, the icon 20 px in `text`; pressed `surface-muted`; focus ring `accent-ink`.
- Always an `aria-label` ("Back", "Edit word", "End practice", "Settings"); the icon is `aria-hidden`.
- Back is a `Link` to the screen's parent; `Page` renders it from its `back` prop. Never use the ‹ glyph.
- End practice is a `Link` to Home in round 1 and a `<button>` from round 2 on, where it finishes the session; there is none between rounds (see Flashcard).
