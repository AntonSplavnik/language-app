# Icons

The whole icon set, as in `web/src/components/icons.tsx` (`ChevronLeftIcon` … `TrashIcon`, `PlayIcon`).

- 24-unit grid, `stroke="currentColor"`, round caps and joins, stroke 2 (book, camera, document, tag, folder, calendar, target, gear 1.8; trash 1.9); Play is the only filled one.
- `TagIcon`, a price tag with its hole, stands for a theme (the Theme source on Practice setup).
- `FolderIcon` (stroke 1.8), a folder with its tab, stands for one of the learner's groups (the Group source on Practice setup, M13.2).
- `FilterIcon` (stroke 2), three lines each shorter than the one above, stands for filtering: 16 px in `muted` on My words' Filter pill (FilterPill).
- `PlusIcon` also marks a row that adds to it: 20 px in `muted` on Add to group's rows (CheckList).
- Drawn at 20 px by default; 16 px in small text, 22 px in answer buttons, 24–32 px in wells and squares.
- Always `aria-hidden`; the control around an icon has the label. Never emoji or text glyphs instead.
- A new icon goes into `icons.tsx` in the same style.
- Google's "G" is a logo, not one of these: it keeps its four colours and lives in `GoogleButton.tsx` (GoogleButton).
