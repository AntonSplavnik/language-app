import { ApiClientError, type SignInMethods } from "@language-app/core";
import { TOO_MANY } from "./rules";

// Delete account on Account (docs/design.md §10 screen 19): the confirmation's wording, when it
// needs the password, and what a failure says in place.

export const DELETE_QUESTION =
  "Delete your account and all its words, imports and practice history?";
export const DELETE_WARNING = "This can't be undone.";
/** What Sign in says right after the account was deleted. */
export const ACCOUNT_DELETED = "Your account was deleted.";

/**
 * Whether the account signs in with a password, so deleting it asks for that. Not known (the list
 * didn't load): ask, as every account but a Google-only one has one.
 */
export const hasPassword = (methods: SignInMethods | null) =>
  methods === null || methods.some((method) => method.providerId === "credential");

/** Delete is enabled once the password is typed, at once for an account without one. */
export const canConfirmDelete = ({
  needsPassword,
  password,
}: {
  needsPassword: boolean;
  password: string;
}) => !needsPassword || password.length > 0;

/** What a failed deletion says, under the password field. */
export function deleteAccountError(error: unknown): string {
  switch (error instanceof ApiClientError ? error.code : null) {
    case "INVALID_PASSWORD":
      return "Wrong password";
    case "PASSWORD_REQUIRED":
      return "Enter your password";
    // An account without a password whose sign-in is more than a day old (Better Auth's "fresh").
    case "SESSION_EXPIRED":
      return "Sign out and in again, then delete the account.";
    case "too_many_requests":
      return TOO_MANY;
    default:
      return error instanceof Error ? error.message : "Something went wrong";
  }
}
