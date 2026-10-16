# WordRow

A word in a list, straight on the page with a hairline under it (My words; Summary's missed words use the same row with the translation at the right).

- Row min 62 px (Summary 56), padding 8 4, gap 14: `Headword` (18/700) over the translation (14 `muted`); at the right the progress mark: the NEW pill or streak dots; nothing for learned and ignored words. No chevron: the whole row is the link.
- Pressed `surface`; focus ring inset −2 px with an 8 px radius.
- **Letter sections** (only without a search): a `letter` heading (display 15/700 `muted`) per first letter, umlauts folded (Ä under A), non-letters under #; each section its own `<ul>`.
