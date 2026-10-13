# Redesign hand-off, part 2: every other screen

Part 1 (`docs/redesign/HANDOFF.md`, commit `39f5616`) restyled Home, My words and Word detail and
introduced the tokens, fonts, `Page` `largeTitle`, `ui.card`, `ui.round`, `Headword` and
`icons.tsx`. This part brings the remaining screens to the same look. **Build on what part 1
made; don't redefine tokens or duplicate components.**

Mockups (dark mode, 390 px wide) are in `docs/redesign/mockups/`:

| Screen | Mockup |
|---|---|
| Practice setup | `PracticeSetup.html` |
| Flashcards: front, back, while swiping | `CardFront.html`, `CardBack.html`, `CardSwipe.html` |
| Import: new, with photos | `Import.html`, `ImportPhotos.html` |
| Review | `Review.html` |
| Done | `Done.html` |
| Summary | `Summary.html` |
| Edit word, delete confirmation | `EditWord.html`, `EditWordDelete.html` |

As before, they are design-tool source files: read them for exact values (sizes, radii, spacing,
weights); don't run them or copy their markup. They hard-code dark hex values; **always use the
tokens** so light mode works. Where this document and a mockup differ, this document wins.

## Ground rules (same as part 1)

- Follow `CLAUDE.md`; update `docs/design.md` (§8.2 card, §8.6 summary, §10 screens 2–6 and 9) in
  the same commit so it describes the new look.
- Run `git status` first. If there are uncommitted changes, stop and ask me before starting.
- A **restyle, not a rewrite**: keep every behaviour, state, route, API call, gesture, keyboard
  shortcut, accessible label, loading/error/empty state and piece of copy unless this document
  changes it explicitly. In particular don't touch the swipe/drag logic, the touchmove handling,
  the result queue, the review decisions storage or the import photo state machine.
- New logic goes in small pure functions with tests, test-first.
- No emoji or text glyphs as icons (`✓`, `✗`, `×`, `+`, `▾`): use stroke SVGs in `icons.tsx`
  (`aria-hidden`, inside a labelled control). Add the icons you need there.

## 1. Shared changes (do these first)

**Disabled primary button.** In light mode a disabled lime button at 45% opacity is almost
invisible. Change `ui.module.css` so a disabled `.primary` is **grey, not faded lime**:
`--surface-raised` background, `--muted` text, opacity 1. Other disabled buttons keep the opacity.

**Big footer action** (`ui.cta`, new): the main button in a sticky footer. 60 px high, radius
20 px, `--font-display` 20 px / 800, letter-spacing −0.01em, full width, `--accent` /
`--on-accent` (and the disabled rule above). Use it for: Practice setup's **Start**, Import's
**Review words**, Review's **Save N words**, Done's **Practice these now**, Summary's **New
session**. Secondary footer buttons next to it (Done's Import more pages, Summary's Home) are 56–60
px, radius 18–20 px, `--surface` + border, 16–17 px / 700. Spinners stay where they are now.

**Large titles.** Practice setup, Import and Review switch from the small header `title` to
`largeTitle` (as My words did), keeping the same text: "Practice"; the import's name, else
"New import" / "Import"; the import's name, else "Review words". Done and Summary have no back
button: render their title as `largeTitle` too ("Done" may be shown small and uppercase in
`--muted`, as in the mockup, since the big text is the result).

**Coloured articles everywhere a German headword appears**: use the `Headword` component in the
flashcard back, Review rows and "already in your words" list, Summary's missed list and Edit word's
title.

## 2. Practice setup (`PracticeSetupScreen.*`)

- Under the large title, show the fieldset's legend as a visible subtitle ("What to practise",
  15 px `--muted`) instead of visually hidden.
