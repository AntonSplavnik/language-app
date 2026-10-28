import { z } from "zod";

// Accounts (docs/design.md §4 Accounts, §9.4). The endpoints are Better Auth's, under /api/auth: their answers
// carry ids as strings, and their errors are `{ code, message }` rather than our `{ error }`.

/** Usernames: 3–30 letters, digits, `.` and `_`; unique ignoring case (stored lower-case). */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const Username = z
  .string()
  .min(USERNAME_MIN)
  .max(USERNAME_MAX)
  .regex(USERNAME_PATTERN, "Only letters, digits, . and _");
export const Password = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

/** Create account: Better Auth's username is optional, ours isn't (§9.4). */
export const SignUpRequest = z.object({
  email: z.email(),
  username: Username,
  password: Password,
});
export type SignUpRequest = z.infer<typeof SignUpRequest>;

export const SignInEmailRequest = z.object({ email: z.string().min(1), password: z.string() });
export type SignInEmailRequest = z.infer<typeof SignInEmailRequest>;

export const SignInUsernameRequest = z.object({
  username: z.string().min(1),
  password: z.string(),
});
export type SignInUsernameRequest = z.infer<typeof SignInUsernameRequest>;

/** The signed-in account as Better Auth returns it; the id is a string ("2"). */
export const AuthUser = z.object({
  id: z.string(),
  email: z.string(),
  /**
   * True for the claimed developer account and accounts made with Google. Such an account's
   * Google sign-in links Google by itself (§4 Accounts), also after Disconnect.
   */
  emailVerified: z.boolean(),
  /** Lower-case; null only for an account made without one. */
  username: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  /** The username as typed. */
  displayUsername: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  aiEnabled: z.boolean(),
});
export type AuthUser = z.infer<typeof AuthUser>;

/** `GET /api/auth/get-session`: the session and its account, or null when signed out. */
export const AuthSession = z
  .object({
    session: z.object({ id: z.string(), userId: z.string(), expiresAt: z.string() }),
    user: AuthUser,
  })
  .nullable();
export type AuthSession = z.infer<typeof AuthSession>;

/** Sign-up and both sign-ins answer with the account they signed in. */
export const SignedInResponse = z.object({ user: AuthUser });
export type SignedInResponse = z.infer<typeof SignedInResponse>;

export const SignOutResponse = z.object({ success: z.boolean() });
export type SignOutResponse = z.infer<typeof SignOutResponse>;

/**
 * Delete account (`POST /api/auth/delete-user`): the password of an account that has one; an
 * account without (Google only) sends none and needs a sign-in from within the last day.
 */
export const DeleteAccountRequest = z.object({ password: z.string().max(PASSWORD_MAX).optional() });
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequest>;

export const DeleteAccountResponse = z.object({ success: z.boolean(), message: z.string() });
export type DeleteAccountResponse = z.infer<typeof DeleteAccountResponse>;

/**
 * `GET /api/auth/list-accounts`: the account's ways to sign in, `credential` (a password) and
 * `google`. Better Auth sends more; the schema keeps these.
 */
export const SignInMethods = z.array(z.object({ id: z.string(), providerId: z.string() }));
export type SignInMethods = z.infer<typeof SignInMethods>;

/**
 * Disconnect on Account (`POST /api/auth/unlink-account`, §9.4): the sign-in method to remove,
 * by its `id` from list-accounts (Better Auth 1.7.7 calls it `accountId`; it isn't Google's
 * account id). Only Google: the server keeps the password and the last way to sign in.
 */
export const UnlinkAccountRequest = z.object({ accountId: z.string().min(1) });
export type UnlinkAccountRequest = z.infer<typeof UnlinkAccountRequest>;

export const UnlinkAccountResponse = z.object({ status: z.boolean() });
export type UnlinkAccountResponse = z.infer<typeof UnlinkAccountResponse>;

/**
 * A page of this app to return to after Google: a path from the root, never another site
 * (`//x.example`, `https://…`). Better Auth checks it again.
 */
const AppPath = z
  .string()
  .regex(/^\/(?![/\\])/, "A path of this app, starting with one /")
  .max(2000);

/**
 * Continue with Google (`POST /api/auth/sign-in/social`, §9.4): where the browser returns when
 * signed in, and where it returns with `?error=<code>` when not. `loginHint` preselects a Google
 * account (Account's "Sign in with Google" before deleting).
 */
export const SocialSignInRequest = z.object({
  provider: z.literal("google"),
  callbackURL: AppPath,
  errorCallbackURL: AppPath,
  loginHint: z.string().max(320).optional(),
});
export type SocialSignInRequest = z.infer<typeof SocialSignInRequest>;

/** Connect on Account (`POST /api/auth/link-social`), while signed in. */
export const LinkSocialRequest = z.object({
  provider: z.literal("google"),
  callbackURL: AppPath,
  errorCallbackURL: AppPath,
});
export type LinkSocialRequest = z.infer<typeof LinkSocialRequest>;

/** Both answer with Google's address, which the web app opens (`location.href`). */
export const SocialRedirectResponse = z.object({ url: z.url() });
export type SocialRedirectResponse = z.infer<typeof SocialRedirectResponse>;

/**
 * Who can create an account (SIGNUP_MODE, §4 Accounts): `invite`, only an email on the invite
 * list; `open`, anyone.
 */
export const SignUpMode = z.enum(["invite", "open"]);
export type SignUpMode = z.infer<typeof SignUpMode>;

/**
 * `GET /api/sign-in-options` (ours, open to everyone): whether the server has the Google pair,
 * so the screens offer Google only where it can work, and its sign-up mode, so Create account
 * says "Invite only" only while it is (§10).
 */
export const SignInOptions = z.object({ google: z.boolean(), signUp: SignUpMode });
export type SignInOptions = z.infer<typeof SignInOptions>;

/** Better Auth's error body. The rate limiter's 429 has no code, only a message. */
export const AuthErrorBody = z.object({ code: z.string().optional(), message: z.string() });
