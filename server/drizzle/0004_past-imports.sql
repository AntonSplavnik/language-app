ALTER TABLE "sessions" ADD COLUMN "import_id" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- The `last_import` source became `import` (docs/design.md §5, §8.1). A `last_import` session
-- practised the learner's most recent `done` import when it started, so it gets that import; one
-- started before any import was done keeps a null import_id.
UPDATE "sessions" SET
  "source" = 'import',
  "import_id" = (
    SELECT "imports"."id" FROM "imports"
    WHERE "imports"."user_id" = "sessions"."user_id"
      AND "imports"."status" = 'done'
      AND "imports"."completed_at" <= "sessions"."started_at"
    ORDER BY "imports"."completed_at" DESC, "imports"."id" DESC
    LIMIT 1
  )
WHERE "source" = 'last_import';
