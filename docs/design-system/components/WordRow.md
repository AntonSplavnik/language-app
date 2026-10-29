# WordRow

A word in a list, straight on the page with a hairline under it (My words; Summary's missed words use the same row with the translation at the right).

- Row min 62 px (Summary 56), padding 8 4, gap 14: `Headword` (18/700) over the translation (14 `muted`); at the right the progress mark: the NEW pill or streak dots; nothing for learned and ignored words. No chevron: the whole row is the link.
- Pressed `surface`; focus ring inset −2 px with an 8 px radius.
- **Letter sections** (only without a search): a `letter` heading (display 15/700 `muted`) per first letter, umlauts folded (Ä under A), non-letters under #; each section its own `<ul>`.
- **Day sections** (My words' Newest first, without a search): the same `letter` heading with the day the words were added: "Today", "Yesterday", "13 Oct".
- **Selection mode** (My words, M13.2): each row gets, at its left, CheckList's 24 px circle (an empty 2 px `track-strong` ring; filled `accent` with a 14 px `on-accent` check, stroke 3, when selected), 14 px before the headword, and the row is one `<button aria-pressed>` that selects or unselects the word instead of opening it. The headword, the translation and the progress mark stay; pressed and focus as above.
- **Groups' rows** (Settings → Groups, M13.2) are Imports' rows: the group's name (18/700) over "8 words · 29 Oct" (14 px `muted`, the day it was made) and the chevron.
- **Imports' rows** (Settings → Imports) look the same with a different content: the import's label (18/700) over a 14 px `muted` line ("13 Oct · 9 words"), and a 20 px chevron-right in `muted` at the right, because the row opens a page of its own (the import's) rather than a word. The whole row is the link.
