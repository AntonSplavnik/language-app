# DropZone

The first step of an import, before anything is chosen: one big target (`DropZone`, `web/src/components/DropZone.tsx`). Import uses it for the camera or the photo library, PDF pages for a PDF from Files.

- Min 220 px, padding 28, `radius-hero`, 1.5 px dashed `track-strong`, no fill (pressed `surface`).
- A 72 px `accent` square (radius 24) with a 32 px icon, then the title in display 22/800 and the hint in 14 px `muted`: the camera, "Take or choose photos" and "Photograph the pages you studied" on Import; the document, "Choose a PDF" and "From Files or iCloud" on PDF pages.
- On Import, two quiet links sit under it in one centred row (wrapping when narrow), each with a 16 px chevron: **or choose PDF pages** and **or type words**.
- Consumer provides: the icon, the title, the hint and the tap handler (which opens the picker; iOS needs it to run straight from the tap).
- Once photos exist it becomes the **Add more photos** cell at the end of the photo grid (see PhotoTile).
