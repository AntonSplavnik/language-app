# PhotoTile

A photo in an import, in a 2-column grid (gap 12) of cards (`radius-tile`, padding 8 8 12).

- Thumbnail 128 px, `radius-field`, `object-fit: cover`; a shimmer placeholder while it loads; a 55% dark scrim while it is read.
- A 32 px dark translucent remove button at the top right while it can be removed ("Remove photo").
- Status line, 14 px with an icon: **done** check + "13 words" in `accent-ink` 700; **preparing / reading** spinner + text in `text` 600; **poor** "Couldn't read much from this page" in `warning`; **failed** the server's message in `danger`; waiting in `muted`.
- **Retry** (worth retrying) / **Retake** (poor page): full-width 36 px, `radius-sm`, `surface-raised`.
- The grid ends with **Add more photos**: same height, dashed `track-strong`, a 48 px lime square with a plus.
