-- Google's tokens are not kept (docs/design.md §4 Accounts, §5 auth_accounts): the app never calls
-- Google after sign-in, so the tokens Better Auth stored with each Google sign-in method before
-- M12.3b are cleared. Google's account id, the scope and every password row stay as they are.
-- Running it again, or on a database without such rows, changes nothing.
UPDATE "auth_accounts" SET
  "access_token" = NULL,
  "refresh_token" = NULL,
  "id_token" = NULL,
  "access_token_expires_at" = NULL,
  "refresh_token_expires_at" = NULL
WHERE "provider_id" <> 'credential'
  AND (
    "access_token" IS NOT NULL
    OR "refresh_token" IS NOT NULL
    OR "id_token" IS NOT NULL
    OR "access_token_expires_at" IS NOT NULL
    OR "refresh_token_expires_at" IS NOT NULL
  );
