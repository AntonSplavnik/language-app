-- Themes (docs/design.md §19, M13.1). Only adds: the existing words get their themes when the
-- dictionary is loaded again with its themes (import:wiktionary), not here.
CREATE TABLE "dictionary_themes" (
	"lemma" text NOT NULL,
	"pos" text NOT NULL,
	"article" text,
	"themes" text[] NOT NULL,
	CONSTRAINT "dictionary_themes_identity" UNIQUE NULLS NOT DISTINCT("lemma","pos","article")
);
--> statement-breakpoint
ALTER TABLE "user_words" ADD COLUMN "themes" text[];--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "themes" text[];