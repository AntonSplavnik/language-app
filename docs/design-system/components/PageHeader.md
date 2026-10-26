# PageHeader

The top of every screen, from `Page` (`web/src/components/Page.tsx`): sticky, `bg` at 88% with a 12 px blur, min 60 px, gutter 20.

- **Back + large title** (`largeTitle`): the round back button alone in the header row, then the title in `title-large` (36/800) at the top of the content. My words, Practice, Import, Review, Settings, Account, Create account, Imports and an import's page use it. Sign in has the large title with no back button, so it has no header row at all.
- **Lead line** (`ui.lead`): a muted 15 px line right under a large title (pulled up 6 px), saying what the screen is for or what it leaves out: Create account's "Invite only: use the email your invite was sent to.", Add words' "Importing photos and PDF pages uses AI, which isn't included in your account." for an account without AI.
- **Small title** (`title`): 22/800 next to the back button; for screens whose content has its own big heading.
- **Sheet** (`leading`): Cancel pill · centred 17/700 title · Save pill (`ui.pill`, see Button), for Edit word and Rename import. Save is lime when there are changes, grey (`surface-raised` + `muted`) when not. Neither pill adds a history entry: they go back to the screen the sheet was opened from, or replace the sheet with it when it was opened directly (`leaveSheet` in `web/src/lib/sheetHistory.ts`).
- **Action**: one round button at the right end (Edit), never shrinking.
- Flashcards replaces the title with the session progress (see ProgressBar).
- A footer (`footer`) is sticky at the bottom, `bg` at 92%, `border` on top, and holds the screen's main action.
