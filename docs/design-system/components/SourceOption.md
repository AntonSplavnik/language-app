# SourceOption

A radio choice drawn as a card (Practice setup): icon well, title over description, and the count at the right.

- Card min 84 px, padding 16 18 16 16, gap 14; cards 12 apart. Icon well 44 px `surface-muted` (camera, calendar, target).
- Count: the number in display 22/800 over the rest in 12 px `muted` ("20" over "of 149 words"); "No words" on one line.
- **Selected:** 2 px `accent-ink` border, padding minus 1 px, and the well turns `accent` with an `on-accent` icon.
- **No words:** the whole card at 0.45, not selectable.
- The real radio stays in the card, visually hidden; keyboard focus draws the ring around the card.
- **With a menu** (the Import source): the title sits over a SelectPill (`onCard`) of the past imports in place of the description, the count at the right is the chosen import's, and choosing in the menu also chooses the card. A label can hold only one control, so this card is a `div` in a grid (well · title over menu · count) whose label (`display: contents`: radio, well, title, count) covers the whole card with its `::after`; the menu sits above that layer. Without past imports it is a plain faded card with a description.
