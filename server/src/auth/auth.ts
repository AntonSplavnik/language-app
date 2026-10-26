import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from "@language-app/core";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { username } from "better-auth/plugins";
import type { Db } from "../db/client";
import * as schema from "../db/schema";
import { isInvited, markInviteUsed, removeInvite } from "./invites";
import { uniqueUsername } from "./usernames";

// Accounts with Better Auth, inside our own server (docs/design.md §17.3, §16 Better Auth). Its
// tables are ours (db/schema.ts); the web app calls its endpoints under /api/auth like any other.

export type SignupMode = "invite" | "open";

export type GoogleClient = { clientId: string; clientSecret: string };

export type AuthOptions = {
  db: Db;
  /** Signs the session cookie; at least 32 characters (BETTER_AUTH_SECRET). */
  secret: string;
  signupMode: SignupMode;
  /** Vite's port: the browser opens the app, and signs in, on it (§14). */
  webPort: number;
  /** The sign-in and sign-up limits (§17.3). Off only in tests that sign in many times. */
  rateLimit?: boolean;
  /** The Google OAuth client (GOOGLE_CLIENT_ID / _SECRET); without it Google isn't offered. */
  google?: GoogleClient;
  /** Silences Better Auth's own log lines (tests, where refusals are expected). */
  quiet?: boolean;
};

const SIXTY_DAYS = 60 * 24 * 60 * 60;
const ONE_DAY = 24 * 60 * 60;
/** Attempts per IP on each sign-in and sign-up path, per minute (§17.3). */
const ATTEMPTS = { window: 60, max: 5 };
/** Continue with Google per IP, per minute: each makes a state row, none checks a password. */
const GOOGLE_STARTS = { window: 60, max: 10 };
/** Vite's proxy, the way in to the server on the Mac. */
const LOOPBACK = ["127.0.0.1", "::1"];

/**
 * Google's tokens are never kept (§4 Accounts): the app never calls Google after sign-in, so
 * every write of a Google sign-in method leaves these columns empty. Google's account id and the
 * scope it granted are kept.
 */
const NO_PROVIDER_TOKENS = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
};
const TOKEN_FIELDS = Object.keys(NO_PROVIDER_TOKENS);

/**
 * The addresses the Mac's browser and the iPhone open the app on (§14): `localhost`, a LAN
 * address or a `.local` name, on Vite's port. The base URL follows the request's host among them,
 * and requests that send cookies must come from one of them.
 */
export function devHosts(webPort: number): string[] {
  return [
    `localhost:${webPort}`,
    `127.0.0.1:${webPort}`,
    `192.168.*.*:${webPort}`,
    `10.*.*.*:${webPort}`,
    `*.local:${webPort}`,
  ];
}

