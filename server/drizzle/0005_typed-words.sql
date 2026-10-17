-- Trigram similarity for typed words' suggestions and "Did you mean…?" (docs/design.md §7). Part of
-- PostgreSQL and a trusted extension, so the database owner may create it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "dictionary_forms" (
	"form" text NOT NULL,
	"lemma" text NOT NULL,
	"pos" text NOT NULL,
	CONSTRAINT "dictionary_forms_form_lemma_pos" UNIQUE("form","lemma","pos")
);
--> statement-breakpoint
-- Every import before M10 photographed pages.
ALTER TABLE "imports" ADD COLUMN "source" text DEFAULT 'photos' NOT NULL;--> statement-breakpoint
CREATE INDEX "dictionary_forms_lower_form" ON "dictionary_forms" USING btree (lower("form"));--> statement-breakpoint
CREATE INDEX "dictionary_entries_lower_lemma_trgm" ON "dictionary_entries" USING gin (lower("lemma") gin_trgm_ops);
