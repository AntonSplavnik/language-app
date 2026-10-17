# German Words design system

The design system of this app, for anyone (people or agents) building or changing a screen. Read this file first, then the component guideline for whatever you are building, and take colours, type, radii and spacing from `tokens.json` by name.

**The code is the source of truth.** Every colour token here exists in `web/src/styles/global.css` under the same name (`--bg`, `--accent-ink`, `--der` …), the shared classes are in `web/src/styles/ui.module.css`, the shared components in `web/src/components/`. Use those; never paste a hex value or restate a size that already has a token or a class. If the code and this folder disagree, the code wins: fix this folder in the same commit.

A visual version with live previews of every component in both themes is the **German Words** design system on claude.ai: https://claude.ai/artifact/X8TeHLgDUkzGmDKNtjrpn8 (private to the owner).

## Files

- `README.md`: this file, the brand book (copy, colour, type, shape, states, motion, icons, accessibility).
- `tokens.json`: every token with its value per theme and a usage note.
- `components/<Name>.md`: one guideline per component: what it is, when to use it, exact values, what the consumer provides.

## Components

### Foundations

- [Icons](components/Icons.md): The whole icon set, as in `web/src/components/icons.tsx` (`ChevronLeftIcon` … `TrashIcon`, `PlayIcon`).

### Actions

- [AnswerButtons](components/AnswerButtons.md): The three answers under a flashcard, in a 3-column grid (gap 10): **Didn't know**, **Skip**, **Knew it**. Each is 64 px, `radius-xl`, a 22 px icon over a 12/700 label.
- [BigAction](components/BigAction.md): Home's main action: a full-width lime block (`radius-hero`, min 120 px) with a big label, a second line and a dark circle holding the play icon.
- [Button](components/Button.md): The app's buttons: `ui.button` plus one variant from `web/src/styles/ui.module.css`. Pick by role, not by look.
- [RoundButton](components/RoundButton.md): A 44 px circle (`ui.round`) for the header's icon-only actions: Back (chevron-left), Word detail's Edit (pencil), Flashcards' End practice (close).
- [SpeakerButton](components/SpeakerButton.md): Plays a word's Wiktionary recording on tap, never by itself (`web/src/components/SpeakerButton.tsx`).

### Content

- [Card](components/Card.md): The container for anything read or tapped as a unit (`ui.card`): `surface`, 1 px `border`, `radius-card` (24), no shadow.
- [ExampleSentence](components/ExampleSentence.md): An example sentence with the word it illustrates highlighted (`web/src/components/ExampleSentence.tsx`, segments from `highlightWord` in `core/`).
- [GenderChip](components/GenderChip.md): The noun's gender as a small uppercase chip over the word on Word detail: "DER · MASCULINE", "DIE · FEMININE", "DAS · NEUTER".
- [Headword](components/Headword.md): A German word as the card back shows it, with a noun's article in its gender colour (`web/src/components/Headword.tsx`).
- [Pills](components/Pills.md): Small fully-round labels that sit on a row or card. Pick by meaning:

### Progress

- [ProgressBar](components/ProgressBar.md): How far along something is, as a rounded bar on `track` filled with **`accent-ink`** (never `accent`: lime is 1.1:1 on the light track).
- [Streak](components/Streak.md): Right answers in a row towards learned (`LEARNED_STREAK`, 3), in two sizes:

### Navigation

- [MenuCard](components/MenuCard.md): A card of rows that each open a screen: the name, a short grey status and a chevron (Settings' sections, an import's actions).
- [PageHeader](components/PageHeader.md): The top of every screen, from `Page` (`web/src/components/Page.tsx`): sticky, `bg` at 88% with a 12 px blur, min 60 px, gutter 20.
- [SegmentedTabs](components/SegmentedTabs.md): My words' status tabs: Learning, Learned, Ignored, each with its count.

### Forms

- [SearchField](components/SearchField.md): The search on My words: 48 px, `radius-field`, `surface` + `border`, a 18 px search icon inside at the left in `muted`, 16 px text.
- [SourceOption](components/SourceOption.md): A radio choice drawn as a card (Practice setup): icon well, title over description, and the count at the right.
- [SelectPill](components/SelectPill.md): A native select drawn as a pill with the chosen text and a chevron, the select invisible on top (My words' view menu, Practice setup's Import menu).
- [StatusSelect](components/StatusSelect.md): The word's status on Word detail: a native `<select>` (Learning / Learned / Ignored) styled as a pill, so the phone's own picker opens.
- [TextField](components/TextField.md): Text inputs, in two settings:

### Lists

