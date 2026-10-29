# CheckList

A card of rows that each toggle a check (`web/src/components/CheckList.tsx`): Edit word's **Themes** card, the 22 themes with at most 2 checked.

- The card is `ui.card` without padding of its own. At the top, the uppercase `label` (`ui.label`, an `h2` naming the section) with an optional action at its right (a Cancel-style pill a step smaller, 36 px, 14 px: **Use suggested**), then an optional help line (13 px `muted`, padding 0 18).
- Rows (`CheckRow`) reach the card's edges, a 1 px `border` hairline above each: min 48 px, padding 8 16 8 18, the name in 16/500 `text`, and at the right a 24 px circle: empty with a 2 px `track-strong` ring, or filled `accent` with a 14 px `on-accent` check (stroke 3) when checked, as EntryCard's ring a size smaller. The whole row is one `<button aria-pressed>`.
- Pressed: `surface-muted`; focus: 2 px `accent-ink` inset −2 px. The last row follows the card's bottom corners, so neither leaves the card.
- **A limit** (Themes: at most 2) is the screen's: a tap beyond it changes nothing and the screen says why in a Toast ("At most 2 themes"); rows are never disabled, so the tap can explain itself.
- Order: as the list is defined (THEMES), never re-sorted by state, so a row doesn't move under the finger.
- Consumer provides: `label`, optional `help` and `action`, and `CheckRow`s with `label`, `checked`, `onToggle`.
