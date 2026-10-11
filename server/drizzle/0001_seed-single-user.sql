-- The prototype's single learner (docs/design.md §4). On a fresh database this row gets id 1,
-- which is SINGLE_USER_ID in server/src/user.ts.
INSERT INTO "users" ("name", "learner_language", "target_language") VALUES ('Learner', 'en', 'de');
