-- Practising one theme (docs/design.md §5, §8.1; M13.1). Only adds: the theme a `theme` session
-- practised, null for the other sources. `source` is plain text, so `theme` needs no change to it.
ALTER TABLE "sessions" ADD COLUMN "theme" text;
