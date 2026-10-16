# StatusSelect

The word's status on Word detail: a native `<select>` (Learning / Learned / Ignored) styled as a pill, so the phone's own picker opens.

- 44 px, `radius`, `surface-raised`, 16/600 (16 px keeps iOS from zooming); a chevron-down in `muted` at the right, swapped for `ui.spinner` while saving.
- A change saves at once and shows a toast ("Moved to Learned"); on failure the saved status comes back.
- `aria-label` "Status".
