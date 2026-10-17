# WordRow

A word in a list, straight on the page with a hairline under it (My words; Summary's missed words use the same row with the translation at the right).

- Row min 62 px (Summary 56), padding 8 4, gap 14: `Headword` (18/700) over the translation (14 `muted`); at the right the progress mark: the NEW pill or streak dots; nothing for learned and ignored words. No chevron: the whole row is the link.
- Pressed `surface`; focus ring inset −2 px with an 8 px radius.
- **Letter sections** (only without a search): a `letter` heading (display 15/700 `muted`) per first letter, umlauts folded (Ä under A), non-letters under #; each section its own `<ul>`.
- **Day sections** (My words' Newest first, without a search): the same `letter` heading with the day the words were added: "Today", "Yesterday", "13 Oct".
- **Imports' rows** (Settings → Imports) look the same with a different content: the import's label (18/700) over a 14 px `muted` line ("13 Oct · 9 words"), and a 20 px chevron-right in `muted` at the right, because the row opens a page of its own (the import's) rather than a word. The whole row is the link.
