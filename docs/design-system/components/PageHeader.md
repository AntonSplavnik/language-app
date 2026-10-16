# PageHeader

The top of every screen, from `Page` (`web/src/components/Page.tsx`): sticky, `bg` at 88% with a 12 px blur, min 60 px, gutter 20.

- **Back + large title** (`largeTitle`): the round back button alone in the header row, then the title in `title-large` (36/800) at the top of the content. My words, Practice, Import, Review use it.
- **Small title** (`title`): 22/800 next to the back button; for screens whose content has its own big heading.
- **Sheet** (`leading`): Cancel pill · centred 17/700 title · Save pill, for Edit word. Save is lime when there are changes, grey (`surface-raised` + `muted`) when not.
- **Action**: one round button at the right end (Edit), never shrinking.
- Flashcards replaces the title with the session progress (see ProgressBar).
- A footer (`footer`) is sticky at the bottom, `bg` at 92%, `border` on top, and holds the screen's main action.
