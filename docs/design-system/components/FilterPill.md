# FilterPill

My words' **Filter** pill in the pill row under the search (`web/src/components/FilterPill.tsx`, M13.2): a link to the Filter screen, and with a filter chosen its name and a button that clears it.

- **At rest** (no filter): SelectPill's look on the page, 40 px, `radius-pill`, `surface` + 1 px `border`, 16/600 `text`, padding 0 16 0 14: a 16 px filter icon (Icons, `FilterIcon`) in `muted`, 6 px, then "Filter". Pressed `surface-muted`. The whole pill is the link, carrying My words' query (`/words/filter?…`) and the history state that it was opened from My words.
- **Chosen** (a filter on): the Selected look, a 2 px `accent-ink` border with the padding 1 px less on the border side, so nothing moves. The filter's name (an import's label, a theme's label, a group's name; "One import" or "One group" while the imports or groups load or when they failed, a theme's label at once) takes the icon's and "Filter"'s place, in 16/600 with an ellipsis when long; screen readers hear "Filter: Hard ones". Tapping the name opens Filter.
- **Clear**: a round button at the pill's end, a 28 px circle on `surface-raised` with a 16 px close icon in `text` (`aria-label="Clear filter"`), 5 px from the border; its tap area reaches the pill's height and 6 px each side (`::before`). It clears the filter in one tap and keeps the tab, search and sort. Pressed `surface-muted`.
- In the row it shrinks first (`flex: 0 1 auto`, `min-width: 0`), so a long name never wraps the row at 390 px; the sort pill and Select keep their width.
- Focus: the 2 px `accent-ink` ring, 2 px out, around the link or the clear button.
- No lime: lime is a fill, and the pill isn't the screen's action.
- Same in both colour schemes through the tokens (`accent-ink` is olive in light, lime in dark).
- Consumer provides: `to` (the Filter screen with the query), `state`, `chosen` (the name, or null) and `onClear`.
