ALTER TABLE "card_results" DROP CONSTRAINT "card_results_session_word";--> statement-breakpoint
ALTER TABLE "card_results" ADD COLUMN "round" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "card_results" ADD CONSTRAINT "card_results_session_word_round" UNIQUE("session_id","user_word_id","round");