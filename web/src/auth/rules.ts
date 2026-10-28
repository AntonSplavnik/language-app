import {
  ApiClientError,
  PASSWORD_MAX,
  PASSWORD_MIN,
  type SignInOptions,
  type SignUpMode,
  SignUpRequest,
  Username,
} from "@language-app/core";

// Sign in and Create account (docs/design.md §10 screens 17 and 18): the field rules, where a
// signed-out page goes, what the server's sign-in options mean, and the wording for each error.

export const SIGN_IN = "/signin";
export const SIGN_UP = "/signup";
/** Account, the first row of Settings (§10 screen 19). */
export const ACCOUNT_URL = "/settings/account";

/** The only pages a signed-out learner can open. */
export const isAuthPage = (pathname: string) => pathname === SIGN_IN || pathname === SIGN_UP;

/** The one field takes an email or a username: with an `@` it is an email. */
export const signInMethod = (login: string): "email" | "username" =>
  login.includes("@") ? "email" : "username";

/** Sign in for a page opened signed out, that page kept in `?next=` (Home needs none). */
export function signInPath(page: string): string {
  const pathname = page.split(/[?#]/)[0] ?? "/";
  if (pathname === "/" || isAuthPage(pathname)) return SIGN_IN;
  return `${SIGN_IN}?next=${encodeURIComponent(page)}`;
}

/**
 * Where signing in returns to: the `next` page when it is one of this app's, otherwise Home. A
 * link from elsewhere (`//evil.example`, `https://…`) never leaves the app.
 */
export function nextPath(search: string): string {
  const next = new URLSearchParams(search).get("next");
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (isAuthPage(next.split(/[?#]/)[0] ?? "")) return "/";
  return next;
}

/**
 * Where the app sends a page, given who is signed in, or null to show it. Signed out, only Sign in
 * and Create account open, and any other page waits in `?next=` (not after Sign out, which leaves
 * for good). Signed in, those two go on to `next`.
 */
export function redirectFor(
  who: { signedIn: true } | { signedIn: false; byChoice?: boolean },
  pathname: string,
  search: string,
): string | null {
  if (who.signedIn) return isAuthPage(pathname) ? nextPath(search) : null;
  if (isAuthPage(pathname)) return null;
  return who.byChoice ? SIGN_IN : signInPath(pathname + search);
}

/** The server's sign-in options as the app knows them; `signUp` is null when it couldn't ask. */
export type KnownSignInOptions = { google: boolean; signUp: SignUpMode | null };

/**
 * Asks the server's sign-in options when the app starts. Not knowing means no Google button and no
 * invite line, never a failed start (§10).
 */
export const signInOptionsOrNone = (ask: () => Promise<SignInOptions>) =>
  ask().then(
    (options): KnownSignInOptions => options,
    (): KnownSignInOptions => ({ google: false, signUp: null }),
  );

/** Create account's line under its title while sign-up needs an invite (§10 screen 18). */
export const INVITE_ONLY_NOTE = "Invite only: use the email your invite was sent to.";
export const signUpNote = (signUp: SignUpMode | null): string | null =>
  signUp === "invite" ? INVITE_ONLY_NOTE : null;

/** A refused sign-up (`not_invited`), which only invite mode sends. */
export const INVITE_ONLY = "This app is invite-only. Ask for an invite first.";
export const TOO_MANY = "Too many attempts. Try again in a minute.";
export const WRONG_LOGIN = "Wrong email, username or password";
export const USERNAME_HINT = "3–30 letters, digits, . or _";
export const PASSWORD_HINT = `At least ${PASSWORD_MIN} characters`;
const PASSWORD_TOO_LONG = `At most ${PASSWORD_MAX} characters`;
const EMAIL_INVALID = "Enter a valid email address";

const codeOf = (error: unknown) => (error instanceof ApiClientError ? error.code : null);
/** Any other failure says what the API client says ("Can't reach the server"). */
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

/** What a failed sign-in says, under the card. A wrong password and an unknown name read alike. */
export function signInError(error: unknown): string {
  switch (codeOf(error)) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_USERNAME_OR_PASSWORD":
    // A name that can't be anyone's is just as wrong.
    case "INVALID_EMAIL":
    case "INVALID_USERNAME":
    case "USERNAME_TOO_SHORT":
    case "USERNAME_TOO_LONG":
    case "PASSWORD_TOO_LONG":
      return WRONG_LOGIN;
    case "too_many_requests":
      return TOO_MANY;
    case "not_invited":
      return INVITE_ONLY;
    default:
      return errorMessage(error);
  }
}

export type SignUpFields = { email: string; username: string; password: string };
export type SignUpField = keyof SignUpFields;
export type FieldErrors = Partial<Record<SignUpField, string>>;

/** Create account's field rules, checked before anything is sent. */
export function signUpFieldErrors({ email, username, password }: SignUpFields): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = "Enter your email address";
  else if (!SignUpRequest.shape.email.safeParse(email.trim()).success) errors.email = EMAIL_INVALID;
  if (!Username.safeParse(username.trim()).success) errors.username = USERNAME_HINT;
  if (password.length < PASSWORD_MIN) errors.password = PASSWORD_HINT;
  else if (password.length > PASSWORD_MAX) errors.password = PASSWORD_TOO_LONG;
  return errors;
}

/** Where a failed sign-up's message goes, under its field or (`null`) under the card, and what it says. */
export function signUpError(error: unknown): { field: SignUpField | null; message: string } {
  switch (codeOf(error)) {
    case "USERNAME_IS_ALREADY_TAKEN":
      return { field: "username", message: "This username is taken" };
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
    case "USER_ALREADY_EXISTS":
      return { field: "email", message: "An account with this email exists. Sign in instead." };
    case "INVALID_EMAIL":
      return { field: "email", message: EMAIL_INVALID };
    case "USERNAME_REQUIRED":
    case "USERNAME_TOO_SHORT":
    case "USERNAME_TOO_LONG":
    case "INVALID_USERNAME":
      return { field: "username", message: USERNAME_HINT };
    case "PASSWORD_TOO_SHORT":
      return { field: "password", message: PASSWORD_HINT };
    case "PASSWORD_TOO_LONG":
      return { field: "password", message: PASSWORD_TOO_LONG };
    case "not_invited":
      return { field: null, message: INVITE_ONLY };
    case "too_many_requests":
      return { field: null, message: TOO_MANY };
    default:
      return { field: null, message: errorMessage(error) };
  }
}
