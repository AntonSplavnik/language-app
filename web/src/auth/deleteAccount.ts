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

/** An account without a password whose sign-in is more than a day old (Better Auth's "fresh"). */
const isExpired = (error: unknown) =>
  error instanceof ApiClientError && error.code === "SESSION_EXPIRED";

/**
 * Whether the failure asks for a fresh sign-in that Google can give here: the confirmation then
 * offers Sign in with Google, coming back to Account.
 */
export const needsGoogleAgain = (error: unknown, googleOffered: boolean) =>
  googleOffered && isExpired(error);

/**
 * What a failed deletion says, under the password field. A day-old sign-in of an account without
 * a password: sign in with Google again where it is offered, otherwise sign out and in again.
 */
export function deleteAccountError(
  error: unknown,
  { googleOffered = false }: { googleOffered?: boolean } = {},
): string {
  if (isExpired(error)) {
    return googleOffered
      ? "Your last sign-in was more than a day ago. Sign in with Google again, then delete the account."
      : "Sign out and in again, then delete the account.";
  }
  switch (error instanceof ApiClientError ? error.code : null) {
    case "INVALID_PASSWORD":
      return "Wrong password";
    case "PASSWORD_REQUIRED":
      return "Enter your password";
    case "too_many_requests":
      return TOO_MANY;
    default:
      return error instanceof Error ? error.message : "Something went wrong";
  }
}
