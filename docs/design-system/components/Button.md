# Button

The app's buttons: `ui.button` plus one variant from `web/src/styles/ui.module.css`. Pick by role, not by look.

- **`ui.primary` + `ui.cta`**: the one big action in a sticky footer (Start, Review words, Save N words, Practice these now, New session). 60 px, `radius-xl`, display font 20/800. One per screen.
- **`ui.primary`** (48 px): a lime action that is not the footer's (Try again).
- **`ui.secondary`** (+ `ui.large` in a footer, 56 px, `radius-lg`, 700): the alternative next to or under the main action (Import more pages, Home on Summary, Keep).
- **`ui.quiet`**: a text action in `accent-ink` (empty-state links like "2 in Ignored ›"). On Done the quiet Home is `muted`, so the only lime is Practice these now.
- **`ui.danger`**: the confirming Delete inside the delete confirmation only.
- **`ui.small`**: 36 px, 14 px, for inline actions in errors and banners, and with `ui.secondary` in a row (Account's Google **Connect** and **Disconnect**; a reversible action like these needs no confirmation, only deleting asks, with `ConfirmDelete`).
- **`ui.pill`** + **`ui.pillPrimary`** / **`ui.pillSecondary`**: 40 px fully round pills, 15 px, for Save and Cancel next to a field or in a sheet header (Edit word's and Rename import's headers, Done's Name this import). Save (`pillPrimary`) is lime when there is something to save and grey (`surface-raised` + `muted`) when not; Cancel (`pillSecondary`) is `surface` + `border`, 600.

Rules:
- A disabled `primary` is grey (`surface-raised` + `muted`), never faded lime; other variants fade to 0.45.
- Pressed lime darkens to `accent` mixed 90% with `on-accent`; focus is a 2 px `accent-ink` ring, 2 px out.
- While working, put `ui.spinner` before the label and change the label to the -ing form with an ellipsis ("Saving…", "Adding details…").
- A count in a cta is a pill after the label (Review words 13), not "(13)".
- Consumer provides: the label (a verb phrase in sentence case), `disabled`, the handler or `href` (a `Link` styled as a button is fine).
