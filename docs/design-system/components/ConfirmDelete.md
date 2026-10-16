# ConfirmDelete

Deleting a word asks in place, never with a browser dialog (Edit word).

- At rest: **Delete word**, full width, 56 px, `radius-lg`, `danger-soft` + `danger`, trash icon, at the bottom of the screen.
- Asking: a card with a `danger` hairline at 45% on `danger-soft`, padding 20: a 40 px trash well, the question in 17/700 `text` and the consequences in 14 px `text-soft`, then **Keep** (secondary) and **Delete** (`danger` fill) side by side, 52 px, `radius-field`.
- The copy names the word and offers the safer choice: "To stop practising it for good, set its status to Ignored instead."
