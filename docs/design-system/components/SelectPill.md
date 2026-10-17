# SelectPill

A native select drawn as a pill with the chosen option's text and a chevron (`web/src/components/SelectPill.tsx`): My words' view menu, Practice setup's Import menu.

- The real `<select>` lies invisible over the pill (opacity 0, 16 px so iOS Safari doesn't zoom), so a tap opens the phone's own picker and the pill is as wide as the chosen text, never the longest option. Long text ends in an ellipsis.
- **On the page** (My words, under the search): 40 px, `radius-pill`, `surface` + 1 px `border`, 16/600, padding 0 12 0 16, a 16 px chevron-down in `muted` after the text; pressed `surface-muted`. Natural width, left-aligned.
- **On a card** (`onCard`, the Import source card): 36 px, `surface-raised`, no border, padding 0 10 0 14.
- Focus: the 2 px `accent-ink` ring, 2 px out, around the pill.
- Consumer provides: the shown `text`, an accessible `label` ("Words to show", "Import to practise"), the `value`, `onChange`, and the `<option>`s (an `<optgroup>` for headed groups such as "Imports").
- For a status that saves when changed, on Word detail, use StatusSelect instead.