- [ReviewRow](components/ReviewRow.md): A candidate word on Review: a card (`radius-xl`, 8 apart) whose **whole body is one toggle button** (`aria-pressed`) between Add and Skip.
- [WordRow](components/WordRow.md): A word in a list, straight on the page with a hairline under it (My words; Summary's missed words use the same row with the translation at the right).

### Feedback

- [Banner](components/Banner.md): A card on Home for unfinished work, with a chevron or an action at the right.
- [ConfirmDelete](components/ConfirmDelete.md): Deleting a word asks in place, never with a browser dialog (Edit word).
- [EmptyState](components/EmptyState.md): What an empty list says (My words tabs, a search with no match): centred, a 64 px rounded icon square (`surface` + `border`, book icon in `muted`), a bold first line in `text`, the explanation in 15 px `muted`, then any action.
- [Toast](components/Toast.md): A short confirmation near the bottom edge (`web/src/lib/toast.tsx`): "Moved to Learned", "Saved", "“der Tisch” deleted", or an error message.

### Practice

- [Flashcard](components/Flashcard.md): One practice card (`web/src/practice/Card.tsx`): the translation on the front, the German word and its details on the back. Tap or Space flips it around its vertical axis (420 ms, `cubic-bezier(0.2, 0.7, 0.3, 1)`); the face turned away is inert.
- [SwipeStamp](components/SwipeStamp.md): Feedback while a flashcard is dragged: the card's edge and a stamp take the colour of the answer it points to, both fading in with the swipe's strength.

### Import

- [DropZone](components/DropZone.md): The first step of an import, before any photo: one big target for the camera or the photo library.
- [PhotoTile](components/PhotoTile.md): A photo in an import, in a 2-column grid (gap 12) of cards (`radius-tile`, padding 8 8 12).

## Brand book

German Words is a phone-first app for learning the German vocabulary of a book: photograph the pages, review the words the AI found, practise them as flashcards. It runs on an iPhone over the home network and on desktop. The look is **dark and quiet with one lime action**: near-black (or near-white) grounds, flat bordered cards, a chunky grotesque for anything big, and the lime saved for the single thing the screen wants you to do next. German nouns always wear their gender colour.

This system describes what is built in `web/` of the language-app repository. The code is the source of truth: `web/src/styles/global.css` holds every colour token as a CSS custom property of the same name as here (`--bg`, `--accent-ink`, `--der` …), `web/src/styles/ui.module.css` the shared building blocks (`ui.button`, `ui.primary`, `ui.cta`, `ui.secondary`, `ui.quiet`, `ui.danger`, `ui.large`, `ui.small`, `ui.pill`, `ui.pillPrimary`, `ui.pillSecondary`, `ui.card`, `ui.round`, `ui.label`, `ui.input`, `ui.sunk`, `ui.spinner`, `ui.srOnly`), `web/src/components/` the shared components (`Page`, `Headword`, `MenuCard`, `SelectPill`, `SpeakerButton`, `ExampleSentence`, `PendingDetails`, `LoadState` and its `WordLoadState`, `icons.tsx`). Reuse those; never restate a value that already has a token or a class.

## Content fundamentals

- **Plain, short, specific.** Say what happens, in the fewest words that still say it: "Save 9 words", "Review words (13)", "1 skipped; they won't be suggested again." No exclamation marks, no cheerleading, no apologies.
- **You and your.** The app talks to the learner: "your words", "Words you missed", "Pick what to practise". It never says "I" or "we".
- **Sentence case everywhere**: titles, buttons, labels ("Not learned yet", "Import more pages"). Uppercase only through CSS on small labels (`label`, `badge`, the gender chip), never typed in caps.
- **British spelling**, the verb *practise* and the noun *practice*: "149 words to practise", the Practice button.
- **German stays German.** A noun is always shown with its article ("der Anruf", "die Wohnung"), set in `lang="de"`, the article in its gender colour. Translations are lower-case like a dictionary ("phone call", "to move (house)").
- **Numbers as digits**, counted honestly: "1 word" / "2 words", "20 of 149 words", "0/3". No invented stats.
- **Separators and typography:** a spaced middle dot between facts ("balcony · noun", "Seen 1 time · Added 2 days ago"), curly quotes (“phone call”), a real ellipsis for something in progress ("Saving…", "Adding details…").
- **Errors say what to do**: "Wait until every photo is read", "This word is not in your list any more", "No connection. Your answers are kept and will be sent when it's back…".
- **No emoji, ever**, and no text glyphs as icons (✓ ✗ × + ▾ ‹): use the stroke icons.

## Colour

The app follows the system's light or dark setting; both themes are designed, dark is the signature. Every text colour is at least 4.5:1 on the grounds its usage note names, in both themes.

- **Grounds:** the page is `bg`; anything you can tap or read as a unit is a card on `surface` with a 1 px `border`. One step up for wells and pressed states is `surface-muted`; pills and chips that sit on a card are `surface-raised`.
- **Text:** `text` for content, `muted` for everything secondary (translations, captions, counts, labels, chevrons), `text-soft` for secondary text that must still read as content.
- **Lime is a fill, never a line.** `accent` fills the one main action per screen (Practice, Start, Save N words, Practice these now, New session), the Knew it answer, the Add state on Review, the speaker button and a few icon squares; its content is always `on-accent`. Wherever the accent has to be text, an icon, an outline, a focus ring or a filled progress mark, use `accent-ink` (olive in light, lime in dark), because lime on the light track is 1.1:1.
- **One lime per screen**, where possible. Secondary actions are `surface` + `border`; tertiary ones are quiet text (`accent-ink`, or `muted` for Home on Done so it does not compete with Practice these now).
- **Gender colours are content, not decoration:** `der` blue, `die` red-pink, `das` teal, as text on the article (and its example word), or as text on its `-soft` chip. Never use them for anything else except Home's Learning dot (`der`).
- **States:** `danger` for didn't know, delete and errors (`danger-soft` grounds, `on-danger` on fills); `warning` for the article-mismatch strip and poor photos; `success` only for Add details done.
- **Disabled:** a disabled primary is **grey, not faded lime** (`surface-raised` ground, `muted` text, full opacity). Every other disabled control fades to 0.45.

## Type

Two self-hosted variable families (OFL), no third-party font request:

- **Bricolage Grotesque** (`display`, optical size on): screen titles, big numbers, the word on Word detail and the card, the meaning, the big buttons, swipe stamps. Always weight 800 (700 for the meaning), always tight tracking: −0.04em at 64 px, −0.035em at 44–48 px, −0.03em at 32–38 px, −0.02em at 22–28 px, −0.01em at 20 px.
- **DM Sans** (`body`): everything else, 12–19 px, weights 400/500/600/700.

Use the named styles (`display-hero` … `badge`) and nothing between them. Inputs, selects and search fields are never below 16 px (iOS Safari zooms in otherwise). Counts use tabular numerals. Long German compounds wrap with `overflow-wrap: anywhere` and `hyphens: auto` under `lang="de"`.

## Shape, space and depth

- **Radii grow with importance:** 12 → 14 → 16 → 18 → 20 → 22 → 24 (cards) → 28 (the one hero block per screen) → 32 (the flashcard); pills are fully round. In code only `--radius` (14), `--radius-card` (24) and `--radius-hero` (28) are variables; the others are written literally in the module that uses them, with the values listed under Radius.
- **Spacing:** a 20 px `gutter`; 16 px between blocks on a screen, 12–14 px between cards in a group, 8 px between Review cards, 10 px between footer buttons. Card padding is 18–22 px; hero cards 22–24 px.
- **Flat by default.** Cards separate by `border`, not shadow. Only two things cast a shadow: the flashcard (`shadow-card`) and toasts (`shadow`).
- **No gradients**, no coloured left borders, no decorative imagery. The one shimmer is the photo placeholder while a photo loads.
- **Layout:** one column, max 600 px wide (Home 560 px), a sticky blurred header (`bg` at 88%) and, on screens with a main action, a sticky blurred footer (`bg` at 92%, `border` on top). Touch targets are 44 px or more; the main footer button is 60 px.

## States and motion

- **Pressed:** cards, rows and tiles go to `surface-muted` (rows on the page to `surface`); lime buttons darken to `accent` mixed 90% with `on-accent`.
- **Focus:** a 2 px solid `accent-ink` outline, 2 px offset (inset −2 px inside clipped cards and rows). Always visible, never removed.
- **Selected:** a 2 px `accent-ink` border with the padding reduced by 1 px so nothing moves (source cards); the active tab is a `text` pill with `bg` text.
- **Motion is short and functional:** 120 ms opacity/transform for presses and busy dimming, 150 ms chevron turn, 160 ms toast rise, 260 ms progress fill, 420 ms card flip on `cubic-bezier(0.2, 0.7, 0.3, 1)`, 700 ms spinner turn, 900 ms speaker pulse. Swipe feedback (edge colour and stamp) follows the finger, its opacity the swipe's strength. Respect `prefers-reduced-motion` (the speaker stops pulsing).

## Iconography

Inline stroke SVGs from `web/src/components/icons.tsx`, on a 24-unit grid, `stroke="currentColor"`, round caps and joins, stroke 2 (1.8 for the book, camera, calendar, target and gear; 1.9 for the trash), drawn at 20 px by default (16 px inside small text, 22 px in answer buttons, 24–32 px in big wells). They inherit the text colour of their control and are always `aria-hidden`: the button around them carries the `aria-label`. The only filled icon is Play. Add a new icon to `icons.tsx` in the same style rather than importing an icon set. The SVG files in the Icons asset group are copies for reference, drawn in a fixed grey ink (`#85848f`); in the app they take the text colour.

## Accessibility rules

- Real elements even for custom looks: `<button>`, `<a href>`, `<input>` with a `<label>`, native `<select>`, visually hidden radios behind source cards, `aria-pressed` on Review's toggle cards, `aria-current` on tabs, `aria-expanded` on the known-words toggle.
- Icon-only buttons have an `aria-label` ("Back", "Edit word", "End practice", "Remove photo", "Listen to “der Anruf”").
- Progress drawn as dots, bars or segments also exists as screen-reader text ("1 of 3 right in a row").
- Nothing in the web code may need a secure context (the iPhone opens the app over plain HTTP).

## Intentional additions

These were not in the code as reusable parts but are documented because every screen repeats them: the spacing steps (`space-*`) and the literal radii (`radius-sm`, `radius-field`, `radius-lg`, `radius-xl`, `radius-tile`, `radius-face`, `radius-pill`). They name values the modules already use; add them to `global.css` as variables only if the code starts sharing them.
