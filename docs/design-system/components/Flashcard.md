# Flashcard

One practice card (`web/src/practice/Card.tsx`): the translation on the front, the German word and its details on the back. Tap or Space flips it around its vertical axis (420 ms, `cubic-bezier(0.2, 0.7, 0.3, 1)`); the face turned away is inert.

- The face: `surface`, `border`, `radius-face` (32), `shadow-card` (the only shadowed card), padding 32, up to 520 px tall, kept 36 px from the screen edges so a swipe never starts on the system's back gesture.
- **Front:** the translation in `display-word` (44/800), the part-of-speech pill, "Tap to flip" with the rotate icon at the bottom.
- **Back:** `Headword` at 48/800 with the 48 px speaker after it, forms in 17 px `muted`, a 48 px `track` divider, the `ExampleSentence`; a note on `surface-muted`; Details pending as a warning pill.
- No language labels on the faces.
