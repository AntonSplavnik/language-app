# ConfirmDelete

Deleting asks in place, never with a browser dialog: Edit word's **Delete word** and Account's **Delete account** (`ConfirmDelete` in `web/src/components/ConfirmDelete.tsx`).

- At rest: the button, full width, 56 px, `radius-lg`, `danger-soft` + `danger`, trash icon, at the bottom of the screen (the section takes `margin-top: auto`).
- Asking: a card with a `danger` hairline at 45% on `danger-soft`, padding 20: a 40 px trash well, the question in 17/700 `text` and the consequences in 14 px `text-soft`, then any fields, then **Keep** (secondary) and **Delete** (`danger` fill) side by side, 52 px, `radius-field`. The card is a form: Enter in a field deletes, as **Delete** does.
- **Fields** (Delete account's password): a `FormField` (TextField, "in a form card" setting: the uppercase `label` over the field sunk into the card, 17 px), its error in `danger` under it with a `danger` border. **Delete** stays disabled (faded to 0.45) until the field is filled (`ready`); while deleting it shows `ui.spinner` and **Keep** is disabled.
- The copy names what is lost and, where there is one, offers the safer choice: "Delete “der Tisch” from your words? … To stop practising it for good, set its status to Ignored instead."; "Delete your account and all its words, imports and practice history?" over "This can't be undone."
- Consumer provides: `label` (the button and the section's name), `question`, the consequences as children, `fields`, `asking` with `onAsk` / `onKeep` / `onDelete`, `deleting`, `disabled` (the screen is busy otherwise) and `ready`.