- Each source is a card (`ui.card`, radius 24 px, min-height 84 px, padding 16 px 18 px 16 px
  16 px, gap 14 px, cards 12 px apart):
  - left: a 44 px icon well (radius 14 px, `--surface-muted`) with a source icon: camera for
    Last import, calendar for Last 7 days, target for Not learned yet;
  - middle: title (17 px / 700) over description (14 px `--muted`), as now;
  - right: the count split in two lines, number in `--font-display` 22 px / 800 tabular, the rest
    ("words", "of 149 words") 12 px `--muted`. Split it in a pure function next to `countText`
    (e.g. `countParts(count) → { number, rest }`, with tests); "No words" stays one line.
  - **selected**: 2 px `--accent-ink` border (adjust the padding by 1 px so nothing moves) and the
    icon well filled `--accent` with an `--on-accent` icon.
  - **no words** (disabled): 45% opacity, as now.
  - Keep the real radio inputs (visually hidden), so keyboard and screen readers work as now.
- Footer: **Start** as `ui.cta` with a filled play icon after the label.

## 3. Flashcards (`FlashcardsScreen.*`, `practice/Card.*`)

**Header.** The back button becomes a round **close** button (an × icon, `aria-label="End
practice"`); it goes where Back goes now (`/`). Next to it, filling the row: a line with
"Practice" (13 px / 600 `--muted`) left and "**1** / 20" right (current number in `--text`,
tabular), and below it a 6 px progress bar (`--track`, filled `--accent-ink` up to
`index / total`, fully rounded). This replaces the centred "1 / 20" paragraph. The header title
"Practice" moves into that line, so pass no `title` to `Page`.

**Card** (`Card.module.css`): `--surface`, 1 px `--border`, radius 32 px, `--shadow` (stronger in
dark: `0 24px 60px rgb(0 0 0 / 0.45)`), padding 32 px, up to 520 px tall. Keep the flip, the inert
faces and the drag container as they are.
- Front: the translation in `--font-display` 44 px / 800, line-height 1.05, letter-spacing −0.035em;
  the part of speech below it as a pill (13 px / 600, padding 5 px 12 px, `--surface-raised`,
  `--muted`). At the bottom of the card, "Tap to flip" with a small rotate icon, 13 px `--muted`.
- Back: the `Headword` (article coloured) at 48 px in the display font, the speaker button beside
  it (48 px, `--accent` fill, `--on-accent` icon, the same variant Word detail uses), forms below in
  `--muted`, then a 48 px × 1 px divider (`--track`), then the example: sentence 19 px / 500 with
  the word highlighted exactly as on Word detail (reuse `highlightWord` and the same bold +
  gender-colour + 2 px underline treatment), translation 15 px `--muted`. Note and "Details
  pending" keep their place, restyled to match.
- **No language labels** in the card corners. The mockups show "English" / "Deutsch", but the
  client doesn't know the learner language; don't hard-code it.

