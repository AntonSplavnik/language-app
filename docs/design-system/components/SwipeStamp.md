# SwipeStamp

Feedback while a flashcard is dragged: the card's edge and a stamp take the colour of the answer it points to, both fading in with the swipe's strength.

- **Knew it** (→): `accent` stamp with `on-accent` text, rotated −12° at the top left; edge `accent-ink`.
- **Didn't know** (←): `danger` stamp, `on-danger`, rotated 12° at the top right; edge `danger`.
- **Skip** (↑): `surface-raised` stamp with `text`, centred near the bottom; edge `track-strong`.
- Stamp: display 20/800, padding 8 16, `radius`; edge 2 px around the 32 px card. The matching answer button arms (scale 1.04).
