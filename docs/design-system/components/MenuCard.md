# MenuCard

A card of rows that each open a screen (`web/src/components/MenuCard.tsx`): Settings' sections (Account with the username, Imports with their number), an import's actions (Rename). Later sections and actions join the same card.

- The card is `ui.card` (`surface`, 1 px `border`, `radius-card`) holding a list; rows are separated by a 1 px `border` hairline, no gap and no padding around them.
- A row (`MenuRow`) is min 56 px, padding 8 14 8 18, gap 10: the name in `title-card` (17/700, `text`), then, only when there is one, a short status in `body` (15 px `muted`, tabular numerals: the number of past imports), then a 20 px chevron-right in `muted`. The whole row is the link.
- The first and last rows take the card's corners (`radius-card` less the 1 px border), so the pressed ground (`surface-muted`) and the focus ring (2 px `accent-ink`, inset −2 px) stay inside the card.
- No icons and no lime: a menu leads somewhere, it isn't the screen's action.
- Consumer provides, per row: `to`, the `name` (sentence case, a noun for a section, a verb for an action), an optional `status`, and an optional history `state` for the opened screen (Rename import's `fromImport`).
- For a list of things on the page (the past imports on Imports), use rows on the page with a chevron (WordRow) instead.
