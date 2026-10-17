# ReviewRow

A candidate word on Review: a card (`radius-xl`, 8 apart) whose **whole body is one toggle button** (`aria-pressed`) between Practice and Ignore (the API's `add` and `skip`).

- Inside: `Headword` over "translation · part of speech" (14 `muted`), the "not in dictionary" pill when it applies; at the right the state pill (40 px, min 76, round): **Practice** with a check on `accent`, **Ignore** on `surface-raised` + `muted`.
- Ignored: the body at 0.55 and the headword struck through.
- **Article mismatch:** a strip across the card's bottom, `warning-soft` with a warning icon, "AI: **der Sofa** · Dictionary: **das Sofa**" in `warning`, and one **Use {article}** button per dictionary gender (`warning` fill, `on-warning`). After applying: a `das-soft` strip, "Dictionary article applied" in `das`, and an Undo text button.
- Confirm word's dictionary entries are the same kind of card with a choice instead of a state pill: see EntryCard.