**Swipe feedback** (keep `hintFor` and the drag maths; only the look changes):
- The `HINT` label becomes a stamp: `--font-display` 20 px / 800, padding 8 px 16 px, radius 14 px,
  rotated −12° (knew) or 12° (didn't know), solid fill: **knew** `--accent` / `--on-accent`,
  **didn't know** `--danger` / `--on-danger`, **skip** `--surface-raised` / `--text`. Its opacity
  still follows `strength`.
- The card's border takes the same colour (2 px) while a hint shows, with the hint's opacity.
- Optional, if simple: the matching footer button scales to 1.04 when `strength` reaches 1.

**Footer buttons**: a 3-column grid, gap 10 px, each 64 px high, radius 20 px, an icon over a
12 px / 700 label:
- **Didn't know**: × icon, `--danger-soft` fill, `--danger` text;
- **Skip**: up-arrow icon, `--surface` + border, `--text`;
- **Knew it**: check icon, `--accent` fill, `--on-accent`.
Keep the existing `aria-label`s, `disabled={busy}` and handlers. The visible labels are new.

**Swipe help line** ("Tap to flip · swipe → knew …"): keep the text, 12 px `--muted`, centred
under the card.

**Finishing / waiting / failed states**: restyle only (centred, spinner, `ui.cta` for Try again).

## 4. Import (`ImportScreen.*`)

- **No photos yet** (`Import.html`): the name field gets a 14 px / 600 label ("Name" +
  "(optional)" in `--muted`) and a 52 px input, radius 16 px, `--surface` + border, 16 px text. The
  add button becomes a large drop zone: min-height 220 px, radius 28 px, 1.5 px dashed border
  (`--track`-ish grey), a 72 px `--accent` square (radius 24 px) with a camera icon, then "Take or
  choose photos" in `--font-display` 22 px / 800 and "Photograph the pages you studied" (14 px
  `--muted`; this line is new, reusing Home's hint wording).
- **With photos** (`ImportPhotos.html`): "N photos read earlier; their words are kept." as a
  14 px `--muted` line with a small check icon under the title. Photos in a 2-column grid, gap
  12 px; each tile is a `ui.card` (radius 22 px, padding 8 px 8 px 12 px):
  - thumbnail 128 px high, radius 16 px, `object-fit: cover`; while reading, a dark scrim over it
    (`rgb(14 14 17 / 0.55)`);
  - the remove button (when `canRemove`): 32 px circle at the top right, dark translucent fill,
    × icon, keeps `aria-label="Remove photo"`;
  - status line 14 px with an icon: **done** check + "N words" in `--accent-ink` 700; **preparing /
    reading** spinner + text in `--text` 600; **poor** in `--warning` 600; **failed** the error
    message in `--danger` 600; waiting in `--muted`;
  - **Retry** / **Retake**: full-width 36 px buttons, radius 12 px, `--surface-raised`, 14 px / 700.
  - The **Add more photos** button becomes the last grid cell: same height as a tile, 1.5 px dashed
    border, radius 22 px, a 48 px `--accent` square with a plus icon over "Add more photos"
    (15 px / 700).
- Footer: **Review words** as `ui.cta`; the count becomes a pill after the label (13 px / 700, body
  font, `--on-accent` on a 12%-darker lime, or `--surface-muted`/`--muted` when disabled) instead of
  "(13)". The hint below stays.

## 5. Review (`ReviewScreen.*`)

- Under the large title, a row: "**9** new words · **8** to add" (15 px, numbers `--text` 700,
  rest `--muted`) left; **Add all** and **Skip all** right as 36 px pills (`--surface` + border,
  14 px / 700) instead of quiet text buttons.
- "N already in your words": a collapsible card (radius 18 px, a step darker than `--surface`, or
  `--surface` with `--border`), 48 px toggle row with a check icon, the text in `--muted`, and a
  chevron icon that rotates 180° when open (replacing ▾/▴). The list inside uses `Headword`s.
- Each word is a card (radius 20 px, 8 px apart). **Keep the whole row as the one toggle button
  with `aria-pressed`**, as now; inside it:
  - left: `Headword` (18 px / 700) over "translation · part of speech" (14 px `--muted`), and the
    "not in dictionary" pill (12 px / 600, `--surface-raised`, `--muted`) below when present;
  - right: the state pill (40 px high, min-width 76 px, fully rounded, 14 px / 700): **Add** with a
    check icon on `--accent` / `--on-accent`; **Skip** on `--surface-raised` / `--muted`;
  - skipped rows: 55% opacity and the headword struck through.
- **Article mismatch**: a strip across the bottom of the card, `--warning-soft` ground with a
  hairline top border, a warning-triangle icon, the "AI: … · Dictionary: …" text in `--warning`
  13 px, and one **Use {article}** button per dictionary gender (36 px, radius 12 px, `--warning`
  fill with dark text in dark mode; check contrast in light mode and use `--warning` text on
  `--warning-soft` if a fill fails). After applying: the strip turns teal-tinted (`--das-soft`)
  with "Dictionary article applied" in `--das` and an **Undo** text button.
- Footer: **Save N words** / **Skip all N words** / **Finish** / "Adding details…" / "Saving…" as
  `ui.cta`, same logic.
- "Every word on these pages is already in your list." stays, restyled as an empty-state line.

## 6. Done (`DoneScreen.*`)

- Centred result: a 96 px `--accent` circle with a large check icon (`--on-accent`), inside two
  thin concentric rings (168 px and 124 px, 1 px `--accent-ink` at ~15% and ~25% opacity). Then
  "N words added" (or "Import saved") in `--font-display` 44 px / 800, then the existing detail
  lines 15 px `--muted`. "Example sentences and forms are ready." gets a small sparkle icon and
  `--das` colour. `PendingDetails` stays below when details are pending.
- Footer stack, gap 10 px: **Practice these now** (`ui.cta`, play icon), **Import more pages**
  (secondary, 56 px), **Home** (quiet, 48 px, `--muted` 700, not lime).
- The screen doesn't know the import's name; don't add it.

## 7. Summary (`SummaryScreen.*`)

- Large title "Session done".
- Results card (`ui.card`, radius 28 px, padding 22 px, gap 18 px; keep `aria-label="Results"`):
  - "**14** of 20 knew": the knew count in `--font-display` 64 px / 800 coloured `--accent-ink`,
    "of N knew" 17 px `--muted`, where N = knew + didn't know + skipped (a pure function with tests;
    with 0 cards show just the tiles' numbers);
  - a 10 px stacked bar, segments 4 px apart, each `flex: <count>` and fully rounded: knew
    `--accent-ink`, didn't know `--danger`, skipped `--track`-darker grey; leave out zero segments;
    `aria-hidden` (the numbers below say it);
  - three columns: coloured 8 px dot + label (13 px `--muted`) over the number (22 px / 700
    tabular): Knew, Didn't know, Skipped. These replace the three coloured tiles.
- "Words you missed" as a small uppercase heading (13 px / 700, letter-spacing 0.08em, `--muted`)
  with the count at the right; rows on the background (like My words), 56 px, 1 px `--border`
  dividers: `Headword` 18 px / 700 left, translation 15 px `--muted` right.
- Footer: a 2-column grid, **Home** (secondary) and **New session** (`ui.cta` style).
- The reloaded state ("Session finished. Your answers are saved.") stays.

## 8. Edit word (`EditWordScreen.*`)

- Sheet header (keep the `leading` layout): **Cancel** as a 40 px pill (`--surface` + border,
  15 px / 600, `--text`), the title as a `Headword` (17 px / 700), **Save** as a 40 px pill:
  `--accent` / `--on-accent` when there are changes, `--surface-raised` / `--muted` when disabled.
- Each field in its own `ui.card` (padding 18 px): the uppercase label (12 px / 700, 0.08em,
  `--muted`), then the input or textarea (52 px / min 120 px, radius 16 px, `--bg` fill inside the
  card, 1 px `--track` border, 17 px text), then the help text (13 px `--muted`).
- **Delete word** sits at the bottom of the screen: full width, 56 px, radius 18 px,
  `--danger-soft` fill, `--danger` text 16 px / 700, with a trash icon.
- **Delete confirmation**: a card with a `--danger` hairline border (≈45% opacity) on a
  slightly red-tinted ground (`--danger-soft`), padding 20 px: a 40 px trash icon well, then the
  existing text with its bold first sentence (17 px / 700, then 14 px in a softer `--text`), then
  **Keep** (secondary) and **Delete** (`--danger` fill, `--on-danger`) side by side, 52 px, radius
  16 px. Same logic and spinner as now.

## 9. Done means

1. `pnpm test`, `pnpm typecheck` and `pnpm check` pass, new tests included.
2. With `pnpm dev`, look at every screen above at 390 px wide **in dark and light mode**, including:
   Practice setup with a source at 0 words; a flashcard front, back (noun with example, recording
   and forms; a word with details pending) and mid-swipe in all three directions; Import empty,
   with photos in each state (fake them in the browser only if needed; don't change the database),
   and its disabled footer; Review with a skipped word, a mismatch before and after applying, and
   the known list open; Done with and without added words and after a reload; Summary with and
   without missed words and after a reload; Edit word with no changes, with changes, and the delete
   confirmation. Compare with the mockups.
3. Swipe gestures, keyboard shortcuts (Space, ←, →, ↑) and the iOS edge-swipe behaviour work exactly
   as before. Check on the iPhone too.
4. Contrast checked for every new text/background pair, noted in `global.css` comments where you
   add tokens.
5. `docs/design.md` updated. Refresh `docs/screenshots/` in both schemes.
6. One commit, then stop and show me screenshots of each screen in both schemes.
