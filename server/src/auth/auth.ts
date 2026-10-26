import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from "@language-app/core";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { username } from "better-auth/plugins";
import type { Db } from "../db/client";
import * as schema from "../db/schema";
import { isInvited, markInviteUsed } from "./invites";

// Accounts with Better Auth, inside our own server (docs/design.md §17.3, §16 Better Auth). Its
// tables are ours (db/schema.ts); the web app calls its endpoints under /api/auth like any other.

export type SignupMode = "invite" | "open";

export type AuthOptions = {
  db: Db;
  /** Signs the session cookie; at least 32 characters (BETTER_AUTH_SECRET). */
  secret: string;
  signupMode: SignupMode;
  /** Vite's port: the browser opens the app, and signs in, on it (§14). */
  webPort: number;
  /** The sign-in and sign-up limits (§17.3). Off only in tests that sign in many times. */
  rateLimit?: boolean;
  /** Silences Better Auth's own log lines (tests, where refusals are expected). */
  quiet?: boolean;
};

const SIXTY_DAYS = 60 * 24 * 60 * 60;
const ONE_DAY = 24 * 60 * 60;
/** Attempts per IP on each sign-in and sign-up path, per minute (§17.3). */
const ATTEMPTS = { window: 60, max: 5 };
/** Vite's proxy, the way in to the server on the Mac. */
const LOOPBACK = ["127.0.0.1", "::1"];

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
      // Runs before any user is created, by password sign-up or (M12.3) a first Google sign-in.
      validateUserInfo: async ({ user, source }) => {
        if (signupMode === "open" || source.action === "sign-in") return;
        const email = typeof user.email === "string" ? user.email : "";
        if (!email || !(await isInvited(db, email))) {
          return { error: "not_invited", errorDescription: "This email is not on the invite list" };
        }
      },
    },
    databaseHooks: {
      user: {
        create: {
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
    },
    session: {
      modelName: "authSessions",
      expiresIn: SIXTY_DAYS,
      // Extended by each day's use, through GET /api/auth/get-session.
      updateAge: ONE_DAY,
    },
    // Explicit names: never `usePlural`, which would pick our practice `sessions`.
    account: { modelName: "authAccounts" },
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
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      // Keep: with it off, a refused sign-up would answer with a fake success.
      autoSignIn: true,
    },
    plugins: [username({ minUsernameLength: USERNAME_MIN, maxUsernameLength: USERNAME_MAX })],
    // It would reveal usernames, and the form doesn't need it.
    disabledPaths: ["/is-username-available"],
    hooks: {
      // Sign-up asks for a username (Better Auth's is optional), and `name` is the username.
      before: createAuthMiddleware(async (ctx) => {
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
