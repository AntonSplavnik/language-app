# CheckList

A card of rows that each toggle a check (`web/src/components/CheckList.tsx`): Edit word's **Themes** card, the 22 themes with at most 2 checked; the **Filter** screen's sections (M13.2), one row chosen across them; **Add to group**'s groups.

- The card is `ui.card` without padding of its own. At the top, the uppercase `label` (`ui.label`, an `h2` naming the section) with an optional action at its right (`checkListAction`: a Cancel-style pill a step smaller, 36 px, 14 px: Edit word's **Use suggested**, the Filter screen's **Edit** link to Settings → Groups), then an optional help line (13 px `muted`, padding 0 18): "Loading…" while the rows load (the card then ends 16 px under it), or what an empty section means ("No groups yet. Use Select in My words to make one.").
- **Without a label** (the Filter screen's **All words** card): rows alone, the first without a hairline and with the card's top corners.
- Rows (`CheckRow`) reach the card's edges, a 1 px `border` hairline above each: min 48 px, padding 8 16 8 18, the name in 16/500 `text`, and at the right a 24 px circle: empty with a 2 px `track-strong` ring, or filled `accent` with a 14 px `on-accent` check (stroke 3) when checked, as EntryCard's ring a size smaller. The whole row is one `<button aria-pressed>`.
- Pressed: `surface-muted`; focus: 2 px `accent-ink` inset −2 px. The last row follows the card's bottom corners, so neither leaves the card.
- **A limit** (Themes: at most 2) is the screen's: a tap beyond it changes nothing and the screen says why in a Toast ("At most 2 themes"); rows are never disabled, so the tap can explain itself.
- Order: as the list is defined (THEMES), never re-sorted by state, so a row doesn't move under the finger.
- **A count** (`count`, the Filter screen): 15 px `muted`, tabular numerals, before the circle (an import's, theme's or group's words in every status; 0 for an empty group).
- **More** (`MoreRow`): the last row of a long section, "All 23 imports" with a 20 px chevron-down in `muted` where the circle would be (`aria-expanded`); a tap shows the rest in place and the row goes.
- **Add** (`AddRow`, Add to group): CheckRow's look with the name, its count in `muted`, and a 20 px plus icon in `muted` in place of the circle; a tap adds to it. While adding, `ui.spinner` in `muted` takes the plus's place and every row is disabled (no pressed ground).
- On the Filter screen one row across all the cards is chosen (`aria-pressed="true"`, its circle filled), and a tap chooses at once and leaves; nothing there toggles off.
- Consumer provides: `label` (optional), optional `help` and `action`, and `CheckRow`s with `label`, `checked`, `onToggle` and an optional `count` (or `MoreRow`, `AddRow`).
