import {
  ApiClientError,
  type LinkSocialRequest,
  type SignInMethods,
  type SocialSignInRequest,
  type UnlinkAccountRequest,
} from "@language-app/core";
import { ACCOUNT_URL, INVITE_ONLY, nextPath, signInPath, TOO_MANY } from "./rules";

// Google on Sign in, Create account and Account (docs/design.md §10 screens 17–19): where it is
// offered, where the browser comes back to, what the errors it comes back with say, and
// Account's Connect and Disconnect.

/** The label Google's branding rules allow on Sign in and Create account. */
export const CONTINUE_WITH_GOOGLE = "Continue with Google";
/** Account's button before deleting an account whose sign-in is a day old. */
export const SIGN_IN_WITH_GOOGLE = "Sign in with Google";

/**
 * Google returns only to an https address or to `localhost` (the one registered for the Mac's
 * own browser), so it is offered only there, and only when the server has the Google pair. The
 * iPhone over the LAN's plain HTTP (`http://192.168.x.x:5173`) would end on Google's error page.
 */
export function googleOffered(
  serverHasGoogle: boolean,
  { protocol, hostname }: { protocol: string; hostname: string },
): boolean {
  return serverHasGoogle && (protocol === "https:" || hostname === "localhost");
}

/**
 * Continue with Google: back to the page in `?next=` (or Home) once signed in; otherwise to Sign
 * in, keeping `next`, with `?error=<code>`.
 */
export function continueWithGoogle(search: string): SocialSignInRequest {
  const next = nextPath(search);
  return { provider: "google", callbackURL: next, errorCallbackURL: signInPath(next) };
}

/** Connect on Account: back to Account either way (a failure with `?error=<code>`). */
export const CONNECT_GOOGLE: LinkSocialRequest = {
  provider: "google",
  callbackURL: ACCOUNT_URL,
  errorCallbackURL: ACCOUNT_URL,
};

/** A fresh sign-in before deleting the account, with its own Google account preselected. */
export function signInWithGoogleAgain(email: string): SocialSignInRequest {
  return { ...CONNECT_GOOGLE, loginHint: email };
}

/** The code Google's return left in the address (`?error=not_invited`), if any. */
export function callbackError(search: string): string | null {
  return new URLSearchParams(search).get("error") || null;
}

/** The address without that error, so a reload doesn't show it again; `next` stays. */
export function withoutCallbackError(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("error");
  params.delete("error_description");
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

/**
 * What a screen says when the server didn't give Google's address: too many tries (Better Auth's
 * limit, §4 Accounts) as on Sign in, otherwise the API client's message ("Can't reach the server").
 */
export function googleStartError(error: unknown): string {
  if (error instanceof ApiClientError && error.code === "too_many_requests") return TOO_MANY;
  return error instanceof Error ? error.message : "Something went wrong";
}

export const GOOGLE_NOT_CONNECTED =
  "That Google account isn't connected to an account here. Sign in with your password, then connect Google in Settings.";
const CANCELLED = "Google sign-in was cancelled.";

/** What Sign in says, in red under the card, when Google came back without signing in. */
export function googleSignInError(code: string): string {
  switch (code) {
    // An email not on the invite list (its first Google sign-in).
    case "not_invited":
      return INVITE_ONLY;
    // An account with this email exists, and it isn't connected to Google.
    case "account_not_linked":
      return GOOGLE_NOT_CONNECTED;
    // Cancelled on Google's page.
    case "access_denied":
      return CANCELLED;
    default:
      return "Couldn't sign in with Google. Try again.";
  }
}

/** What Account says when Connect (or signing in again) came back with an error. */
export function googleAccountError(code: string, email: string): string {
  switch (code) {
    case "email_does_not_match":
      return `That Google account has another email. Connect the Google account of ${email}.`;
    case "account_already_linked_to_different_user":
      return "That Google account is already connected to another account here.";
    case "access_denied":
      return CANCELLED;
    default:
      return "Couldn't connect Google. Try again.";
  }
}

/**
 * Account's Google row under Sign-in methods, from the account's sign-in methods:
 * - `connected`: "Connected", with **Disconnect** (the account has a password too). Wherever it
 *   is viewed: disconnecting doesn't go to Google, so it works over the LAN as well.
 * - `onlyWay`: "Connected" only; Google is the account's only way to sign in, which Better Auth
 *   never removes.
 * - `connect`: **Connect**, where Google can be offered; nothing where it can't, or while the
 *   methods aren't known.
 */
export function googleRow(
  methods: SignInMethods | null,
  offered: boolean,
): "connected" | "onlyWay" | "connect" | null {
  if (methods === null) return null;
  if (methods.some((method) => method.providerId === "google")) {
    return methods.some((method) => method.providerId === "credential") ? "connected" : "onlyWay";
  }
  return offered ? "connect" : null;
}

/** Under the rows of a Google-only account, so the missing Disconnect isn't a mystery. */
export const GOOGLE_ONLY_WAY = "Google is your only way to sign in, so it can't be disconnected.";
export const DISCONNECTING = "Disconnecting…";

/** Disconnect's request: the Google sign-in method by its id; null when there is none. */
export function disconnectGoogle(methods: SignInMethods | null): UnlinkAccountRequest | null {
  const google = methods?.find((method) => method.providerId === "google");
  return google ? { accountId: google.id } : null;
}

/** The sign-in methods once one is gone. */
export const withoutMethod = (methods: SignInMethods, id: string): SignInMethods =>
  methods.filter((method) => method.id !== id);

/**
 * What Account says once Google is disconnected. A verified email (the developer account) is
 * linked again by its next Google sign-in (§4 Accounts), so it says so; any other account's
 * Google sign-in then answers that it isn't connected.
 */
export function disconnected({ emailVerified }: { emailVerified: boolean }): string {
  return emailVerified
    ? "Google disconnected. Continue with Google still signs in to this account and connects it again."
    : "Google disconnected.";
}

/** Why Disconnect didn't work, in red under the rows; Google stays connected. */
export function disconnectError(error: unknown): string {
  switch (error instanceof ApiClientError ? error.code : null) {
    // Better Auth wants a sign-in from within the last day to remove a sign-in method.
    case "SESSION_NOT_FRESH":
      return "Your last sign-in was more than a day ago. Sign out and in again, then disconnect Google.";
    // The password went elsewhere meanwhile (the screen doesn't offer it otherwise).
    case "FAILED_TO_UNLINK_LAST_ACCOUNT":
      return GOOGLE_ONLY_WAY;
    // Disconnected elsewhere meanwhile.
    case "ACCOUNT_NOT_FOUND":
      return "Google was already disconnected.";
    case "too_many_requests":
      return TOO_MANY;
    case "network":
      return (error as Error).message;
    default:
      return "Couldn't disconnect Google. Try again.";
  }
}