export function createAuth({
  db,
  secret,
  signupMode,
  webPort,
  rateLimit = true,
  google,
  quiet = false,
}: AuthOptions) {
  const hosts = devHosts(webPort);

  return betterAuth({
    secret,
    // Several addresses over plain HTTP on the Mac. The fallback serves calls without a request
    // (the scripts). Production (M12.4) gets a static https address instead.
    baseURL: { allowedHosts: hosts, protocol: "auto", fallback: `http://localhost:${webPort}` },
    trustedOrigins: hosts.map((host) => `http://${host}`),
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    telemetry: { enabled: false },
    logger: { disabled: quiet },
    advanced: {
      // users.id and every user_id stay integers; Better Auth's answers carry them as strings.
      database: { generateId: "serial" },
      // Never `Secure` here: the iPhone opens the app over plain HTTP, where a Secure cookie is
      // never sent back. Decided once at startup, so it must not depend on NODE_ENV.
      useSecureCookies: false,
      // Better Auth skips the origin check when NODE_ENV is "test"; ours always runs it.
      disableOriginCheck: false,
      // The rate limits count per client address. The server listens on 127.0.0.1 only, so every
      // request comes through Vite, which adds the device's address to x-forwarded-for: the
      // address after the last loopback hop is the client's. (The Mac's own browser, itself on
      // loopback, shares one count.)
      ipAddress: { trustedProxies: LOOPBACK },
    },
    user: {
      modelName: "users",
      additionalFields: {
        // Required columns Better Auth never writes must be declared, or every auth request
        // fails its schema check. `input: false`: no client can set them.
        learnerLanguage: { type: "string", required: false, defaultValue: "en", input: false },
        targetLanguage: { type: "string", required: false, defaultValue: "de", input: false },
        aiEnabled: { type: "boolean", required: false, defaultValue: false, input: false },
      },
      // Runs before a user is created ("create-user": a password sign-up or a first Google
      // sign-in), and also when Google signs in again ("sign-in") or is linked to an existing
      // account ("link-account": Connect, or the developer account's verified email). Only a new
      // account needs an invite; once it exists, the list doesn't matter.
      validateUserInfo: async ({ user, source }) => {
        if (signupMode === "open" || source.action !== "create-user") return;
        const email = typeof user.email === "string" ? user.email : "";
        if (!email || !(await isInvited(db, email))) {
          return { error: "not_invited", errorDescription: "This email is not on the invite list" };
        }
      },
      // Settings → Account → Delete account (§4 Accounts). Better Auth deletes the users row
      // (after its sessions and sign-in methods), and our tables go with it: everything a learner
      // owns references users ON DELETE CASCADE (§5). It wants the password, or a session
      // younger than a day (`freshAge`); the hook below makes an account with a password give it.
      deleteUser: {
        enabled: true,
        // An invite for the account's email that was never linked to it (added again later)
        // would let the email sign up again; the linked one has gone with the cascade.
        afterDelete: async (user) => {
          if (typeof user.email !== "string") return;
          try {
            await removeInvite(db, user.email);
          } catch (error) {
            // The account is gone either way; only a stray invite would be left.
            console.error("Couldn't remove the deleted account's invite", error);
          }
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Google gives no username (the username plugin's own hook, which runs first, leaves
          // it out), so an account made with Google gets one from its email, unique, and `name`
          // is that username, as on a password sign-up.
          before: async (user) => {
            if (typeof user.username === "string" && user.username !== "") return;
            const name = await uniqueUsername(db, String(user.email ?? ""));
            return { data: { ...user, username: name, displayUsername: name, name } };
          },
          // Runs once the sign-up's transaction has committed, so the user row exists.
          after: async (user, context) => {
            try {
              await markInviteUsed(db, user.email, Number(user.id));
            } catch (error) {
              // Bookkeeping only: the account exists and is signed in either way.
              context?.context.logger.error("Couldn't mark the invite used", error);
            }
          },
        },
      },
      // Every way Better Auth 1.7.7 writes a Google sign-in method goes through these: a first
      // Google sign-in (create), signing in again (update), Connect (create, or update when that
      // Google account is already connected) and the implicit link of a verified email (create).
      account: {
        create: {
          before: async (account) =>
            account.providerId === "credential"
              ? undefined
              : { data: { ...account, ...NO_PROVIDER_TOKENS } },
        },
        // An update says nothing of the row's provider; one that writes tokens is Google's (a
        // password change writes only `password`).
        update: {
          before: async (data) =>
            TOKEN_FIELDS.some((field) => field in data)
              ? { data: { ...data, ...NO_PROVIDER_TOKENS } }
              : undefined,
        },
      },
    },
    session: {
      modelName: "authSessions",
      expiresIn: SIXTY_DAYS,
      // Extended by each day's use, through GET /api/auth/get-session.
      updateAge: ONE_DAY,
    },
    account: {
      // Explicit names: never `usePlural`, which would pick our practice `sessions`.
      modelName: "authAccounts",
      // No copy of a sign-in method in a cookie (Better Auth's default with a database; set so
      // it stays that way). Linking stays as it is: implicit for a verified email (§4 Accounts),
      // and never the last way to sign in removed (`allowUnlinkingAll` off).
      storeAccountCookie: false,
    },
    verification: { modelName: "authVerifications" },
    rateLimit: {
      // Off by default outside NODE_ENV=production, so switched on explicitly.
      enabled: rateLimit,
      storage: "database",
      modelName: "authRateLimits",
      customRules: {
        "/sign-in/email": ATTEMPTS,
        "/sign-in/username": ATTEMPTS,
        "/sign-up/email": ATTEMPTS,
        // It checks a password too.
        "/delete-user": ATTEMPTS,
        // Continue with Google checks no password; Better Auth's rule for every /sign-in path
        // (3 per 10 s) would trip over a few tries in a row, from the Mac's one shared count.
        "/sign-in/social": GOOGLE_STARTS,
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      // Keep: with it off, a refused sign-up would answer with a fake success.
      autoSignIn: true,
    },
    // Continue with Google and Connect (§4 Accounts), with Google's default scopes only
    // (openid, email, profile: no warning screen, no verification). Google's account chooser
    // every time, so another Google account can be picked after a refusal.
    socialProviders: google
      ? {
          google: {
            clientId: google.clientId,
            clientSecret: google.clientSecret,
            prompt: "select_account",
          },
        }
      : {},
    plugins: [username({ minUsernameLength: USERNAME_MIN, maxUsernameLength: USERNAME_MAX })],
    disabledPaths: [
      // It would reveal usernames, and the form doesn't need it.
      "/is-username-available",
      // They hand out, refresh or use Google's tokens, which aren't kept (§4 Accounts): without
      // them they could only fail, or ask Google.
      "/get-access-token",
      "/refresh-token",
      "/account-info",
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/delete-user") return requirePasswordToDelete(ctx);
        if (ctx.path === "/unlink-account") return keepPassword(ctx);
        // Sign-up asks for a username (Better Auth's is optional), and `name` is the username.
        if (ctx.path !== "/sign-up/email") return;
        const typed: unknown = ctx.body?.username;
        if (typeof typed !== "string" || typed.trim() === "") {
          throw new APIError("BAD_REQUEST", {
            code: "USERNAME_REQUIRED",
            message: "A username is required",
          });
        }
        return { context: { body: { ...ctx.body, name: typed } } };
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Whether the server offers Google: it was started with the Google pair. */
export const offersGoogle = (auth: Auth) => auth.options.socialProviders.google !== undefined;

type MiddlewareContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/**
 * Deleting an account with a password needs that password (§4 Accounts): Better Auth would also
 * take a session younger than a day instead, which is meant for accounts without one (Google).
 * Without a session the endpoint itself answers 401.
 */
async function requirePasswordToDelete(ctx: MiddlewareContext): Promise<void> {
  const password: unknown = ctx.body?.password;
  if (typeof password === "string" && password !== "") return;
  const session = await getSessionFromCtx(ctx, { disableRefresh: true });
  if (!session) return;
  if (await ctx.context.internalAdapter.findCredentialAccount(session.user.id)) {
    throw new APIError("BAD_REQUEST", {
      code: "PASSWORD_REQUIRED",
      message: "Enter your password to delete the account",
    });
  }
}

/**
 * Disconnect removes Google, never the password (§4 Accounts): Better Auth would unlink any
 * sign-in method but the last, and an account left with Google only can be deleted without a
 * password from a sign-in under a day old, which the password rule above is there to prevent.
 * An unknown id, a missing session or a stale one are left to the endpoint.
 */
async function keepPassword(ctx: MiddlewareContext): Promise<void> {
  const id: unknown = ctx.body?.accountId;
  if (typeof id !== "string") return;
  const session = await getSessionFromCtx(ctx, { disableRefresh: true });
  if (!session) return;
  const methods = await ctx.context.internalAdapter.findAccounts(session.user.id);
  if (methods.find((method) => method.id === id)?.providerId === "credential") {
    throw new APIError("BAD_REQUEST", {
      code: "CANNOT_UNLINK_PASSWORD",
      message: "The password can't be removed",
    });
  }
}
