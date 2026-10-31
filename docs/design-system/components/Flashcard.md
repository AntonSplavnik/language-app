# Flashcard

One practice card (`web/src/practice/Card.tsx`): the translation on the front, the German word and its details on the back. Tap or Space flips it around its vertical axis (420 ms, `cubic-bezier(0.2, 0.7, 0.3, 1)`); the face turned away is inert.

- The face: `surface`, `border`, `radius-face` (32), `shadow-card` (the only shadowed card), padding 32, up to 520 px tall, kept 36 px from the screen edges so a swipe never starts on the system's back gesture.
- **Front:** the translation in `display-word` (44/800), the part-of-speech pill, "Tap to flip" with the rotate icon at the bottom.
- **Back:** `Headword` at 48/800 with the 48 px speaker after it, forms in 17 px `muted`, a 48 px `track` divider, the `ExampleSentence`; a note on `surface-muted`; Details pending as a warning pill.
- No language labels on the faces.
- **Rounds** (M14.1): Flashcards' header says "Practice" in round 1 and "Round 2" from then on (StepProgress, see ProgressBar), and a round's bar starts empty. The same word coming back is a new card: unflipped, centred, its sound stopped.
- **Between rounds**, a view of the same screen in place of the card: no close button in the header, which stays as the round ended (the position and a full bar); centred in the page the title "Round 1 done" in `display-word` and "6 words you missed" under it in 17 px `muted`, 14 px apart; in the footer, stacked 10 px apart as on Done, **Next round** (`ui.primary` + `ui.cta`, with the 18 px play icon after the label) and **End practice** (`ui.secondary` + `ui.large` + `ui.block`). Swipes and the card's keys do nothing here; Space and Enter press the focused button.
