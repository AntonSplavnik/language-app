# PhotoTile

A photo in an import, in a 2-column grid (gap 12) of cards (`radius-tile`, padding 8 8 12). Pages of a PDF are the same tiles.

- Thumbnail 128 px, `radius-field`, `object-fit: cover`; a shimmer placeholder (`ui.shimmer`) while it is prepared; a 55% dark scrim while it is read.
- A 32 px dark translucent remove button at the top right while it can be removed ("Remove photo", "Remove page 42").
- A PDF page carries its number at the top left: "p. 42", a pill in the remove button's dark translucent ground with its light text, 13/700, tabular.
- Status line, 14 px with an icon: **done** check + "13 words" in `accent-ink` 700; **preparing / reading** spinner + text in `text` 600; **poor** "Couldn't read much from this page" in `warning`; **failed** the server's message in `danger`; waiting in `muted`.
- **Retry** (worth retrying; a PDF page is rendered again) / **Retake** (poor photo only: a PDF page has none): full-width 36 px, `radius-sm`, `surface-raised`.
- The grid ends with **Add more photos**: same height, dashed `track-strong`, a 48 px lime square with a plus. A PDF import has no such cell: it is the pages chosen.
