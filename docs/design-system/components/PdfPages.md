# PdfPages

The parts of PDF pages (`web/src/screens/PdfPagesScreen.tsx`), where the learner picks a PDF and the pages to import from it. Before a PDF is chosen the screen shows a DropZone.

- **Book card** (`ui.card`, padding 16 18): a 44 px `surface-muted` well (`--radius`) with the 24 px document icon, then the file name 17/700 (wrapping anywhere, file names are long, and cut to two lines with an ellipsis) over the page count 14 px `muted` ("215 pages"). While a PDF opens the well holds `ui.spinner`, the name line reads "Opening…" and the file name moves under it. Under the card, centred, a quiet **Choose another PDF** (`ui.quiet`, 15 px). An error goes under that, 14/600 `danger`, centred ("Couldn't open this PDF").
- **From and To:** two `ui.field`s side by side (two equal columns, gap 12), each a `ui.fieldLabel` over a `ui.input` with `inputmode="numeric"` at 18 px, tabular. Under them one line, 14 px: "4 pages" in `muted`, or the reason in `danger` 600 ("At most 10 pages at a time"); when the PDF has no page labels, a 13 px `muted` line under it: "Page numbers of the PDF file, not the printed ones".
- **Preview:** a row of thumbnails that scrolls sideways and bleeds to the screen's edges (gutter padding inside, no scrollbar), gap 10. Each page is an image 132 px high (width from the page, at most 200 px), `radius-sm`, with a 1 px `border`, and its number under it, 13/600 `muted`, tabular. Until it is drawn: a 94 × 132 placeholder in `surface-muted` with `ui.shimmer` (without the shimmer when the page can't be drawn).
- **Name (optional):** as Import's name field (TextField), its placeholder the automatic name ("Pages 50–53").
- **Action bar:** the big lime button, "Import 4 pages" ("Import 1 page"); grey "Import pages" while the range can't be imported.
