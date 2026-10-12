ALTER TABLE "dictionary_entries" ADD COLUMN "ipa" text;--> statement-breakpoint
ALTER TABLE "dictionary_entries" ADD COLUMN "audio_file" text;--> statement-breakpoint
ALTER TABLE "dictionary_entries" ADD COLUMN "audio_url" text;--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "ipa" text;--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "audio_file" text;--> statement-breakpoint
ALTER TABLE "words" ADD COLUMN "audio_url" text;