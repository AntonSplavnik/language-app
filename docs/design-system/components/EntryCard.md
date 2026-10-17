# EntryCard

A dictionary entry to choose on Confirm word (`web/src/screens/ConfirmWordScreen.tsx`): a card like a Review card (`surface`, 1 px `border`, `radius-xl`, 8 apart) whose **whole body is one toggle button** (`aria-pressed`).

- Inside: `Headword` (18/700, the article 600 in its gender colour), then "part of speech · forms" in 14 `muted` ("noun · pl. die Banken", "verb · ging · ist gegangen"), then the glosses as Wiktionary writes them, one per line, 14 `text-soft`. At the right a 28 px ring (1.5 px `track-strong`).
- **Chosen:** a 2 px `accent-ink` edge (the padding 1 px less, so nothing moves) and the ring filled `accent` with an `on-accent` check. Under the word, inside the card: the uppercase `label` **Translation**, the field sunk into the card (TextField on a card), then chips and Ask AI.
- **Chips:** each gloss shortened (parts in parentheses dropped), 36 px, fully round, `surface-muted` + `border`, 14 px `text`; tapping one fills the field. The chip equal to the field is marked: `accent-soft` with `accent-ink` 600 text (`aria-pressed`).
- **Ask AI:** a Cancel-style pill (`ui.pill` + `ui.pillSecondary`, 36 px, 14 px) with the sparkle icon, the spinner in its place while it runs.
- **In the list already:** no toggle; the word dimmed to 0.55 and "In your words" with a 16 px chevron in `accent-ink` (14/700) linking to the word.
- **Section headings** over groups of cards: display 15/700 `muted` ("Did you mean…?"; "*ging* is a form of **gehen**", the words in `text`; "The AI suggests **der Regenschirm**" after a sparkle).
- **Hand form** under the cards: a quieter card (`surface` mixed 50% with `bg`, `radius-lg`, like Review's known words) whose 52 px header "Not in the dictionary?" toggles it (`aria-expanded`, a turning chevron). Open: labelled fields (German word, Part of speech as a native select drawn like the field with a chevron, Article as three 44 px pills der / die / das in their gender colours, chosen on their `-soft` chip with a gender-coloured border, Translation), then Ask AI with "Fills in all four" in 13 px `muted`.
