# ProgressBar

How far along something is, as a rounded bar on `track` filled with **`accent-ink`** (never `accent`: lime is 1.1:1 on the light track).

- **Deck bar** (Home): 8 px, filled to the learned share, under the big total; "N% learned" (rounded down) says it in text.
- **Session bar** (`StepProgress`, `web/src/components/StepProgress.tsx`): fills the header row after its round button: a 13/600 `muted` label at the left ("Practice" on Flashcards, "Confirm words" on Confirm word for a typed list) and "**1** / 20" at the right (the current step in `text`, tabular numerals), over a 6 px bar filled to the steps done / total, 260 ms ease-out. Consumer provides `label`, `position` (from 1), `done` and `total`.
- **Results bar** (Summary): 10 px segments 4 px apart, each `flex: <count>`: knew `accent-ink`, didn't know `danger`, skipped `track-strong`; zero shares left out; `aria-hidden` because the counts below say it.
- Pair every bar with numbers in text; a bar alone never carries the information.
