# SpeakerButton

Plays a word's Wiktionary recording on tap, never by itself (`web/src/components/SpeakerButton.tsx`).

- A lime circle: 48 px on the card back, 56 px on Word detail (passed class); `on-accent` speaker icon.
- While playing, the two waves pulse (900 ms, the outer one 150 ms later); no pulse under `prefers-reduced-motion`. Tapping again restarts; leaving the screen stops it.
- Shown only when the word has a recording. `aria-label`: Listen to “der Anruf”.
- Sits at the end of the word's first line and never shrinks, so a long word wraps instead of pushing it off screen.
