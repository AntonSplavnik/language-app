# SegmentedTabs

A segmented control of links (`web/src/components/SegmentedTabs.tsx`): My words' status tabs (Learning, Learned, Ignored, each with its count) and Add words' **One word** / **A list**.

- Track: `surface` + `border`, `radius-field`, padding 4, gap 4; the tabs share the width equally (any number of them); tabs 40 px, `radius-sm`, 14/600 `muted`.
- **The active tab is a `text` pill with `bg` text**; its count pill inverts too (`bg` ground, `text`).
- They are links (`aria-current="page"`) that replace the URL (My words' status, Add words' `?mode=list`), so Back skips tab changes.
- Consumer provides: the tabs (`key`, `label`, `to`, an optional `count`), the `current` key and an accessible `label` for the group ("Word status", "How many words").
