# SegmentedTabs

My words' status tabs: Learning, Learned, Ignored, each with its count.

- Track: `surface` + `border`, `radius-field`, padding 4, gap 4; tabs 40 px, `radius-sm`, 14/600 `muted`.
- **The active tab is a `text` pill with `bg` text**; its count pill inverts too (`bg` ground, `text`).
- They are links (`aria-current="page"`) that replace the URL's status, so Back skips tab changes.
