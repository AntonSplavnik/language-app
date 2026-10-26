# Redesign hand-off: Home, My words, Word detail

> **A historical record (note of 2026-10-26):** this hand-off was built in `39f5616` and is not a task any more. The look as it is now is in `docs/design-system/`, the screens in `docs/design.md` §10.

You are implementing a visual redesign of the web app (`web/`). The mockups are in
`docs/redesign/mockups/` (`Home.html`, `MyWords.html`, `WordDetail.html`). They are design-tool
source files (390 × 844 phone frames, inline styles, `{{…}}` template holes, a `support.js` that
doesn't exist here), so **read them for exact values; don't try to run them or copy their markup**.
This document is the spec; where it and the mockups differ, this document wins.

## Ground rules

- Follow `CLAUDE.md`. In particular `docs/design.md` is the source of truth: update §10 (and the
  colour-scheme paragraph at the top of §10) in the same commit so it describes the new look.
- **Before you start, run `git status`.** If there are uncommitted changes, stop and ask me whether to
  commit them first; this work touches the same files and must stay a separate, reviewable commit.
- This is a **restyle, not a rewrite**. Keep every behaviour, state, route, URL query, API call,
  accessible label, loading/error/empty state and piece of copy described in §10 unless this
  document explicitly changes it. Keep the CSS Modules approach and the existing components
  (`Page`, `SpeakerButton`, `PendingDetails`, `WordLoadState`, `ui.module.css`).
- New logic (grouping, progress numbers) goes in small pure functions under `web/src/words/` with
  tests in `web/test/`, test-first, like the existing `counts.ts` / `labels.ts`.
- No emoji, no gradient backgrounds. Icons are inline stroke SVGs (`stroke-width` 1.8–2, round
  caps/joins), `aria-hidden`, inside elements that have an accessible label.
- Not a secure context on the iPhone (see `CLAUDE.md`): nothing in this work may need one.
- Other screens (Import, Review, Practice, Flashcards, Summary, Edit word) are **not** redesigned;
  they just pick up the new tokens and fonts. Check they still look right in both schemes.

## 1. Design tokens (`web/src/styles/global.css`)

The app keeps following the system light/dark setting. The mockups show dark; light is derived
below. Keep the existing token names so other screens keep working; add the new ones. Keep the
habit of noting contrast ratios in comments, and **verify every text/background pair is ≥ 4.5:1**
(≥ 3:1 for text 24 px and up); adjust the light values if any fail.

| Token | Dark | Light | Notes |
|---|---|---|---|
| `--bg` | `#0E0E11` | `#F4F4F6` | page ground |
| `--surface` | `#17171C` | `#FFFFFF` | cards |
| `--surface-muted` | `#1E1E25` | `#EDEDF1` | icon wells, segmented control track |
| `--surface-raised` (new) | `#24242C` | `#E4E4EA` | pills, status select |
| `--text` | `#F4F3F7` | `#111114` | |
| `--muted` | `#9C9BA8` | `#5F5E6B` | |
| `--border` | `#24242B` | `#E2E2E8` | 1 px card borders and row dividers |
| `--track` (new) | `#2A2A33` | `#DCDCE3` | empty progress bar / streak segments / dots |
| `--accent` | `#D7F26A` | `#D7F26A` | **fill only** (lime): Practice, speaker, filled streak |
| `--on-accent` | `#14160A` | `#14160A` | text/icons on an `--accent` fill |
| `--accent-ink` (new) | `#D7F26A` | `#4D6100` | accent used as **text** (quiet buttons, links, focus rings) |
| `--accent-soft` | `rgb(215 242 106 / 0.12)` | `#EEF7C9` | "New" badge ground; text on it is `--accent-ink` |

Because `--accent` is now a light fill in both schemes, go through every use of `var(--accent)` in
`web/src` (`grep -rn "var(--accent)" web/src`): where it colours **text, icons or outlines** switch
it to `--accent-ink`; where it's a **fill** keep `--accent` and make sure the content on it uses
`--on-accent`. `--success`, `--warning`, `--danger` and their pairs stay as they are.

**Gender colours** (article text, and its soft badge where one is used). das moves from green to
teal so it can't be confused with the lime accent:

| | Dark text | Dark soft | Light text | Light soft |
|---|---|---|---|---|
| `--der` | `#7AA7FF` | `rgb(122 167 255 / 0.14)` | `#1F5BB8` | `#E3ECFB` |
| `--die` | `#FF8FA3` | `rgb(255 143 163 / 0.14)` | `#B3261E` | `#FBE4E1` |
| `--das` | `#5ED6C4` | `rgb(94 214 196 / 0.14)` | `#0F6E63` | `#D9F3EF` |

**Shape and spacing:** `--gutter: 20px`; keep `--radius: 14px` for small controls; add
`--radius-card: 24px` (cards, tiles, lists) and `--radius-hero: 28px` (Home's deck card, the
Practice button, Word detail's top card). Cards: `--surface` + `1px solid var(--border)`, no shadow.

**Type:** two families, self-hosted so the app works on the home network without a third-party
request: `pnpm --filter web add @fontsource-variable/bricolage-grotesque @fontsource-variable/dm-sans`
(check the package names resolve; if not, use the `@fontsource/…` static packages with weights
500/700/800 and 400/500/600/700). Import them in `main.tsx`.

- `--font-display: "Bricolage Grotesque Variable", "DM Sans Variable", system-ui, sans-serif;`
  for screen titles, the big numbers, the Practice label, the word on Word detail, its meaning, and
  section letters. Weight 800 for titles/numbers, 700 for the meaning; letter-spacing −0.03em at
  32 px and up, −0.02em around 28 px.
- `--font-body: "DM Sans Variable", system-ui, -apple-system, sans-serif;` everything else (set on
  `:root`, replacing the current `system-ui` stack).
- Small uppercase labels ("Example", "Meaning", "New"): 12–13 px, weight 700, letter-spacing 0.06–0.08em,
  `--muted` (or `--accent-ink` for "New").
- Keep inputs and selects at 16 px or more (iOS zoom).

Update `index.html`'s two `theme-color` metas to the new `--bg` values.

## 2. Shared pieces

**`Page` header (`components/Page.*`)**
- The back link becomes a 44 × 44 round button: `--surface` fill, 1 px `--border`, a chevron-left
  stroke SVG (20 px, `--text`) instead of the `‹` glyph. Keep `aria-label="Back"`.
- Header action buttons (Word detail's Edit) use the same round style; the pencil icon is `--text`.
- Add an optional `largeTitle` prop: when given, the header row holds only back/action, and an `<h1>`
  with the title is rendered at the top of `<main>` in `--font-display`, 36 px / 800 / line-height 1.
  My words uses it. The existing `title` (small header title) and the sheet layout (`leading`, used
  by Edit word) keep working unchanged.
- Header and footer keep their blurred, sticky behaviour.

**`SpeakerButton`** stays as it is by default (Flashcards uses it). Word detail passes a `className`
that makes it 56 × 56 with an `--accent` fill and `--on-accent` icon at rest; while playing keep the
pulsing waves (and `prefers-reduced-motion` handling).

**Article + lemma headword.** Make one small component (e.g. `components/Headword.tsx`) that renders
the headword with a noun's article as its own `<span lang="de">` coloured `--der`/`--die`/`--das`
(text colour only, weight 600 in lists; same weight as the word on Word detail). Non-nouns and
nouns without an article render the lemma alone. Use it on My words rows and on Word detail, so the
gender colour now appears in the list too (update the "only on this screen so far" note in §10).

## 3. Home (`screens/Home.*`, `words/counts.ts`)

Mockup: `mockups/Home.html`. Top to bottom:

1. **Title** "German words": `--font-display` 38 px / 800, line-height 1. (The mockup's "DE → EN"
   chip is optional: add it only if the learner language is already available on the client; never
   hard-code it.)
2. **Deck card** (only when `hasWords`): `--surface`, `--radius-hero`, padding 22 px, gap 18 px.
   - Row: "Your deck" (14 px, `--muted`) left; "N% learned" (13 px, 600, `--muted`) right.
   - Big number: total words (learning + learned) in `--font-display` 64 px / 800 / letter-spacing
     −0.04em, then "words" (17 px, `--muted`).
   - Progress bar: 8 px high, fully rounded, `--track`, filled with `--accent` to the learned share.
     Give it `role="progressbar"` with `aria-valuenow` etc., or hide it from assistive tech if the
     "N% learned" text already says it.
   - Two stats side by side: a coloured 8 px dot + label (13 px `--muted`) over the number (20 px
     700, tabular numerals): **Learning** (dot `--der`'s blue is fine, or `--muted`) and **Learned**
     (dot `--accent`). The mockup also shows Ignored, but `StatsResponse` has no ignored count: **leave
     Ignored out**; don't change the API for it.
   - Add `deckSummary({ learning, learned })` → `{ total, learnedPercent }` to `counts.ts`, with
     tests (round the percent down so it never shows 100% early; 0 words → 0%).
3. **Unfinished-import banners** and **PendingDetails**: same content and links as now, restyled as
   `--surface` cards with `--radius-card` (banner text `--text`, chevron `--muted`).
4. **Practice** (when `practiceText` isn't null): a full-width link styled as a big button: `--accent`
   fill, `--on-accent` text, `--radius-hero`, min-height 120 px, padding 22 px 22 px 22 px 26 px.
   Left: "Practice" (`--font-display` 32 px / 800) over the `practiceText` line (15 px / 600, 75 %
   opacity). Right: a 60 px circle in `--on-accent` with a filled play triangle in `--accent`.
5. **Two tiles** in a 2-column grid, gap 12 px, each min-height 140 px, `--radius-card`, padding 18 px:
   - **My words** (`Link` to the Learning tab, as now): `--surface` + border. Top: a 44 px icon well
     (`--surface-muted`, radius 14 px) with a book icon, and an arrow-up-right icon (`--muted`) at the
     right. Bottom: "My words" (18 px / 700) over `countsText` (13 px `--muted`).
   - **New import**: transparent with a 1.5 px **dashed** border (`--track`-ish grey), plus icon in a
     44 px well, "New import" over "Add more words".
   - When there are **no words yet**, New import is the main action instead: render it as the big lime
     button (same style as Practice, plus icon in the circle, no second line) above the My words tile,
     with the existing hint below it. Keep `hasWords` deciding this.
6. **Footer credit** (Wiktionary / Wikimedia Commons): unchanged text, 13 px `--muted`.

Loading and error states keep their behaviour; restyle the error box as a card with `--danger` text.

## 4. My words (`screens/MyWordsScreen.*`, `words/labels.ts`)

Mockup: `mockups/MyWords.html`.

- `Page` with `largeTitle="My words"` and the round back button. A small "N words" count at the
  right of the header row is optional (only if the counts are loaded; total of all tabs).
- **Search**: 48 px high, `--surface`, 1 px `--border`, radius 16 px, magnifier icon (18 px,
  `--muted`) inside on the left, 16 px text. Focus ring `--accent-ink`. Same behaviour as now.
- **Tabs** (segmented control): track `--surface` + border, radius 16 px, padding 4 px, gap 4 px;
  each tab 40 px high, radius 12 px, 14 px / 600, `--muted`. **Active tab: `--text` fill with `--bg`
  text** (a high-contrast pill). The count is a small pill after the label: 12 px / 700, padding
  1 px 6 px, `--surface-raised` + `--muted`; on the active tab it inverts (`--bg` fill, `--text`).
  Keep them as `Link`s with `aria-current`, as now.
- **List**: no outer box any more. Rows sit straight on `--bg`, separated by 1 px `--border` lines,
  min-height 62 px, padding 8 px 4 px, gap 14 px.
  - Left: the headword via `Headword` (18 px / 700, letter-spacing −0.01em; article in its gender
    colour, weight 600) over the translation (14 px `--muted`).
  - Right: the progress mark, then **no chevron** (the whole row is the link; drop the `›`).
    - "new" → a pill reading **NEW**: 12 px / 700, uppercase, letter-spacing 0.04em, padding
      5 px 9 px, `--accent-soft` ground, `--accent-ink` text.
    - streak → **three 8 px dots** (gap 4 px), filled with `--accent` up to the streak, `--track`
      otherwise, instead of the "0/3" text. Keep the screen-reader text (`progress.spoken`).
      Extend `ProgressLabel` with `filled: number` and update `web/test/myWords.test.ts`.
  - Pressed state: `--surface` background on the row.
- **Letter sections**: when there's **no search**, group the (already alphabetical) list under
  letter headings (`--font-display` 15 px / 700, `--muted`, padding 14 px 4 px 6 px). Fold
  diacritics so *Ä* sits under A (`normalize("NFD")`, strip marks, uppercase); non-letters go
  under "#". Only start a new group when the letter changes from the previous word, so the order the
  server sends is never changed. Put this in a pure `groupByLetter(words)` in `web/src/words/` with
  tests (umlauts, mixed case, a non-letter start, one group). Markup: one `<section>` per letter with
  an `<h2>` and its own `<ul>`. While searching, render one flat `<ul>` as now.
- Keep the busy dimming while a search loads, the error box (restyle as a card), and the empty states
  (restyle: centred, a 64 px rounded `--surface` icon well with a book icon, a 18 px / 700 line, then
  the existing explanatory text in `--muted`, then the existing buttons/links).
- Optional: a soft fade at the bottom of the viewport is **not** needed in the real app; skip it.

## 5. Word detail (`screens/WordDetailScreen.*`)

Mockup: `mockups/WordDetail.html`. The screen moves from "no boxes" to **cards** (`--surface`,
1 px `--border`, gap 14 px between cards). Every conditional piece of content stays conditional
exactly as §10 says; a card with nothing in it is not rendered.

1. **Header**: round back button; round Edit button (pencil, `--text`) at the right.
2. **Top card** (`--radius-hero`, padding 24 px 22 px 22 px):
   - For nouns with an article, a small **gender chip** above the word: e.g. "das · neuter"
     (der → masculine, die → feminine, das → neuter), 13 px / 700 uppercase, letter-spacing 0.06em,
     padding 5 px 10 px, fully rounded, gender soft ground + gender text colour.
   - The word: `<h1>` via `Headword`, `--font-display` 44 px / 800, line-height 1, letter-spacing
     −0.035em, article in its gender colour (text only; the old soft badge around the article goes,
     the chip replaces it). Keep `lang="de"`, wrapping and hyphenation.
   - The speaker button (56 px lime, see §2) at the right end of the word's first line, never
     shrinking, as now.
   - Below the word: the IPA · part-of-speech line (14 px `--muted`). Put the forms line here as well
     when it exists, after a " · " (e.g. "noun · pl. die Apartments"); if that gets too long with IPA,
     keep forms on its own line under it.
   - A 1 px divider, then **Meaning**: label (12 px uppercase `--muted`) over the translation in
     `--font-display` 28 px / 700, letter-spacing −0.02em. Then, when present, the "originally “…”"
     line and the source note (warning colour where it is now), 14–15 px.
3. **Example card** (`--radius-card`, padding 20 px 22 px): label "Example", the sentence 19 px / 500,
   line-height 1.4, with the highlighted word in **bold, coloured with the noun's gender colour (or
   `--text` for non-nouns), underlined 2 px with a 4 px offset**; then the translation 15 px `--muted`.
   The "Example and forms not added yet…" text, when pending, sits in this card instead.
4. **Note card** (when there is a note): same card style, label "Note", the note with its line breaks.
5. **Progress card** (`--radius-card`, padding 20 px 22 px, gap 18 px):
   - For a learning word: a row "Streak" (16 px / 700) … "0/3" (14 px / 600 `--muted`, tabular
     numerals), then `LEARNED_STREAK` segments in a full-width grid (gap 6 px, 10 px high, fully
     rounded; filled `--accent`, empty `--track`). Keep the screen-reader text.
   - Then a row: the history line (13 px `--muted`) left, the **status select** right: the same native
     `<select>` and spinner logic, styled 44 px high, radius 14 px, `--surface-raised`, 15 px / 600 (the
     select's own font-size must stay ≥ 16 px for iOS, so use 16 px), with a stroke chevron-down icon.
     Wrap onto two lines on narrow screens.

## 6. Done means

1. `pnpm test`, `pnpm typecheck` and `pnpm check` pass (new tests included).
2. `pnpm dev`, then look at Home, My words (all three tabs, a search with and without matches, an
   empty tab) and Word detail (a noun with all sections, a verb, a word without details, a learned
   word) at 390 px wide **in both dark and light mode**, and compare against the mockups. Also glance
   at Import, Review, Practice setup, Flashcards, Summary and Edit word for anything the token
   changes broke (especially former `--accent` text that is now lime on white).
3. Check contrast of every new text colour pair (note the ratios in `global.css` comments).
4. `docs/design.md` §10 updated to describe the new look (cards on Word detail, gender colours in the
   list, letter sections, the deck card, the new Home order, das teal).
5. One commit, then stop and show me screenshots of the three screens in both schemes.
