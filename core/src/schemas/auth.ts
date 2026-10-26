import { z } from "zod";

// Accounts (docs/design.md §17.3). The endpoints are Better Auth's, under /api/auth: their answers
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

/** Create account: Better Auth's username is optional, ours isn't (§17.3). */
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

/** Better Auth's error body. The rate limiter's 429 has no code, only a message. */
export const AuthErrorBody = z.object({ code: z.string().optional(), message: z.string() });
