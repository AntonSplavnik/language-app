# Icons

The whole icon set, as in `web/src/components/icons.tsx` (`ChevronLeftIcon` … `TrashIcon`, `PlayIcon`).

- 24-unit grid, `stroke="currentColor"`, round caps and joins, stroke 2 (book, camera, calendar, target 1.8; trash 1.9); Play is the only filled one.
- Drawn at 20 px by default; 16 px in small text, 22 px in answer buttons, 24–32 px in wells and squares.
- Always `aria-hidden`; the control around an icon has the label. Never emoji or text glyphs instead.
- A new icon goes into `icons.tsx` in the same style.
