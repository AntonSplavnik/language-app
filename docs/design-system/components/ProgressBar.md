# ProgressBar

How far along something is, as a rounded bar on `track` filled with **`accent-ink`** (never `accent`: lime is 1.1:1 on the light track).

- **Deck bar** (Home): 8 px, filled to the learned share, under the big total; "N% learned" (rounded down) says it in text.
- **Session bar** (Flashcards header): 6 px, filled to `index / total`, 260 ms ease-out; "Practice" left and "**1** / 20" right above it.
- **Results bar** (Summary): 10 px segments 4 px apart, each `flex: <count>`: knew `accent-ink`, didn't know `danger`, skipped `track-strong`; zero shares left out; `aria-hidden` because the counts below say it.
- Pair every bar with numbers in text; a bar alone never carries the information.
