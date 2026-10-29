-- The learner's own groups (docs/design.md §5, M13.2). Only adds: the groups, the words in each, and
-- the group a `group` session practised (null for the other sources, and once the group is
-- deleted). `source` is plain text, so `group` needs no change to it.
CREATE TABLE "group_words" (
	"group_id" integer NOT NULL,
	"user_word_id" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_words_group_id_user_word_id_pk" PRIMARY KEY("group_id","user_word_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "groups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "group_id" integer;--> statement-breakpoint
ALTER TABLE "group_words" ADD CONSTRAINT "group_words_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_words" ADD CONSTRAINT "group_words_user_word_id_user_words_id_fk" FOREIGN KEY ("user_word_id") REFERENCES "public"."user_words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_words_user_word" ON "group_words" USING btree ("user_word_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_user_name" ON "groups" USING btree ("user_id",lower("name"));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;